/**
 * Smart blocks: deterministic generators that build a group of ordinary
 * elements (shapes, text, connectors, animations) from a few settings. The
 * group remembers the settings, so changing one (by hand or by the AI)
 * rebuilds it in place. See src/ai/PLAN.md §6.
 */
import type { EditorElement } from '../types/editor'
import type { BlockField, FieldValues } from './fields'
import { BUILT_IN_BLOCKS } from './catalog'

export interface BlockFrame {
  width: number
  height: number
}

export interface SmartBlock<P extends FieldValues = FieldValues> {
  id: string
  /** Shown in the UI and to the AI. */
  title: string
  /** When to use it — written for the AI as much as for people. */
  description: string
  category: 'ugc' | 'technical' | 'test'
  /** Words that mean "this block" in a request ("lower third", "name tag"). */
  phrases?: RegExp
  fields: BlockField[]
  defaults: P
  /** Fills defaults and clamps values. Must accept anything (it receives AI output). */
  normalize(params: FieldValues): P
  /**
   * Builds the elements. Give every element a `blockKey` that names its part
   * ("word-3") so a rebuild keeps the same ids for the same parts. Connectors
   * may attach to other built elements by their id.
   */
  build(params: P, frame: BlockFrame): EditorElement[]
}

const blocks = new Map<string, SmartBlock>(BUILT_IN_BLOCKS.map(block => [block.id, block]))

export function registerBlock<P extends FieldValues>(block: SmartBlock<P>) {
  blocks.set(block.id, block as unknown as SmartBlock)
}

export function getBlock(id: string): SmartBlock | undefined {
  return blocks.get(id)
}

export function listBlocks(category?: SmartBlock['category']): SmartBlock[] {
  return [...blocks.values()].filter(block => block.category !== 'test' && (!category || block.category === category))
}
