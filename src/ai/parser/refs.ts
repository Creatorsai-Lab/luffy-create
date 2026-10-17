/**
 * Resolves what a clause refers to — scenes ("scene 3", "scenes 2-4", "the last
 * scene") and elements ("the title", "the red circle", "the music", "it") — into
 * ids from the project context. Problems (a scene that doesn't exist, "the
 * circle" when there are three) become plan issues instead of guesses.
 */
import type { AiEditorCommand, AiElementRef, AiElementSummary, AiPlanIssue, AiProjectContext } from '../types'
import { getBlock } from '../../blocks/registry'
import { nearestColorName, readColors } from './colors'
import type { Clause } from './text'
import { ordinalValue } from './text'

export interface SceneTarget {
  sceneId?: string
  /** Scene created earlier in the same plan. */
  sceneAlias?: string
  /** 1-based, for display. */
  index?: number
  label: string
}

export interface ElementTarget {
  ref: AiElementRef
  type?: string
  summary?: AiElementSummary
  sceneId?: string
  label: string
}

export interface ParseState {
  context: AiProjectContext
  issues: AiPlanIssue[]
  /** What the previous clause created or edited — the meaning of "it" / "them". */
  lastElements: ElementTarget[] | null
  /** Scenes the previous clause named; the default for clauses that don't name one. */
  lastScenes: SceneTarget[] | null
  aliasCount: number
  /** The sequence the previous clause built; a following wave clause joins it ("…, then flash them red"). */
  lastSequence?: Extract<AiEditorCommand, { type: 'animateSequence' }> | null
  /** The smart block the previous clause changed — "…, and make it green" changes it again. */
  lastBlock?: string | null
  /** The previous clause styled the captions — "…, and move them to the top" means the captions. */
  lastCaptions?: boolean
  /** How many "this video" references the prompt has used: the 1st means the 1st selected clip, the 2nd the 2nd. */
  mediaThisUsed?: number
  /** Set by the sequence handler; parsePrompt clears `lastSequence` after any other clause. */
  sequenceTouched?: boolean
}

export function warn(state: ParseState, message: string) {
  state.issues.push({ level: 'warning', message })
}

export function nextAlias(state: ParseState, prefix: string) {
  state.aliasCount += 1
  return `${prefix}${state.aliasCount}`
}

// ─── Scenes ───────────────────────────────────────────────────────────────────

export function sceneTarget(state: ParseState, index: number): SceneTarget | null {
  const scene = state.context.scenes[index - 1]
  return scene ? { sceneId: scene.id, index, label: `Scene ${index}` } : null
}

export function currentScene(state: ParseState): SceneTarget[] {
  const target = sceneTarget(state, state.context.currentSceneIndex)
  return target ? [target] : []
}

/** The scenes a clause should act on when it names none. */
export function defaultScenes(state: ParseState): SceneTarget[] {
  return state.lastScenes ?? currentScene(state)
}

export interface SceneMention {
  targets: SceneTarget[]
  index: number
  end: number
}

const SCENE = '(?:scenes?|slides?)'
const ORDINAL_WORDS = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|final|next|previous|\\d+(?:st|nd|rd|th)'

type SceneRule = { re: RegExp; read: (m: RegExpMatchArray, state: ParseState) => number[] | 'alias' | null }

