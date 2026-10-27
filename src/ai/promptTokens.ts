/**
 * Tokens typed in an AI prompt: `/add-on` and `/command` slash words, `@media`
 * mentions, and the edit number after `/undo`. Finds the one being typed at the
 * caret (for the suggestion list), the choices for it, and splits a prompt into
 * plain and highlighted parts.
 */
import { addonCommand, findAddon, listBlocks, type SmartBlock } from '../blocks/registry'
import type { AiProjectContext } from './types'

/** Commands for the AI panel itself (not add-ons). */
export const PROMPT_COMMANDS = [
  { command: 'history', hint: 'AI edits' },
  { command: 'undo', hint: 'Undo an edit' },
] as const

export interface ActiveToken {
  /** addon: "/…" · media: "@…" · edit: the number after "/undo ". */
  kind: 'addon' | 'media' | 'edit'
  /** Where the token starts (its "/" or "@", or the "/undo") and where the caret is. */
  start: number
  end: number
  query: string
}

/** The token the caret is at the end of, if any. */
export function getActiveToken(input: string, caret = input.length): ActiveToken | null {
  const before = input.slice(0, Math.max(0, Math.min(input.length, caret)))
  const undo = before.match(/(?:^|\s)(\/undo\s+#?)(\d*)$/i)
  if (undo && undo.index != null) {
    const start = undo.index + undo[0].length - undo[1].length - undo[2].length
    return { kind: 'edit', start, end: before.length, query: undo[2] }
  }
  const match = before.match(/(?:^|\s)([/@])([\w.()-]*)$/)
  if (!match || match.index == null) return null
  const start = match.index + match[0].length - match[2].length - 1
  if (match[1] === '/' && !/^[a-z0-9-]*$/i.test(match[2])) return null
  return { kind: match[1] === '/' ? 'addon' : 'media', start, end: before.length, query: match[2] }
}

export interface TokenChoice {
  key: string
  /** What goes into the prompt, without the trailing space. */
  insert: string
  label: string
  hint: string
}

/** "/…": the panel's commands first, then add-ons — those starting with the query, then ones containing it. */
export function addonChoices(query: string): TokenChoice[] {
  const q = query.toLowerCase()
  const commands = PROMPT_COMMANDS
    .filter(c => !q || c.command.startsWith(q))
    .map(c => ({ key: `command-${c.command}`, insert: `/${c.command}`, label: `/${c.command}`, hint: c.hint }))
  const score = (block: SmartBlock) => {
    const command = addonCommand(block)
    if (!q) return 1
    if (command.startsWith(q)) return 0
    if (command.includes(q) || block.title.toLowerCase().includes(q)) return 1
    return -1
  }
  const addons = listBlocks()
    .map(block => ({ block, rank: score(block) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map(({ block }) => ({
      key: block.id,
      insert: `/${addonCommand(block)}`,
      label: `/${addonCommand(block)}`,
      hint: block.category === 'ugc' ? 'Creators' : 'Explainers',
    }))
  return [...commands, ...addons]
}

/** Project media for "@…". */
export function mediaChoices(assets: AiProjectContext['assets'], query: string): TokenChoice[] {
  const q = query.toLowerCase()
  return assets
    .filter(asset => !q || asset.name.toLowerCase().includes(q) || asset.filename.toLowerCase().includes(q))
    .map(asset => ({ key: asset.id, insert: `@${asset.filename}`, label: `@${asset.filename}`, hint: asset.type }))
}

/** AI edits for "/undo …": newest first, those whose number starts with what was typed. */
export function editChoices(edits: Array<{ id: number; prompt: string; undone: boolean }>, query: string): TokenChoice[] {
  return edits
    .filter(e => !e.undone && (!query || String(e.id).startsWith(query)))
    .sort((a, b) => b.id - a.id)
    .map(e => ({ key: `edit-${e.id}`, insert: `/undo #${e.id}`, label: `#${e.id}  ${snippet(e.prompt, 34)}`, hint: 'Undo' }))
}

/** The first `length` characters of a prompt, on one line. */
export function snippet(text: string, length: number) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat
}

export interface PromptPart {
  text: string
  kind?: 'addon' | 'media' | 'command'
}

const isCommand = (word: string) => PROMPT_COMMANDS.some(c => c.command === word.toLowerCase())

/** Splits a prompt into plain text and highlighted commands, add-ons and media mentions. */
export function promptParts(text: string): PromptPart[] {
  const parts: PromptPart[] = []
  const re = /(^|\s)([/@][\w.()-]+)/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[1].length
    const token = m[2]
    const word = token.slice(1).replace(/[.,!?)]+$/, '')
    const kind = token[0] === '@' ? 'media' : isCommand(word) ? 'command' : findAddon(word) ? 'addon' : null
    if (!kind) continue
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ text: token, kind })
    last = start + token.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
