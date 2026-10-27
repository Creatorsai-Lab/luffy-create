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
  /** The slash command that names it in an AI prompt, without the slash ("neural-network" → /neural-network). */
  command?: string
  /** Words that mean "this block" in a request ("lower third", "name tag"). */
  phrases?: RegExp
  /** Looser words that refer to a block already on the scene ("the network"), for edits only — never to add one. */
  refers?: RegExp
  fields: BlockField[]
  defaults: P
  /** Fills defaults and clamps values. Must accept anything (it receives AI output). */
  normalize(params: FieldValues): P
  /**
   * Block-specific phrasing the generic field reading can't do ("make it seven layers with 12 neurons in
   * the middle", "add a step 'Test' after 'Train'"). Gets the clause text (lower case, quotes as ⟦n⟧), the
   * quotes, and the current settings (null when adding). Returns only the settings it changes.
   */
  parse?(input: { text: string; quotes: string[] }, current: P | null): FieldValues
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

/** An add-on's slash command, without the slash. */
export function addonCommand(block: SmartBlock): string {
  return block.command ?? block.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** The add-on a slash command names: the exact command, else the only one it starts (/neural). */
export function findAddon(command: string): SmartBlock | undefined {
  const name = command.toLowerCase().replace(/^\//, '')
  const all = listBlocks()
  const exact = all.find(block => addonCommand(block) === name)
  if (exact) return exact
  const starts = all.filter(block => addonCommand(block).startsWith(name))
  if (name.length >= 2 && starts.length === 1) return starts[0]
  // A one-letter slip against a command or its first word ("/neurall" → /neural-network).
  if (name.length < 5) return undefined
  const close = all.filter(block => {
    const command = addonCommand(block)
    return editDistance(name, command) <= 1 || editDistance(name, command.split('-')[0]) <= 1
  })
  return close.length === 1 ? close[0] : undefined
}

function editDistance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 2
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = keep
    }
  }
  return row[b.length]
}