const SCENE_RULES: SceneRule[] = [
  {
    re: new RegExp(`\\b(?:all|every|each)\\s+(?:of\\s+)?(?:the\\s+)?${SCENE}\\b|\\bbetween\\s+(?:all\\s+)?(?:the\\s+)?${SCENE}\\b`, 'g'),
    read: (_m, state) => state.context.scenes.map(s => s.index),
  },
  {
    re: new RegExp(`\\b${SCENE}\\s+(\\d+)\\s*(?:-|–|to|through|thru|until)\\s*(?:${SCENE}\\s+)?(\\d+)\\b`, 'g'),
    read: m => range(Number(m[1]), Number(m[2])),
  },
  {
    re: new RegExp(`\\b${SCENE}\\s+(\\d+(?:\\s*(?:,|and|&)\\s*(?:${SCENE}\\s+)?\\d+)+)\\b`, 'g'),
    read: m => (m[1].match(/\d+/g) ?? []).map(Number),
  },
  {
    re: new RegExp(`\\b(?:the\\s+)?(${ORDINAL_WORDS})\\s+${SCENE}\\b`, 'g'),
    read: (m, state) => {
      const count = state.context.scenes.length
      const current = state.context.currentSceneIndex
      const word = m[1]
      if (word === 'last' || word === 'final') return [count]
      if (word === 'next') return [current + 1]
      if (word === 'previous') return [current - 1]
      const n = ordinalValue(word)
      return n ? [n] : null
    },
  },
  {
    re: new RegExp(`\\b(?:this|current|the\\s+current)\\s+${SCENE}\\b`, 'g'),
    read: (_m, state) => [state.context.currentSceneIndex],
  },
  {
    re: new RegExp(`\\b(?:the\\s+)?new(?:ly\\s+created)?\\s+${SCENE}\\b`, 'g'),
    read: () => 'alias',
  },
  {
    re: new RegExp(`\\b${SCENE}\\s*(?:number\\s*|no\\.?\\s*|#\\s*)?(\\d+)\\b`, 'g'),
    read: m => [Number(m[1])],
  },
]

/** Every scene reference in the text, in order. Rules earlier in the list win over overlapping later ones. */
export function findSceneMentions(text: string, state: ParseState): SceneMention[] {
  const taken: Array<[number, number]> = []
  const mentions: SceneMention[] = []
  for (const rule of SCENE_RULES) {
    for (const match of text.matchAll(rule.re)) {
      const index = match.index ?? 0
      const end = index + match[0].length
      if (taken.some(([a, b]) => index < b && end > a)) continue
      taken.push([index, end])
      const read = rule.read(match, state)
      // A mention that resolves to nothing is still kept (with no targets), so
      // "delete scene 9" does nothing instead of falling back to the current scene.
      if (read === 'alias') {
        const alias = state.lastScenes?.find(target => target.sceneAlias)
        if (!alias) warn(state, 'There is no new scene in this request to refer to.')
        mentions.push({ targets: alias ? [alias] : [], index, end })
        continue
      }
      const targets: SceneTarget[] = []
      for (const n of read ?? []) {
        const target = sceneTarget(state, n)
        if (target) targets.push(target)
        else warn(state, `Scene ${n} does not exist (the project has ${state.context.scenes.length}).`)
      }
      mentions.push({ targets, index, end })
    }
  }
  return mentions.sort((a, b) => a.index - b.index)
}

