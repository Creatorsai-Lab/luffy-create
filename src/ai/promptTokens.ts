/**
 * Tokens typed in an AI prompt: `/add-on` slash commands and `@media` mentions.
 * Finds the one being typed at the caret (for the suggestion list), the
 * choices for it, and splits a prompt into plain and highlighted parts.
 */
import { addonCommand, findAddon, listBlocks, type SmartBlock } from '../blocks/registry'
import type { AiProjectContext } from './types'

export interface ActiveToken {
  kind: 'addon' | 'media'
  /** Where the token starts (its "/" or "@") and where the caret is. */
  start: number
  end: number
  query: string
}

/** The "/…" or "@…" token the caret is at the end of, if any. */
export function getActiveToken(input: string, caret = input.length): ActiveToken | null {
  const before = input.slice(0, Math.max(0, Math.min(input.length, caret)))
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

/** Add-ons for "/…": commands that start with the query first, then ones whose name contains it. */
export function addonChoices(query: string): TokenChoice[] {
  const q = query.toLowerCase()
  const score = (block: SmartBlock) => {
    const command = addonCommand(block)
    if (!q) return 1
    if (command.startsWith(q)) return 0
    if (command.includes(q) || block.title.toLowerCase().includes(q)) return 1
    return -1
  }
  return listBlocks()
    .map(block => ({ block, rank: score(block) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map(({ block }) => ({
      key: block.id,
      insert: `/${addonCommand(block)}`,
      label: `/${addonCommand(block)}`,
      hint: block.category === 'ugc' ? 'Creators' : 'Explainers',
    }))
}

/** Project media for "@…". */
export function mediaChoices(assets: AiProjectContext['assets'], query: string): TokenChoice[] {
  const q = query.toLowerCase()
  return assets
    .filter(asset => !q || asset.name.toLowerCase().includes(q) || asset.filename.toLowerCase().includes(q))
    .map(asset => ({ key: asset.id, insert: `@${asset.filename}`, label: `@${asset.filename}`, hint: asset.type }))
}

export interface PromptPart {
  text: string
  kind?: 'addon' | 'media'
}

/** Splits a prompt into plain text and highlighted add-on commands / media mentions. */
export function promptParts(text: string): PromptPart[] {
  const parts: PromptPart[] = []
  const re = /(^|\s)([/@][\w.()-]+)/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[1].length
    const token = m[2]
    const kind = token[0] === '/' ? (findAddon(token.slice(1).replace(/[.,!?)]+$/, '')) ? 'addon' : null) : 'media'
    if (!kind) continue
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ text: token, kind })
    last = start + token.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
