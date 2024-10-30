import { sorted_by_numeric_strings } from '../base/array'
import { first, map, length } from '../base/iterator'
import { Logger } from '../base/log'
import type { Constructor } from '../base/types'
import type { BomItem } from './bom_item'
import { BomGroup } from './bom_group'
import { NetRef } from './net_ref'
import { KicadSch, type SchematicSheet, type SchematicSheetInstance } from './schematic'
import { SchematicBomVisitor } from './schematic_bom_visitor'
import type { EcadBlob } from '../base/ecad_blob'

const log = new Logger('kicanvas:project')

export class SchHierarchy {
  #files_by_name: Map<string, KicadSch> = new Map()
  #file_content: Map<string, string> = new Map()
  #sch: KicadSch[] = []
  #bom_items: BomItem[] = []
  #label_name_refs = new Map<string, NetRef[]>()
  #net_item_refs = new Map<string, NetRef>()
  #designator_refs = new Map<string, string>()
  #root_sch?: KicadSch

  get root_sch() {
    if (this.#root_sch) return this.#root_sch
    if (this.#sch.length === 1) return this.#sch[0]
    throw new Error('No root sch found')
  }

  find_labels_by_name(name: string) {
    return this.#label_name_refs.get(name)
  }

  find_net_item(uuid: string) {
    return this.#net_item_refs.get(uuid)
  }

  find_designator(d: string) {
    return this.#designator_refs.get(d)
  }

  get bom_items() {
    return this.#bom_items
  }

  #root_schematic_page?: ProjectPage
  #pages_by_path: Map<string, ProjectPage> = new Map()

  get pages() {
    return Array.from(this.#pages_by_path.values())
  }

  public load(sources: EcadBlob[]) {
    log.info(`Loading project from ${sources.constructor.name}`)

    for (const blob of sources) this.#load_blob(KicadSch, blob)
    const has_root_sch = this.#determine_schematic_hierarchy()
    const bom_items = (() => {
      if (this.has_schematics) {
        const sch_visitor = new SchematicBomVisitor()
        if (has_root_sch) {
          for (const page of this.pages) {
            const doc = page.document
            if (doc instanceof KicadSch) sch_visitor.visit(doc)
          }
        } else {
          for (const sch of this.schematics()) {
            sch_visitor.visit(sch)
          }
        }

        this.#designator_refs = sch_visitor.designator_refs
        if (sch_visitor.bom_list.length) return sch_visitor.bom_list
      }
      return []
    })()
    this.#sort_bom(bom_items)
  }

  #sort_bom(bom_list: BomItem[]) {
    const grouped_it_map: Map<string, BomGroup> = new Map()

    const group_by_fp_value = (itm: BomItem) => `${itm.Footprint}-${itm.Name}-${itm.DNP}`

    for (const it of bom_list) {
      const key = group_by_fp_value(it)

      if (!grouped_it_map.has(key)) {
        grouped_it_map.set(key, new BomGroup(it.Name, it.Datasheet, it.Description, it.Footprint, it.DNP))
      }
      grouped_it_map.get(key)!.addReference(it.Reference)
    }
    this.#bom_items = Array.from(grouped_it_map.values())
  }
  public get root_schematic_page() {
    return this.#root_schematic_page
  }

  #load_blob(document_class: Constructor<KicadSch>, blob: EcadBlob) {
    // in case we are loading filename with a leading slash e.g. from zip
    const names = blob.filename.split('/')
    const filename = names[names.length - 1]!
    if (this.#files_by_name.has(filename)) {
      return this.#files_by_name.get(filename)
    }
    const doc = new document_class(filename, blob.content)
    this.#files_by_name.set(filename, doc)

    this.#sch.push(doc)

    for (const it of doc.labels) {
      if (it.uuid) {
        const ref = new NetRef(doc.filename, it.text, it.uuid)
        this.#net_item_refs.set(it.uuid, ref)

        if (!this.#label_name_refs.has(it.text)) this.#label_name_refs.set(it.text, [])

        this.#label_name_refs.get(it.text)!.push(ref)
      }
    }

    this.#files_by_name.set(filename, doc)
    this.#file_content.set(filename, blob.content)
    return doc
  }

  public *files() {
    yield* this.#files_by_name.values()
  }

  *sch_in_order() {
    for (const p of this.pages) {
      yield this.file_by_name(p.filename) ??
        // AD HOC for ad converted sch
        this.file_by_name(p.sheet_path)
    }
  }

  public file_by_name(name: string) {
    return this.#files_by_name.get(name)
  }

  public *schematics() {
    for (const [, v] of this.#files_by_name) {
      if (v instanceof KicadSch) {
        yield v
      }
    }
  }

  public get has_schematics() {
    return length(this.schematics()) > 0
  }

  public page_by_path(project_path: string) {
    return this.#files_by_name.get(project_path)
  }

  public get is_empty() {
    return length(this.files()) === 0
  }

  #determine_schematic_hierarchy() {
    log.info('Determining schematic hierarchy')

    const paths_to_schematics = new Map<string, KicadSch>()
    const paths_to_sheet_instances = new Map<string, { sheet: SchematicSheet; instance: SchematicSheetInstance }>()

    for (const schematic of this.schematics()) {
      paths_to_schematics.set(`/${schematic.uuid}`, schematic)

      for (const sheet of schematic.sheets) {
        const sheet_sch = this.#files_by_name.get(sheet.sheetfile ?? '') as KicadSch

        if (!sheet_sch) {
          continue
        }

        for (const instance of sheet.instances.values()) {
          // paths_to_schematics.set(instance.path, schematic);
          paths_to_sheet_instances.set(`${instance.path}/${sheet.uuid}`, {
            sheet: sheet,
            instance: instance,
          })
        }
      }
    }

    // Find the root sheet. This is done by sorting all of the paths
    // from shortest to longest and walking through the paths to see if
    // we can find the schematic for the parent. The first one we find
    // it the common ancestor (root).
    const paths = Array.from(paths_to_sheet_instances.keys()).sort((a, b) => a.length - b.length)

    let found_root = false
    for (const path of paths) {
      const parent_path = path.split('/').slice(0, -1).join('/')

      if (!parent_path) {
        continue
      }

      this.#root_sch = paths_to_schematics.get(parent_path)

      if (this.#root_sch) {
        found_root = true
        break
      }
    }

    // If we found a root page, we can build out the list of pages by
    // walking through paths_to_sheet with root as page one.
    let pages = []

    if (this.#root_sch) {
      this.#root_schematic_page = new ProjectPage(
        this,
        this.#root_sch.filename,
        `/${this.#root_sch!.uuid}`,
        'Root',
        '1',
      )
      pages.push(this.#root_schematic_page)

      for (const [path, sheet] of paths_to_sheet_instances.entries()) {
        pages.push(
          new ProjectPage(
            this,
            sheet.sheet.sheetfile!,
            path,
            sheet.sheet.sheetname ?? sheet.sheet.sheetfile!,
            sheet.instance.page ?? '',
          ),
        )
      }
    }

    // Sort the pages we've collected so far and then insert them
    // into the pages map.
    pages = sorted_by_numeric_strings(pages, (p) => p.page!)

    for (const page of pages) {
      this.#pages_by_path.set(page.project_path, page)
    }

    // Add any "orphan" sheets to the list of pages now that we've added all
    // the hierarchical ones.
    const seen_schematic_files = new Set(map(this.#pages_by_path.values(), (p) => p.filename))

    for (const schematic of this.schematics()) {
      if (!seen_schematic_files.has(schematic.filename)) {
        const page = new ProjectPage(this, 'schematic', schematic.filename, `/${schematic.uuid}`, schematic.filename)
        this.#pages_by_path.set(page.project_path, page)
      }
    }

    // Finally, if no root schematic was found, just use the first one we saw.
    this.#root_schematic_page = first(this.#pages_by_path.values())
    return found_root
  }
}

export class ProjectPage {
  constructor(
    public project: SchHierarchy,
    public filename: string,
    public sheet_path: string,
    public name?: string,
    public page?: string,
  ) {}

  /**
   * A unique identifier for this page within the project,
   * made from the filename and sheet path.
   */
  get project_path() {
    if (this.sheet_path) {
      return `${this.filename}:${this.sheet_path}`
    }
    return this.filename
  }

  get document() {
    return this.project.file_by_name(this.filename)!
  }
}
