import type { EcadBlob } from '../base'
import { SchHierarchy } from './sch_hierarchy'

/**
 * Port由两部分组成：层次标签和全局电源符号
 *
 * 获取项目中根原理图的Port和项目的BOM
 */
export function get_kicad_project_bom_and_ports(blobs: EcadBlob[]) {
  const hierarchy = new SchHierarchy()
  hierarchy.load(blobs)

  return {
    bom: hierarchy.bom_items,
    ports: {
      hierarchy_labels: hierarchy.root_sch!.get_hiera_labels(),
      global_pwr_ports: hierarchy.root_sch!.get_global_powers(),
    },
  }
}
