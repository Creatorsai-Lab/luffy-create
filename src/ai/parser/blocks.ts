/**
 * Smart blocks from plain language, driven entirely by each block's fields —
 * a new block needs no parser code:
 *   "add a lower third for 'Adya' 'ML engineer' on the right"
 *   "add a hook 'Stop scrolling, this changes everything' highlight 'everything'"
 *   "make the lower third red", "change the title card subtitle to 'Setup'"
 */
import { listBlocks, type SmartBlock } from '../../blocks/registry'
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

function blockMentioned(text: string): SmartBlock | undefined {
  return listBlocks().find(block => block.phrases?.test(text))
}

/** Add a block, or change the settings of one already on the scene. */
export function blocksHandler(clause: Clause, state: ParseState): AiPlanStep[] | null {
  const text = clause.text
  const block = blockMentioned(text)

  // Edit: a smart group on the scene that the text names (by its block or its name).
  if (EDIT.test(text) && !/^(?:add|insert|create)\b/.test(text)) {
    const scenes = readScenes(text, state) ?? defaultScenes(state)
    // "…, and make it green": the block the previous clause changed.
    const again = !block && /\b(?:it|its)\b/.test(text) ? state.lastBlock : null
    for (const target of scenes) {
      const scene = state.context.scenes.find(s => s.id === target.sceneId)
      const groups = (scene?.groups ?? []).filter(g => g.blockId && (g.id === again ||
        (block && g.blockId === block.id) || new RegExp(`\\b${escapeRe(g.name.toLowerCase())}\\b`).test(text)))
      const group = groups.at(-1)
      const own = group && listBlocks().find(b => b.id === group.blockId)
      if (!scene || !group || !own) continue
      // "it" now means the block's parts, so "…, then fade it out" works too.
      state.lastElements = groupTargets(scene, group.id, group.name)
      const params = readFieldValues(clause, own.fields, false)
      if (!Object.keys(params).length) return null // nothing to change: let "move/delete/fade the lower third" through
      state.lastBlock = group.id
      return [{ type: 'updateBlock', groupId: group.id, params }]
    }
  }

  // Add: "add a lower third …".
  if (!block || !ADD.test(text)) return null
  const params = readFieldValues(clause, block.fields, true)
  const at = readTimes(text)[0]?.seconds
  const timeField = block.fields.find(f => f.type === 'number' && (f.key === 'showAt' || f.key === 'startAt'))
  if (at != null && timeField && params[timeField.key] === undefined && /\b(?:at|from|starting)\b/.test(text)) params[timeField.key] = at
  const scenes = readScenes(text, state) ?? defaultScenes(state)
  return scenes.map(t => ({ type: 'insertBlock', blockId: block.id, params, sceneId: t.sceneId, sceneAlias: t.sceneAlias, sceneIndex: t.index }))
}
