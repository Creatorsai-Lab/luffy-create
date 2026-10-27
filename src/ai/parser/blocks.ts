/**
 * Smart blocks from plain language, driven entirely by each block's fields —
 * a new block needs no parser code:
 *   "add a lower third for 'Adya' 'ML engineer' on the right"
 *   "add a hook 'Stop scrolling, this changes everything' highlight 'everything'"
 *   "make the lower third red", "change the title card subtitle to 'Setup'"
 */
import { findAddon, getBlock, listBlocks, type SmartBlock } from '../../blocks/registry'
import type { BlockField } from '../../blocks/fields'
import type { AiPlanStep } from '../types'
import { readColors } from './colors'
import { defaultScenes, escapeRe, groupTargets, readScenes, type ParseState } from './refs'
import { readTimes, type Clause } from './text'

const ADD = /\b(?:add|insert|create|put|place|drop in|show)\b/
const EDIT = /\b(?:change|make|set|switch|turn|update|use|move|put|rename|edit|give)\b/

/** The words that name a field: its key, label and extra words. */
function fieldWords(field: BlockField) {
  const label = field.label.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, ' ').trim()
  return [...(field.words ?? []), label, field.key.toLowerCase()].filter(Boolean)
}

const wordRe = (words: string[]) => new RegExp(`\\b(?:${words.map(escapeRe).sort((a, b) => b.length - a.length).join('|')})\\b`)

/**
 * Settings mentioned in the text: options by their words, colours near a
 * colour field's words (else the first colour field), numbers/times after a
 * number field's words, and quoted text after a text field's words.
 */
export function readFieldValues(clause: Clause, fields: BlockField[], insert: boolean): Record<string, unknown> {
  const text = clause.text
  const values: Record<string, unknown> = {}
  const usedQuotes = new Set<number>()

  // Quoted text that follows a field's words: "subtitle 'Setup'", "highlight 'everything'".
  for (const field of fields.filter(f => f.type === 'text')) {
    const m = text.match(new RegExp(`${wordRe(fieldWords(field)).source}\\s*(?:to|as|=|:|is|with|of)?\\s*(?:the\\s+)?(?:words?\\s+)?⟦(\\d+)⟧`))
    if (m && !usedQuotes.has(Number(m[1]))) {
      values[field.key] = clause.quotes[Number(m[1])]
      usedQuotes.add(Number(m[1]))
    }
  }
  // A new block takes the remaining quotes in order: main text, then the second text.
  const rest = clause.quotes.map((q, i) => [q, i] as const).filter(([, i]) => !usedQuotes.has(i))
  for (const slot of ['primary', 'secondary'] as const) {
    const field = fields.find(f => f.type === 'text' && f.quote === slot && values[f.key] === undefined)
    if (!field || !rest.length) continue
    if (!insert && slot === 'secondary') continue
    const [quote] = rest.shift()!
    values[field.key] = quote
  }

  for (const field of fields) {
    if (field.type === 'select') {
      let best: { value: string; length: number } | null = null
      for (const option of field.options) {
        for (const word of option.words ?? [option.label.toLowerCase()]) {
          if (new RegExp(`\\b${escapeRe(word)}\\b`).test(text) && (!best || word.length > best.length)) best = { value: option.value, length: word.length }
        }
      }
      if (best) values[field.key] = best.value
    } else if (field.type === 'number') {
      const re = new RegExp(`${wordRe(fieldWords(field)).source}\\s*(?:of|to|=|:|is)?\\s*(\\d+(?:\\.\\d+)?)\\s*(%|s|sec|secs|seconds?)?`)
      const m = text.match(re)
      if (m) values[field.key] = Number(m[1])
    } else if (field.type === 'toggle') {
      const on = wordRe(fieldWords(field))
      if (on.test(text)) values[field.key] = !/\b(?:no|without|hide|off|remove)\b/.test(text)
    }
  }

  // Colours go to the colour field whose words are nearest, else the first colour field.
  const colorFields = fields.filter(f => f.type === 'color')
  for (const color of readColors(text)) {
    const around = text.slice(Math.max(0, color.index - 28), color.end + 28)
    const field = colorFields.find(f => wordRe(fieldWords(f)).test(around) && values[f.key] === undefined)
      ?? colorFields.find(f => values[f.key] === undefined)
    if (field) values[field.key] = color.hex
  }
  return values
}

/**
 * The add-on a slash command names, and whether the text points at the one already
 * on the scene ("add a step to /flowchart") rather than asking for a new one.
 */