/** All scenes the clause names, or null when it names none. */
export function readScenes(text: string, state: ParseState): SceneTarget[] | null {
  const mentions = findSceneMentions(text, state)
  if (!mentions.length) return null
  const seen = new Set<string>()
  return mentions.flatMap(m => m.targets).filter(t => {
    const key = t.sceneId ?? t.sceneAlias ?? ''
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function range(a: number, b: number) {
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return Array.from({ length: Math.min(hi - lo + 1, 200) }, (_, i) => lo + i)
}

// ─── Elements ─────────────────────────────────────────────────────────────────

interface NounKind {
  re: RegExp
  label: string
  types: string[]
  shapeTypes?: string[]
  track?: 'background' | 'voiceover'
  /** "the title" = the largest text. */
  largest?: boolean
}

const RECT_SHAPES = ['rect', 'square-hand', 'rect-hand', 'rect-sketch']
const plural = (word: string) => `${word}s?`

export const NOUN_KINDS: NounKind[] = [
  { re: /\b(?:title|heading|headline|header)s?\b/, label: 'title', types: ['text'], largest: true },
  { re: /\b(?:text|texts|label|labels|caption|captions|subtitle|subtitles|paragraph|paragraphs|words)\b/, label: 'text', types: ['text'] },
  { re: new RegExp(`\\b${plural('circle')}\\b`), label: 'circle', types: ['shape'], shapeTypes: ['circle', 'circle-hand'] },
  { re: /\b(?:squares?|rectangles?|rects?|box|boxes)\b/, label: 'rectangle', types: ['shape'], shapeTypes: RECT_SHAPES },
  { re: new RegExp(`\\b${plural('triangle')}\\b`), label: 'triangle', types: ['shape'], shapeTypes: ['triangle'] },
  { re: new RegExp(`\\b${plural('star')}\\b`), label: 'star', types: ['shape'], shapeTypes: ['star'] },
  { re: new RegExp(`\\b${plural('heart')}\\b`), label: 'heart', types: ['shape'], shapeTypes: ['heart'] },
  { re: new RegExp(`\\b${plural('hexagon')}\\b`), label: 'hexagon', types: ['shape'], shapeTypes: ['hexagon'] },
  { re: new RegExp(`\\b${plural('pentagon')}\\b`), label: 'pentagon', types: ['shape'], shapeTypes: ['pentagon'] },
  { re: new RegExp(`\\b${plural('octagon')}\\b`), label: 'octagon', types: ['shape'], shapeTypes: ['octagon'] },
  { re: new RegExp(`\\b${plural('diamond')}\\b`), label: 'diamond', types: ['shape'], shapeTypes: ['diamond'] },
  { re: /\b(?:ovals?|ellipses?)\b/, label: 'oval', types: ['shape'], shapeTypes: ['oval'] },
  { re: /\b(?:cubes?)\b/, label: 'cube', types: ['shape'], shapeTypes: ['cube'] },
  { re: /\b(?:cones?)\b/, label: 'cone', types: ['shape'], shapeTypes: ['cone'] },
  { re: /\b(?:shapes?)\b/, label: 'shape', types: ['shape'] },
  { re: /\b(?:images?|photos?|pictures?|pics?|logos?|imgs?)\b/, label: 'image', types: ['image'] },
  { re: /\b(?:icons?)\b/, label: 'icon', types: ['icon'] },
  { re: /\b(?:videos?|clips?|footage)\b/, label: 'video', types: ['video'] },
  { re: /\b(?:background music|music|songs?|soundtrack|bgm)\b/, label: 'music', types: ['audio'], track: 'background' },
  { re: /\b(?:voice-?\s?overs?|narration|voice)\b/, label: 'voiceover', types: ['audio'], track: 'voiceover' },
  { re: /\b(?:audio|sounds?|audio tracks?)\b/, label: 'audio', types: ['audio'] },
  { re: /\b(?:charts?|graphs?)\b/, label: 'chart', types: ['chart'] },
  { re: /\b(?:tables?)\b/, label: 'table', types: ['table'] },
  { re: /\b(?:arrows?)\b/, label: 'arrow', types: ['arrow'] },
  { re: /\b(?:counters?)\b/, label: 'counter', types: ['counter'] },
  { re: /\b(?:code blocks?|code)\b/, label: 'code', types: ['code'] },
  { re: /\b(?:equations?|formulas?|latex)\b/, label: 'equation', types: ['latex'] },
  { re: /\b(?:elements?|items?|objects?|layers?|things?)\b/, label: 'item', types: [] },
]

const PLURAL_RE = /\b(?:all|every|each|both)\s+(?:of\s+)?(?:the\s+)?(?:\w+\s+)?$/

interface ElementOptions {
  scenes?: SceneTarget[] | null
  /** Quote indexes that are new values ("change the text to 'Hi'"), not references. */
  skipQuotes?: number[]
}

/**
 * The elements a clause refers to. Returns null when the clause does not refer
 * to any element, and [] when it does but nothing matched (an issue is added).
 */
export function readElements(clause: Clause, state: ParseState, opts: ElementOptions = {}): ElementTarget[] | null {
  const text = clause.text
  const scenes = opts.scenes ?? null
  const pool = elementPool(state, scenes)

  // 1. Quoted text that matches an existing text element or element name.
  for (let i = 0; i < clause.quotes.length; i++) {
    if (opts.skipQuotes?.includes(i)) continue
    const quote = clause.quotes[i].trim().toLowerCase()
    if (!quote) continue
    const found = pool.filter(item => item.el.text?.trim().toLowerCase() === quote || item.el.name.toLowerCase() === quote)
    if (found.length) return found.map(item => target(item.el, item.sceneId))
  }

  // 1b. A group by name ("'Layer 1'", "the layer 1 group") or "the group" when the scene has one.
  const groupScenes = state.context.scenes.filter(sc => !scenes || scenes.some(t => t.sceneId === sc.id) || (!scenes && sc.index === state.context.currentSceneIndex))
  for (const sc of groupScenes) {
    for (const group of sc.groups ?? []) {
      const name = group.name.toLowerCase()
      const quoted = clause.quotes.some((q, i) => !opts.skipQuotes?.includes(i) && q.trim().toLowerCase() === name)
      const written = name.length >= 3 && new RegExp(`(?<![\\w])${escapeRe(name)}(?![\\w])`).test(text)
      if (quoted || written) return groupTargets(sc, group.id, group.name)
    }
    const groups = sc.groups ?? []
    if (groups.length === 1 && /\b(?:the|this|that) group\b/.test(text)) return groupTargets(sc, groups[0].id, groups[0].name)
    const block = groups.slice().reverse().find(g => g.blockId && getBlock(g.blockId)?.phrases?.test(text))
    if (block) return groupTargets(sc, block.id, block.name)
  }

  // 2. Custom element names written in the clause ("move Logo 2 to the left").
  // Default names ("Text", "Circle", "Video") are type words and handled in step 3.
  const byName = (items: PoolItem[]) => items
    .filter(item => {
      const name = item.el.name.toLowerCase()
      return name.length >= 3 && !NOUN_KINDS.some(kind => isWholeMatch(kind.re, name)) &&
        new RegExp(`(?<![\\w])${escapeRe(name)}(?![\\w])`).test(text)
    })
    .sort((a, b) => b.el.name.length - a.el.name.length)
  let named = byName(elementPool(state, scenes ?? currentScene(state)))
  if (!named.length && !scenes) named = byName(pool)
  if (named.length) {
    const longest = named[0].el.name.length
    return named.filter(item => item.el.name.length === longest).map(item => target(item.el, item.sceneId))
  }

  // 3. A kind of element ("the title", "the red circle", "all images", "this text", "the music").
  for (const kind of NOUN_KINDS) {
    const match = text.match(kind.re)
    if (!match || match.index == null) continue
    const before = text.slice(0, match.index)
    if (/\b(?:this|these|selected)\s+$/.test(before)) {
      const selected = selection(state).filter(t => !kind.types.length || kind.types.includes(t.type ?? ''))
      if (selected.length) return selected
    }
    const wantsAll = PLURAL_RE.test(before) || /s$/.test(match[0])
    const tail = before.slice(-24).trimEnd()
    const colorWord = readColors(tail).filter(c => c.name && c.end === tail.length).pop()?.name
    return resolveKind(state, kind, scenes, { wantsAll, colorWord })
  }

  // 4. Pronouns: "it"/"them" = what the previous clause made; "this"/"selected" = the selection.
  if (/\b(?:selected|selection)\b|\bthis\b(?!\s+(?:scene|slide))|\bthese\b/.test(text)) return selection(state)
  if (/\b(?:it|them|its)\b/.test(text)) return state.lastElements ?? selection(state)

  return null
}

function resolveKind(
  state: ParseState,
  kind: NounKind,
  scenes: SceneTarget[] | null,
  opts: { wantsAll: boolean; colorWord?: string }
): ElementTarget[] {
  // Audio lives on the global timeline, so "the music" is searched everywhere.
  const searchAll = kind.types.includes('audio') || !scenes
  const matches = (pool: PoolItem[]) => pool.filter(({ el }) =>
    (kind.types.length ? kind.types.includes(el.type) : el.type !== 'audio') &&
    (!kind.shapeTypes || kind.shapeTypes.includes(el.shapeType ?? '')) &&
    (!kind.track || el.track === kind.track) &&
    (!opts.colorWord || nearestColorName(el.color) === opts.colorWord)
  )

  // The previous clause's elements win ("add a circle and make the circle red").
  const recent = (state.lastElements ?? []).filter(t => !t.summary && t.type && kind.types.includes(t.type))
  if (recent.length && !opts.wantsAll) return recent

  let found = matches(elementPool(state, kind.types.includes('audio') ? null : scenes ?? currentScene(state)))
  if (!found.length && searchAll && !kind.types.includes('audio')) found = matches(elementPool(state, null))
  if (!found.length) {
    const where = scenes ? ` on ${scenes.map(s => s.label).join(', ')}` : ''
    warn(state, `No ${opts.colorWord ? `${opts.colorWord} ` : ''}${kind.label} found${where}.`)
    return []
  }
  if (opts.wantsAll || found.length === 1) return found.map(item => target(item.el, item.sceneId))

  const selected = found.filter(item => state.context.selectedIds.includes(item.el.id))
  if (selected.length === 1) return [target(selected[0].el, selected[0].sceneId)]
  if (kind.largest) {
    const largest = found.slice().sort((a, b) => (b.el.fontSize ?? 0) - (a.el.fontSize ?? 0))[0]
    return [target(largest.el, largest.sceneId)]
  }
  warn(state, `There are ${found.length} ${kind.label}s — select one, use its name, or say "all ${kind.label}s".`)
  return []
}

export function groupTargets(scene: AiProjectContext['scenes'][number], groupId: string, name: string): ElementTarget[] {
  return scene.elements
    .filter(el => el.groupId === groupId)
    .map(el => ({ ref: { elementId: el.id, targetLabel: `${el.name} (${name})` }, type: el.type, summary: el, sceneId: scene.id, label: name }))
}

/** Whether the text names a group on the current scene, by its name or its block ("the lower third"). */
export function mentionsGroup(text: string, state: ParseState) {
  const scene = state.context.scenes.find(sc => sc.index === state.context.currentSceneIndex)
  return (scene?.groups ?? []).some(g => {
    const name = g.name.toLowerCase()
    return (name.length >= 3 && new RegExp(`(?<![\\w])${escapeRe(name)}(?![\\w])`).test(text)) ||
      (g.blockId && getBlock(g.blockId)?.phrases?.test(text))
  })
}

function selection(state: ParseState): ElementTarget[] {
  const { selectedElements } = state.context
  if (!selectedElements.length) {
    warn(state, 'Nothing is selected. Select an item or name it (for example "the title").')
    return []
  }
  return selectedElements.map(el => ({
    ref: { elementId: el.id, targetLabel: el.name },
    type: el.type,
    summary: el,
    sceneId: sceneOf(state, el.id),
    label: el.name,
  }))
}

interface PoolItem {
  el: AiElementSummary
  sceneId: string
}

function elementPool(state: ParseState, scenes: SceneTarget[] | null): PoolItem[] {
  const ids = scenes?.map(s => s.sceneId).filter(Boolean)
  return state.context.scenes
    .filter(scene => !ids || ids.includes(scene.id))
    .flatMap(scene => scene.elements.map(el => ({ el, sceneId: scene.id })))
}

function target(el: AiElementSummary, sceneId: string): ElementTarget {
  return { ref: { elementId: el.id, targetLabel: el.name }, type: el.type, summary: el, sceneId, label: el.name }
}

function sceneOf(state: ParseState, elementId: string) {
  return state.context.scenes.find(scene => scene.elements.some(el => el.id === elementId))?.id
}

function isWholeMatch(re: RegExp, value: string) {
  const match = value.match(re)
  return Boolean(match && match[0] === value.replace(/\s*\d+$/, ''))
}

export function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
