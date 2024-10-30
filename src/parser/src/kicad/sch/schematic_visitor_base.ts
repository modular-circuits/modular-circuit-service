// @ts-nocheck

import type { SchematicNode } from './schematic'
import { SchematicSymbol } from './schematic'

export abstract class SchematicVisitorBase {
  public visit(node: SchematicNode) {
    if (node instanceof SchematicSymbol) this.visitSchematicSymbol(node)
    if (typeof node.getChildren === 'function') for (const c of node.getChildren()) this.visit(c)
  }

  abstract visitSchematicSymbol(node: SchematicSymbol)
}