export function slashAddon(text: string): { block: SmartBlock; pointed: boolean } | null {
  for (const m of text.matchAll(/(?:^|\s)\/([a-z][a-z0-9-]*)/g)) {
    const block = findAddon(m[1])
    if (!block) continue
    const pointed = new RegExp(`\\b(?:to|in|into|of|from|on|for)\\s+(?:the\\s+)?\\/${escapeRe(m[1])}\\b`).test(text)
    return { block, pointed }
  }
  return null
}

function blockMentioned(text: string): SmartBlock | undefined {
  return listBlocks().find(block => block.phrases?.test(text))
}

/** Words that ask for another block even when one is already there ("add another flowchart"). */
const ANOTHER = /\b(?:new|another|second|one more|extra)\s+(?:\w+\s+){0,2}?(?:block|chart|network|flow\s*chart|pipeline|equation|derivation|walk-?through|lower third|hook|title card|cta)\b/

/**
 * Add a block, or change the settings of one already on the scene. A block on
 * the scene is changed when the request edits ("make the lower third red") or
 * points at it ("add a step to the flowchart", "a hidden layer to the network");
 * "add a flowchart" adds one.
 */
export function blocksHandler(clause: Clause, state: ParseState): AiPlanStep[] | null {
  const text = clause.text
  // A slash command ("/neural-network") names the add-on exactly; otherwise its words do.
  const slash = slashAddon(text)
  const block = slash?.block ?? blockMentioned(text)
  const editing = EDIT.test(text) && !/^(?:add|insert|create)\b/.test(text)

  // "…, and make it green": the block the previous clause changed.
  const again = !block && /\b(?:it|its)\b/.test(text) ? state.lastBlock : null
  // Only look for scenes (which can warn) when a block on some scene could be meant.
  const couldMean = state.context.scenes.some(sc => sc.groups?.some(g => g.blockId && (g.id === again ||
    (block && g.blockId === block.id) || getBlock(g.blockId)?.refers?.test(text) ||
    new RegExp(`\\b${escapeRe(g.name.toLowerCase())}\\b`).test(text))))
  for (const target of couldMean ? readScenes(text, state) ?? defaultScenes(state) : []) {
    const scene = state.context.scenes.find(s => s.id === target.sceneId)
    const candidates = (scene?.groups ?? []).filter(g => g.blockId).map(g => {
      const own = getBlock(g.blockId!)
      const named = new RegExp(`\\b${escapeRe(g.name.toLowerCase())}\\b`).test(text)
      const pointed = Boolean(own?.refers?.test(text)) || named || g.id === again || Boolean(slash?.pointed && g.blockId === slash.block.id)
      const mentioned = pointed || Boolean(block && g.blockId === block.id)
      return { g, own, pointed, mentioned }
    }).filter(c => c.own && c.mentioned)
    const pick = candidates.at(-1)
    if (!scene || !pick?.own) continue
    if (!(editing || pick.pointed) || ANOTHER.test(text)) continue
    const { g: group, own } = pick
    // "it" now means the block's parts, so "…, then fade it out" works too.
    state.lastElements = groupTargets(scene, group.id, group.name)
    const current = own.normalize(group.params ?? {})
    const params = { ...readFieldValues(clause, own.fields, false), ...(own.parse?.({ text, quotes: clause.quotes }, current) ?? {}) }
    if (!Object.keys(params).length) return null // nothing to change: let "move/delete/fade the lower third" through
    state.lastBlock = group.id
    return [{ type: 'updateBlock', groupId: group.id, params }]
  }

  // Add: "add a lower third …".
  if (!block || !ADD.test(text)) return null
  const params = { ...readFieldValues(clause, block.fields, true), ...(block.parse?.({ text, quotes: clause.quotes }, null) ?? {}) }
  const at = readTimes(text)[0]?.seconds
  const timeField = block.fields.find(f => f.type === 'number' && (f.key === 'showAt' || f.key === 'startAt'))
  if (at != null && timeField && params[timeField.key] === undefined && /\b(?:at|from|starting|delay|delayed|after|wait)\b/.test(text)) params[timeField.key] = at
  const scenes = readScenes(text, state) ?? defaultScenes(state)
  return scenes.map(t => ({ type: 'insertBlock', blockId: block.id, params, sceneId: t.sceneId, sceneAlias: t.sceneAlias, sceneIndex: t.index }))
}
