/**
 * Intent handlers. Each one decides from the clause text whether it owns the
 * clause; if so it resolves targets and returns commands (possibly [] with an
 * issue explaining why nothing could be done), otherwise null so the next
 * handler can try. Handlers only resolve targets after claiming a clause, so a
 * handler that passes never leaves stray warnings.
 */
import type { AnimationTiming, AnimationType, Background, ShapeType, SlideDir, TransitionType } from '../../types/editor'
import { FONT_FAMILIES } from '../../types/editor'
import type { AiAnimationSpec, AiArrangeOrder, AiEditorCommand, AiElementRef, AiPlanStep, AiSceneRef, AiWave } from '../types'
import { readColors, type ColorMatch } from './colors'
import {
  NOUN_KINDS, currentScene, defaultScenes, findSceneMentions, nextAlias, readElements, readScenes, sceneTarget, warn,
  type ElementTarget, type ParseState, type SceneTarget,
} from './refs'
import {
  countValue, numberAfter, readFactor, readPercent, readSize, readTimes, timeAfter, type Clause,
} from './text'

export type Handler = (clause: Clause, state: ParseState) => AiPlanStep[] | null

// ─── Shared helpers ───────────────────────────────────────────────────────────

const sceneRef = (t: SceneTarget): AiSceneRef => ({ sceneId: t.sceneId, sceneAlias: t.sceneAlias, sceneIndex: t.index })
const elementRef = (t: ElementTarget): AiElementRef => ({ ...t.ref, sceneId: t.sceneId })
const PRONOUN_RE = /\b(?:it|them|its|this|these|selected|selection)\b(?!\s+(?:scene|slide))/

function mentionsElement(text: string) {
  return PRONOUN_RE.test(text) || NOUN_KINDS.some(kind => kind.re.test(text))
}

function elementsOrSelection(clause: Clause, state: ParseState, scenes: SceneTarget[] | null, skipQuotes?: number[]) {
  return readElements(clause, state, { scenes, skipQuotes }) ??
    readElements({ ...clause, text: `${clause.text} selected` }, state)!
}

function remember(state: ParseState, elements?: ElementTarget[] | null, scenes?: SceneTarget[] | null) {
  if (elements !== undefined) state.lastElements = elements && elements.length ? elements : null
  if (scenes !== undefined) state.lastScenes = scenes && scenes.length ? scenes : state.lastScenes
}

function sceneDuration(state: ParseState, t: SceneTarget) {
  return state.context.scenes.find(s => s.id === t.sceneId)?.duration ?? 0
}

function sceneAtTime(state: ParseState, seconds: number): { target: SceneTarget; offset: number } | null {
  let elapsed = 0
  for (const scene of state.context.scenes) {
    if (seconds < elapsed + scene.duration) return { target: sceneTarget(state, scene.index)!, offset: seconds - elapsed }
    elapsed += scene.duration
  }
  return null
}

const round = (n: number, step = 0.01) => Math.round(n / step) * step

interface Position {
  horizontal?: 'left' | 'center' | 'right'
  vertical?: 'top' | 'middle' | 'bottom'
}

function readPosition(text: string): Position | null {
  const corner = text.match(/\b(top|upper|bottom|lower)[\s-]+(left|right)\b/)
  if (corner) {
    return {
      vertical: corner[1] === 'top' || corner[1] === 'upper' ? 'top' : 'bottom',
      horizontal: corner[2] as 'left' | 'right',
    }
  }
  const out: Position = {}
  if (/\b(?:center|centre|centered|centred|middle)\b/.test(text)) {
    const onlyH = /\bhorizontal(?:ly)?\b/.test(text)
    const onlyV = /\bvertical(?:ly)?\b/.test(text)
    if (!onlyV) out.horizontal = 'center'
    if (!onlyH) out.vertical = 'middle'
  }
  if (/\b(?:top|upper)\b/.test(text)) out.vertical = 'top'
  else if (/\b(?:bottom|lower)\b/.test(text)) out.vertical = 'bottom'
  if (/\bleft\b/.test(text)) out.horizontal = 'left'
  else if (/\bright\b/.test(text)) out.horizontal = 'right'
  return out.horizontal || out.vertical ? out : null
}

function readFontFamily(clause: Clause): string | null {
  const haystacks = [clause.text, ...clause.quotes.map(q => q.toLowerCase())]
  const fonts = [...FONT_FAMILIES].sort((a, b) => b.length - a.length)
  for (const text of haystacks) {
    const font = fonts.find(f => new RegExp(`\\b${f.toLowerCase()}\\b`).test(text))
    if (font) return font
  }
  return null
}

/** "white border", "border white", "border to white", "outline in #fff" */
function isBorderColor(text: string, color: ColorMatch) {
  return /\b(?:border|outline|stroke)\b(?:\s+(?:to|of|in|color|colour|=|:)){0,2}\s*$/.test(text.slice(0, color.index)) ||
    /^\s+(?:border|outline|stroke)\b/.test(text.slice(color.end))
}

/** Colours that are values, not adjectives of the element being referred to ("make the red circle blue" → blue). */
function valueColors(text: string): ColorMatch[] {
  // Generic words ("layer", "item") are never what a colour describes: "flash them yellow layer by layer".
  return readColors(text).filter(color => !NOUN_KINDS.some(kind => kind.types.length > 0 && (() => {
    const next = text.slice(color.end).match(/^\s+(\w[\w-]*)/)?.[1]
    return next ? kind.re.test(next) : false
  })()))
}

// ─── Animations ───────────────────────────────────────────────────────────────

const SLIDE_WORD = /\bslid(?:e|es|ing)\b(?!\s*(?:#|number|no\.?)?\s*\d)/

const ANIMATIONS: Array<{ re: RegExp; type: AnimationType; timing: AnimationTiming }> = [
  { re: /\bfade[sd]?(?:\s+\S+){0,3}?\s+out\b|\bfade-?out\b/, type: 'fadeOut', timing: 'onExit' },
  { re: /\bfad(?:e|es|ed|ing)\b|\bfade-?in\b/, type: 'fadeIn', timing: 'onEnter' },
  { re: /\bslid(?:e|es|ing)(?:\s+\S+){0,3}?\s+out\b/, type: 'slideOut', timing: 'onExit' },
  { re: SLIDE_WORD, type: 'slideIn', timing: 'onEnter' },
  { re: /\bzoom(?:s|ed|ing)?(?:\s+\S+){0,3}?\s+out\b/, type: 'zoomOut', timing: 'onEnter' },
  { re: /\bzoom(?:s|ed|ing)?\b/, type: 'zoomIn', timing: 'onEnter' },
  { re: /\b(?:scale|pop|grow)s?(?:\s+\S+){0,3}?\s+out\b/, type: 'scaleOut', timing: 'onExit' },
  { re: /\b(?:scale|grow)s?\s+(?:\S+\s+){0,2}?in\b|\bpops?\b|\bpop[\s-]?in\b/, type: 'scaleIn', timing: 'onEnter' },
  { re: /\bwipe[sd]?(?:\s+\S+){0,3}?\s+out\b/, type: 'wipeOut', timing: 'onExit' },
  { re: /\bwipe[sd]?\b/, type: 'wipeIn', timing: 'onEnter' },
  { re: /\btypewriter\b|\btyping\b|\btype(?:s|d)?\s+(?:\S+\s+)?out\b/, type: 'typewriter', timing: 'onEnter' },
  { re: /\bbounc\w*/, type: 'bounceLoop', timing: 'loop' },
  { re: /\bspin\w*|\brotat\w*\s+(?:continuously|forever|around|in a loop|nonstop)|\bkeep\s+rotating\b/, type: 'rotateLoop', timing: 'loop' },
  { re: /\bpuls\w*|\bthrob\w*|\bheartbeat\b/, type: 'pulse', timing: 'loop' },
  { re: /\bflash(?:es|ing)?\b|\bglow\w*|\blights? up\b|\bhighlight\w*/, type: 'colorPulse', timing: 'loop' },
  { re: /\bblink\w*/, type: 'fadeLoop', timing: 'loop' },
  { re: /\bappear\w*|\bshow up\b|\breveal\w*/, type: 'fadeIn', timing: 'onEnter' },
]

function readDirection(text: string): SlideDir | undefined {
  const match = text.match(/\b(?:from|to|towards?)\s+(?:the\s+)?(left|right|top|bottom|up|down)\b/)
  if (!match) return undefined
  return ({ left: 'left', right: 'right', top: 'up', up: 'up', bottom: 'down', down: 'down' } as const)[match[1] as 'left']
}

function readAnimation(text: string): AiAnimationSpec | null {
  const found = ANIMATIONS.find(item => item.re.test(text))
  const generic = !found && /\banimat\w*|\bentrance\b/.test(text)
  if (!found && !generic) return null
  const spec: AiAnimationSpec = { type: found?.type ?? 'fadeIn', timing: found?.timing ?? 'onEnter' }
  const duration = timeAfter(text, ['over', 'for', 'in', 'lasting', 'duration', 'within', 'taking'])
  const delay = timeAfter(text, ['after', 'delay', 'delayed by', 'wait', 'starting at', 'at']) ?? numberAfter(text, 'delay')
  if (duration != null) spec.duration = duration
  if (delay != null) spec.delay = delay
  const direction = readDirection(text)
  if (direction && (spec.type === 'slideIn' || spec.type === 'slideOut' || spec.type === 'wipeIn' || spec.type === 'wipeOut')) spec.direction = direction
  return spec
}

/** Adjusts an animation to the element type (bounce → text bounce-in for text; typewriter only on text). */
function animationFor(spec: AiAnimationSpec, type: string | undefined, state: ParseState): AiAnimationSpec | null {
  if (spec.type === 'bounceLoop' && type === 'text') return { ...spec, type: 'textBounceIn', timing: 'onEnter' }
  if (spec.type === 'typewriter' && type !== 'text') {
    warn(state, 'Typewriter animation only works on text.')
    return null
  }
  return spec
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/** Edits that need the media analysed first (expanded by src/ai/smart). */
const smart: Handler = (clause, state) => {
  const text = clause.text
  const sceneIds = () => readScenes(text, state)?.map(t => t.sceneId).filter((id): id is string => Boolean(id))
  const cutVerb = /\b(?:remove|cut|delete|trim|skip|tighten|shorten|drop|get rid of|take out|clean up|edit out)\b/

  if (/\b(?:fillers?|filler words?|ums?|umms?|uhs?|uhms?|erms?|ahs?)\b/.test(text) && cutVerb.test(text)) {
    return [{ type: 'removeFillers', sceneIds: sceneIds() }]
  }
  if ((/\b(?:silen(?:ce|ces|t parts?)|pauses?|dead air|quiet parts?)\b/.test(text) && cutVerb.test(text)) || /\bjump[\s-]?cuts?\b/.test(text)) {
    const longer = timeAfter(text, ['than', 'over', 'above', 'at least', 'longer than'])
    return [{ type: 'removeSilences', sceneIds: sceneIds(), minSilence: longer ?? (/\btighten\b/.test(text) ? 0.35 : undefined) }]
  }
  if (/\b(?:beats?|rhythm|tempo|bpm)\b/.test(text) && /\b(?:cut|sync|match|align|snap|time|edit)\w*/.test(text)) {
    const every = text.match(/\bevery\s+(\w+)\s+beats?\b/)?.[1]
    const beatsPerCut = /\bevery\s+(?:bar|measure)\b/.test(text) ? 4
      : /\bevery\s+other\s+beat\b/.test(text) ? 2
      : every ? countValue(every) ?? 1 : 1
    return [{ type: 'cutToBeat', beatsPerCut }]
  }
  if (/\b(?:shots?|camera (?:changes?|cuts?)|scene changes?)\b/.test(text) && /\b(?:split|detect|cut|find|separate|break)\b/.test(text)) {
    return [{ type: 'splitShots', sceneIds: sceneIds() }]
  }
  return null
}

const COUNT = '(an?|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)'
const ADD_SCENE_RE = new RegExp(
  `\\b(?:add|create|insert|append|make(?=\\s+(?:an?\\s+)?(?:new|another|blank|empty)\\b))\\s+(?:${COUNT}\\s+)?(?:more\\s+|other\\s+|another\\s+)?(?:new\\s+|blank\\s+|empty\\s+)?(?:(\\d+(?:\\.\\d+)?)\\s*(?:s|sec|secs|seconds?)(?:\\s+long)?\\s+)?(?:new\\s+|blank\\s+|empty\\s+)?(?:scenes?|slides?)\\b|^(?:an?\\s+)?new\\s+(?:scene|slide)\\b`
)

const addScene: Handler = (clause, state) => {
  const text = clause.text
  const match = text.match(ADD_SCENE_RE)
  if (!match || /\btransitions?\b/.test(text)) return null

  const count = Math.max(1, Math.min(10, countValue(match[1] ?? 'a') ?? 1))
  const duration = match[2] != null ? Number(match[2]) : readTimes(text.slice((match.index ?? 0) + match[0].length))[0]?.seconds
  const nameIndex = text.match(/\b(?:called|named|titled\s+as)\s+⟦(\d+)⟧/)?.[1]
  const titleIndex = text.match(/\b(?:with\s+)?(?:(?:the|a)\s+)?(?:title|heading|text|saying|titled)\s+⟦(\d+)⟧/)?.[1]
    ?? (nameIndex == null && clause.quotes.length ? '0' : undefined)
  const rest = text.slice((match.index ?? 0) + match[0].length)
  const bgColor = /\b(?:background|bg)\b/.test(rest) ? valueColors(rest)[0]?.hex : undefined

  // Where: "after scene 2", "before scene 3", "at the start".
  let afterSceneId: string | undefined
  let moveTo: number | undefined
  for (const mention of findSceneMentions(rest, state)) {
    const before = rest.slice(0, mention.index)
    const t = mention.targets[0]
    if (!t) continue
    if (/\bafter\s+(?:the\s+)?$/.test(before)) afterSceneId = t.sceneId
    else if (/\bbefore\s+(?:the\s+)?$/.test(before) && t.index) {
      if (t.index > 1) afterSceneId = state.context.scenes[t.index - 2].id
      else moveTo = 1
    }
  }
  if (/\b(?:at|to)\s+the\s+(?:start|beginning|front)\b|\bas\s+(?:the\s+)?first\b/.test(rest)) moveTo = 1

  const commands: AiEditorCommand[] = []
  const created: SceneTarget[] = []
  const titles: ElementTarget[] = []
  for (let i = 0; i < count; i++) {
    const alias = nextAlias(state, 'scene')
    commands.push({
      type: 'addScene',
      alias,
      duration,
      name: nameIndex != null ? clause.quotes[Number(nameIndex)] : undefined,
      afterSceneId,
    })
    if (moveTo) commands.push({ type: 'moveScene', sceneAlias: alias, toIndex: moveTo + i })
    const target: SceneTarget = { sceneAlias: alias, label: 'the new scene' }
    created.push(target)
    if (bgColor) commands.push({ type: 'setBackground', sceneAlias: alias, background: { type: 'solid', color: bgColor } })
    if (titleIndex != null) {
      const textAlias = nextAlias(state, 'el')
      commands.push({ type: 'addText', sceneAlias: alias, alias: textAlias, text: clause.quotes[Number(titleIndex)], fontSize: 72, fontWeight: 'bold' })
      titles.push({ ref: { elementAlias: textAlias, targetLabel: 'the title' }, type: 'text', label: 'the title' })
    }
  }
  remember(state, titles, created)
  return commands
}

const REMOVE_RE = /\b(?:delete|remove|erase|drop|clear|get rid of|take out|cut out|discard)\b|\bcut\b/

const remove: Handler = (clause, state) => {
  const text = clause.text
  if (!REMOVE_RE.test(text)) return null
  // "cut" with a time is a split or trim, handled later.
  if (!/\b(?:delete|remove|erase|drop|clear|get rid of|take out|cut out|discard)\b/.test(text) &&
      (readTimes(text).length || /\b(?:here|half|playhead|first|last|start|end)\b/.test(text))) return null

  if (/\b(?:silences?|pauses?|filler|ums?|uhs?|dead air)\b/.test(text)) return null // Phase 2 handlers

  if (/\btransitions?\b/.test(text)) {
    const plural = /\btransitions\b|\ball\b/.test(text)
    const scenes = readScenes(text, state) ?? (plural ? state.context.scenes.map(s => sceneTarget(state, s.index)!) : defaultScenes(state))
    return scenes.map(t => ({ type: 'setTransition', ...sceneRef(t), transition: { type: 'none', duration: 0 } }))
  }

  if (/\b(?:animations?|effects?|motions?)\b/.test(text)) {
    const targets = elementsOrSelection(clause, state, readScenes(text, state))
    remember(state, targets)
    return targets.map(t => ({ type: 'removeAnimations', ...elementRef(t) }))
  }

  if (/\b(?:background|bg)\b/.test(text) && !mentionsElement(text.replace(/\b(?:background|bg)\b/g, ''))) {
    warn(state, 'Removing a background is not supported yet — try "make the background black" or "transparent background".')
    return []
  }

  const scenes = readScenes(text, state)
  const elements = mentionsElement(text) ? readElements(clause, state, { scenes }) : null
  if (elements) {
    remember(state, null)
    return elements.map(t => ({ type: 'removeElement', ...elementRef(t) }))
  }

  const targets = scenes ?? (/\b(?:scene|slide)\b/.test(text) ? currentScene(state) : null)
  if (!targets) {
    const selected = readElements({ ...clause, text: 'selected' }, state) ?? []
    return selected.map(t => ({ type: 'removeElement', ...elementRef(t) }))
  }
  const existing = targets.filter(t => t.sceneId)
  if (existing.length >= state.context.scenes.length) {
    warn(state, `A project needs at least one scene, so ${existing[0].label} was kept.`)
    existing.shift()
  }
  state.lastScenes = null
  return existing.map(t => ({ type: 'removeScene', ...sceneRef(t) }))
}

const duplicate: Handler = (clause, state) => {
  const text = clause.text
  if (!/\b(?:duplicate|copy|clone|replicate)\b/.test(text)) return null
  const times = Math.max(1, Math.min(10, countValue(text.match(/\b(\w+)\s+times\b/)?.[1] ?? '') ?? (/\btwice\b/.test(text) ? 2 : 1)))
  const scenes = readScenes(text, state)
  const elements = mentionsElement(text) ? readElements(clause, state, { scenes }) : null

  const commands: AiEditorCommand[] = []
  if (elements) {
    const copies: ElementTarget[] = []
    for (const t of elements) {
      for (let i = 0; i < times; i++) {
        const alias = nextAlias(state, 'el')
        commands.push({ type: 'duplicateElement', ...elementRef(t), alias })
        copies.push({ ref: { elementAlias: alias, targetLabel: `copy of ${t.label}` }, type: t.type, label: `copy of ${t.label}` })
      }
    }
    remember(state, copies)
    return commands
  }
  const targets = scenes ?? currentScene(state)
  const copies: SceneTarget[] = []
  for (const t of targets) {
    for (let i = 0; i < times; i++) {
      const alias = nextAlias(state, 'scene')
      commands.push({ type: 'duplicateScene', ...sceneRef(t), alias })
      copies.push({ sceneAlias: alias, label: `copy of ${t.label}` })
    }
  }
  remember(state, null, copies)
  return commands
}

const split: Handler = (clause, state) => {
  const text = clause.text
  const verb = /\b(?:split|divide|break)\b/.test(text)
  const cut = /\bcut\b/.test(text) && /\b(?:at|here|playhead|half|into)\b/.test(text)
  if (!verb && !cut) return null
  if (/\b(?:first|last)\s+\d/.test(text)) return null // "cut the first 2s" is a trim

  const scenes = readScenes(text, state)
  const cuts: Array<{ target: SceneTarget; at: number }> = []
  const parts = text.match(/\binto\s+(\w+)\s+(?:equal\s+)?(?:parts|pieces|scenes|halves)\b/)
  const pieces = /\bin\s+(?:to\s+)?half\b|\binto\s+halves\b/.test(text) ? 2 : parts ? countValue(parts[1]) : null

  if (pieces) {
    for (const t of scenes ?? defaultScenes(state)) {
      const total = sceneDuration(state, t)
      for (let i = 1; i < Math.min(pieces, 20); i++) cuts.push({ target: t, at: round((total * i) / pieces) })
    }
  } else if (/\b(?:here|playhead|current time|now)\b/.test(text)) {
    const hit = sceneAtTime(state, state.context.playhead)
    if (hit) cuts.push({ target: hit.target, at: round(hit.offset) })
  } else {
    let times = readTimes(text).map(t => t.seconds)
    if (!times.length) {
      const bare = text.match(/\bat\s+(\d+(?:\.\d+)?)\b(?!\s*(?:%|x))/)
      if (bare) times = [Number(bare[1])]
    }
    if (!times.length) {
      warn(state, 'Where should it split? For example "split scene 2 at 3s" or "split here".')
      return []
    }
    if (scenes) {
      for (const t of scenes) for (const at of times) cuts.push({ target: t, at })
    } else {
      // No scene named: times are on the whole timeline.
      for (const at of times) {
        const hit = sceneAtTime(state, at)
        if (hit) cuts.push({ target: hit.target, at: round(hit.offset) })
        else warn(state, `${at}s is past the end of the project.`)
      }
    }
  }

  const valid = cuts.filter(({ target, at }) => {
    const ok = at > 0.1 && at < sceneDuration(state, target) - 0.1
    if (!ok) warn(state, `Cannot split ${target.label} at ${at}s (it is ${sceneDuration(state, target)}s long).`)
    return ok
  })
  // Split each scene from the last cut backwards: the original scene keeps its id as the first part.
  valid.sort((a, b) => (a.target.sceneId === b.target.sceneId ? b.at - a.at : 0))
  remember(state, null, scenes)
  return valid.map(({ target, at }) => ({ type: 'splitScene', ...sceneRef(target), at }))
}

const trim: Handler = (clause, state) => {
  const text = clause.text
  if (!/\b(?:trim|shorten|chop|cut)\b/.test(text)) return null
  const time = readTimes(text)[0]?.seconds
  if (time == null) return null
  // "the first 2 seconds" / "from the start" — but not "the first scene".
  const fromStart = /\b(?:first|opening)\s+\d/.test(text) || /\b(?:from|at|off)\s+the\s+(?:start|beginning|front)\b/.test(text)
  const fromEnd = /\b(?:last|final)\s+\d/.test(text) || /\b(?:from|at|off)\s+the\s+end\b/.test(text)
  const by = /\bby\b/.test(text)
  const to = /\bto\b/.test(text) && !fromStart && !fromEnd

  const scenes = readScenes(text, state)
  const media = /\b(?:videos?|clips?|footage|music|songs?|audio|sounds?|voice-?\s?overs?|narration|voice)\b/.test(text) || (!scenes && PRONOUN_RE.test(text))
  if (media) {
    const targets = readElements(clause, state, { scenes }) ?? []
    const commands: AiEditorCommand[] = []
    for (const t of targets) {
      if (t.type !== 'video' && t.type !== 'audio') { warn(state, `${t.label} is not a video or audio clip.`); continue }
      const current = t.summary?.duration ?? 0
      const rate = t.summary?.playbackRate ?? 1
      let patch: Record<string, unknown>
      if (fromStart) patch = { startTime: round((t.summary?.startTime ?? 0) + time * rate), duration: round(current - time) }
      else if (fromEnd || by) patch = { duration: round(current - time) }
      else patch = { duration: time }
      if (typeof patch.duration === 'number' && patch.duration < 0.1) { warn(state, `${t.label} is only ${current}s long.`); continue }
      commands.push({ type: 'updateElement', ...elementRef(t), patch })
    }
    remember(state, targets)
    return commands
  }

  const targets = scenes ?? defaultScenes(state)
  const commands: AiEditorCommand[] = []
  for (const t of targets) {
    const current = sceneDuration(state, t)
    if (fromStart) {
      // Remove the opening: split there, then delete the first part (which keeps the original id).
      if (time >= current - 0.1) { warn(state, `${t.label} is only ${current}s long.`); continue }
      commands.push({ type: 'splitScene', ...sceneRef(t), at: time }, { type: 'removeScene', ...sceneRef(t) })
      continue
    }
    const duration = fromEnd || by ? current - time : to ? time : current - time
    if (duration < 0.5) { warn(state, `${t.label} is only ${current}s long.`); continue }
    commands.push({ type: 'setSceneDuration', ...sceneRef(t), duration: round(duration) })
  }
  return commands
}

const reorder: Handler = (clause, state) => {
  const text = clause.text
  const swap = /\b(?:swap|switch|exchange)\b/.test(text)
  if (!swap && !/\b(?:move|put|place|drag|reorder|shift)\b/.test(text)) return null
  const mentions = findSceneMentions(text, state)
  if (!mentions.length) return null
  if (!mentions[0].targets[0]?.index) return [] // e.g. "move scene 9 …" — already reported
  // "move the title to scene 2" moves an element, not a scene.
  const subjectText = text.slice(0, mentions[0].index)
  if (mentionsElement(subjectText.replace(/\b(?:move|put|place|drag|shift)\b/g, ''))) return null

  const count = state.context.scenes.length
  const from = mentions[0].targets[0]
  if (swap) {
    const other = mentions[1]?.targets[0] ?? mentions[0].targets[1]
    if (!other?.index || other.index === from.index) {
      warn(state, 'Say which two scenes to swap, for example "swap scene 1 and scene 3".')
      return []
    }
    const [a, b] = from.index! < other.index ? [from, other] : [other, from]
    return [
      { type: 'moveScene', ...sceneRef(a), toIndex: b.index! },
      { type: 'moveScene', ...sceneRef(b), toIndex: a.index! },
    ]
  }

  const rest = text.slice(mentions[0].end)
  const dest = mentions[1]
  let toIndex: number | null = null
  if (/\b(?:start|beginning|front|first)\b/.test(rest)) toIndex = 1
  else if (/\b(?:end|last|back)\b/.test(rest)) toIndex = count
  else if (/\bposition\s+(\d+)\b/.test(rest)) toIndex = Number(rest.match(/\bposition\s+(\d+)\b/)![1])
  else if (dest?.targets[0]?.index) {
    const m = dest.targets[0].index
    const before = text.slice(mentions[0].end, dest.index)
    toIndex = /\bbefore\b/.test(before) ? (from.index! < m ? m - 1 : m)
      : /\bafter\b/.test(before) ? (from.index! < m ? m : m + 1)
      : m
  }
  if (toIndex == null) return null
  toIndex = Math.max(1, Math.min(count, toIndex))
  if (toIndex === from.index) {
    warn(state, `${from.label} is already at position ${toIndex}.`)
    return []
  }
  return [{ type: 'moveScene', ...sceneRef(from), toIndex }]
}

const TRANSITIONS: Array<[RegExp, TransitionType]> = [
  [/\bflicker(?:\s+shake)?\b/, 'flickerShake'],
  [/\bflash(?:\s+blur)?\b/, 'flashBlur'],
  [/\bmorph\w*/, 'morph'],
  [/\b(?:cross\s?fade|dissolve|fade)\w*/, 'fade'],
  [/\bwipe\w*/, 'wipe'],
  [/\bzoom\w*/, 'zoom'],
  [/\bpush\w*/, 'push'],
  [SLIDE_WORD, 'slide'],
  [/\b(?:no|none|hard cut|cut)\b/, 'none'],
]

const transition: Handler = (clause, state) => {
  const text = clause.text
  const between = /\bbetween\b/.test(text) && /\b(?:scenes?|slides?)\b/.test(text)
  if (!/\btransitions?\b/.test(text) && !between) return null
  const type = TRANSITIONS.find(([re]) => re.test(text.replace(/\btransitions?\b/g, '')))?.[1] ?? 'fade'

  let scenes = readScenes(text, state) ?? defaultScenes(state)
  // A transition plays as a scene starts, so "between" scenes means every scene but the first one named.
  if (between) scenes = scenes.slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).slice(1)
  const duration = readTimes(text)[0]?.seconds
  const direction = readDirection(text) ?? (text.match(/\b(left|right|up|down)\b/)?.[1] as SlideDir | undefined)
  remember(state, undefined, scenes)
  return scenes.map(t => ({ type: 'setTransition', ...sceneRef(t), transition: { type, duration, direction } }))
}

const background: Handler = (clause, state) => {
  const text = clause.text
  const word = text.match(/\b(?:background|bg|backdrop)\b/)
  if (!word || word.index == null) return null
  // Colours right before "background" or anywhere after it ("dark blue background", "background to red").
  const bgStart = word.index
  const colors = readColors(text).filter(c => c.index > bgStart || text.slice(c.end, bgStart).trim() === '')
  // "make the text red on a blue background" is about the text unless a colour belongs to the background.
  if (mentionsElement(text.replace(/\b(?:background|bg|backdrop)\b/g, '')) && !colors.length) return null
  const scenes = readScenes(text, state) ?? defaultScenes(state)
  let bg: Background
  if (/\btransparent\b/.test(text)) bg = { type: 'transparent' }
  else if (colors.length >= 2 || (/\bgradient\b/.test(text) && colors.length)) {
    bg = { type: 'gradient', from: colors[0].hex, to: (colors[1] ?? colors[0]).hex, angle: 135, fromStop: 0, toStop: 100 }
  } else if (colors.length) bg = { type: 'solid', color: colors[0].hex }
  else {
    warn(state, 'Which colour should the background be? For example "make the background dark blue".')
    return []
  }
  remember(state, undefined, readScenes(text, state))
  return scenes.map(t => ({ type: 'setBackground', ...sceneRef(t), background: bg }))
}

const setDuration: Handler = (clause, state) => {
  const text = clause.text
  const time = readTimes(text)[0]?.seconds
  if (time == null) return null
  if (!/\b(?:make|set|change|extend|lengthen|increase|decrease|reduce|shorten)\b|\b(?:duration|long|length|lasts?)\b/.test(text)) return null
  const named = readScenes(text, state)
  const mentionsScene = named || /\b(?:scenes?|slides?)\b/.test(text)
  const itIsScene = !named && /\bit\b/.test(text) && !state.lastElements && state.lastScenes
  if (!mentionsScene && !itIsScene) return null
  if (NOUN_KINDS.some(kind => kind.re.test(text))) return null

  const targets = named ?? (itIsScene ? state.lastScenes! : defaultScenes(state))
  const grow = /\b(?:extend|lengthen|increase|longer)\b/.test(text) && /\bby\b/.test(text)
  const shrink = /\b(?:shorten|reduce|decrease|shorter)\b/.test(text) && /\bby\b/.test(text)
  const commands: AiEditorCommand[] = []
  for (const t of targets) {
    const current = t.sceneId ? sceneDuration(state, t) : 0
    const duration = grow ? current + time : shrink ? current - time : time
    if (duration < 0.5) { warn(state, `${t.label} would be shorter than 0.5s.`); continue }
    commands.push({ type: 'setSceneDuration', ...sceneRef(t), duration: round(duration) })
  }
  remember(state, undefined, named)
  return commands
}

const layer: Handler = (clause, state) => {
  const text = clause.text
  let order: AiArrangeOrder | null = null
  if (/\bbring\b.*\b(?:front|top)\b|\b(?:on|to)\s+(?:the\s+)?(?:front|top)\s+(?:layer|of\s+everything)\b|\babove\s+everything\b/.test(text)) order = 'front'
  else if (/\bsend\b.*\b(?:back|bottom|behind)\b|\bbehind\s+everything\b|\b(?:to|on)\s+(?:the\s+)?(?:bottom|back)\s+layer\b/.test(text)) order = 'back'
  else if (/\bbring\b.*\bforward\b|\bmove\b.*\b(?:forward|up a layer)\b/.test(text)) order = 'forward'
  else if (/\bsend\b.*\bbackward\b|\bmove\b.*\b(?:backward|down a layer)\b/.test(text)) order = 'backward'
  if (!order) return null
  const targets = elementsOrSelection(clause, state, readScenes(text, state))
  remember(state, targets)
  return targets.map(t => ({ type: 'arrangeElement', ...elementRef(t), order: order! }))
}

/**
 * Connectors: "connect the title to the circle", "connect the logo box to all
 * circles", "connect all circles in a chain", "fully connect the circles layer
 * by layer", "connect the selected items with red lines".
 */
const connect: Handler = (clause, state) => {
  const text = clause.text
  if (!/\b(?:connect|link|wire|join)\w*\b/.test(text)) return null
  const scenes = readScenes(text, state)
  const sides = text.match(/^(.*?)\bto\b(.*)$/)
  const oneGroup = !sides || /\bto (?:each other|one another|the next|every|its)\b/.test(text)

  let from: ElementTarget[]
  let to: ElementTarget[] | undefined
  if (oneGroup) {
    from = elementsOrSelection(clause, state, scenes)
  } else {
    from = readElements({ ...clause, text: sides![1] }, state, { scenes }) ?? readElements({ ...clause, text: 'selected' }, state)!
    to = readElements({ ...clause, text: sides![2] }, state, { scenes }) ?? []
    if (!to.length) return []
  }
  if (!from.length || (!to && from.length < 2)) {
    if (from.length === 1 && !to) warn(state, 'Connect needs at least two items — say what to connect it to.')
    return []
  }

  const mode = /\b(?:fully|densely|layer by layer|column by column|each (?:layer|column) to the next|every \w+ to every)\b/.test(text) ? 'columns' as const
    : /\b(?:hub|star|first to all|to all the others)\b/.test(text) ? 'hub' as const
    : 'chain' as const
  const thickness = numberAfter(text, '(?:width|thickness)') ?? (/\bthin\b/.test(text) ? 1 : /\bthick\b/.test(text) ? 4 : undefined)
  const fromSelection = /\b(?:selected|selection|these|this)\b/.test(oneGroup ? text : sides![1])
  remember(state, [...from, ...(to ?? [])])
  return [{
    type: 'connectElements',
    from: from.map(elementRef),
    to: to?.map(elementRef),
    mode: to ? undefined : mode,
    keepOrder: fromSelection && !to,
    color: valueColors(text)[0]?.hex,
    width: thickness,
    heads: /\blines?\b|\bwithout (?:arrow ?)?heads?\b|\bno (?:arrow ?)?heads?\b/.test(text) && !/\barrows?\b/.test(text) ? false : undefined,
  }]
}

const SHAPE_WORDS: Array<[RegExp, ShapeType]> = [
  [/\bcircles?\b/, 'circle'], [/\b(?:squares?|rectangles?|rects?|box|boxes)\b/, 'rect'], [/\btriangles?\b/, 'triangle'],
  [/\bstars?\b/, 'star'], [/\bhearts?\b/, 'heart'], [/\bhexagons?\b/, 'hexagon'], [/\bpentagons?\b/, 'pentagon'],
  [/\boctagons?\b/, 'octagon'], [/\bdiamonds?\b/, 'diamond'], [/\b(?:ovals?|ellipses?)\b/, 'oval'],
  [/\bcubes?\b/, 'cube'], [/\bcones?\b/, 'cone'], [/\bspeech bubbles?\b/, 'speechBubble'],
]

const addElement: Handler = (clause, state) => {
  const text = clause.text
  if (!/\b(?:add|insert|create|draw|include)\b/.test(text) && !/\b(?:put|place)\s+(?:an?|some|another|new)\b/.test(text)) return null
  // "add a fade to the title" / "add animation to it" target an existing element.
  if (/\bto\s+(?:it|them|this|these|that)\b/.test(text) ||
      NOUN_KINDS.some(kind => new RegExp(`\\bto\\s+(?:the|all|every|each)\\s+(?:\\w+\\s+)?${kind.re.source}`).test(text))) return null

  const scenes = readScenes(text, state) ?? defaultScenes(state)
  // "slides in from the left" is an animation direction, not a position.
  const position = readPosition(/\b(?:slid|wip)/.test(text) ? text.replace(/\bfrom\s+(?:the\s+)?(?:left|right|top|bottom)\b/g, '') : text)
  const size = readSize(text)
  const commands: AiEditorCommand[] = []
  const created: ElementTarget[] = []
  const place = (alias: string, t: SceneTarget, label: string) => {
    if (position) commands.push({ type: 'alignElement', elementAlias: alias, targetLabel: label, ...sceneRef(t), ...position })
  }

  // 1. A project asset: "@clip.mp4", "the intro video", or the only asset of that type.
  const asset = findAsset(clause, state)
  if (asset) {
    for (const t of scenes) {
      const alias = nextAlias(state, 'el')
      const base = { ...sceneRef(t), alias, assetId: asset.id, assetName: asset.filename }
      if (asset.type === 'audio') {
        commands.push({ type: 'addAudioFromAsset', ...base, timelineX: timeAfter(text, ['at', 'from', 'starting at']) ?? 0 })
      } else {
        commands.push({ type: asset.type === 'video' ? 'addVideoFromAsset' : 'addImageFromAsset', ...base, ...size })
        place(alias, t, asset.name)
      }
      created.push({ ref: { elementAlias: alias, targetLabel: asset.name }, type: asset.type, label: asset.name })
    }
    remember(state, created, readScenes(text, state))
    return commands
  }

  // 2. Text.
  const textKind = text.match(/\b(title|heading|headline|subtitle|caption|label|text|quote|words?)\b/)?.[1]
  const shape = SHAPE_WORDS.find(([re]) => re.test(text))?.[1]
  if (textKind || (!shape && clause.quotes.length)) {
    const isTitle = textKind === 'title' || textKind === 'heading' || textKind === 'headline'
    const content = clause.quotes[0] ?? (isTitle ? 'Title' : 'New text')
    const fontSize = numberAfter(text, '(?:font size|text size|size)') ?? (isTitle ? 72 : textKind === 'subtitle' || textKind === 'caption' ? 40 : undefined)
    const animation = readAnimation(text)
    for (const t of scenes) {
      const alias = nextAlias(state, 'el')
      commands.push({
        type: 'addText', ...sceneRef(t), alias, text: content,
        fontSize,
        fontFamily: readFontFamily(clause) ?? undefined,
        fontWeight: isTitle || /\bbold\b/.test(text) ? 'bold' : undefined,
        color: valueColors(text)[0]?.hex,
        animation: animation ?? undefined,
        ...size,
      })
      place(alias, t, `"${content}"`)
      created.push({ ref: { elementAlias: alias, targetLabel: `"${content}"` }, type: 'text', label: `"${content}"` })
    }
    remember(state, created, readScenes(text, state))
    return commands
  }

  // 3. Shapes.
  if (shape) {
    const colors = readColors(text)
    const strokeColor = colors.find(c => isBorderColor(text, c))
    const fill = colors.find(c => c !== strokeColor)?.hex
    const side = numberAfter(text, '(?:size|width)')
    const animation = readAnimation(text)
    for (const t of scenes) {
      const alias = nextAlias(state, 'el')
      commands.push({
        type: 'addShape', ...sceneRef(t), alias, shapeType: shape, fill,
        stroke: strokeColor?.hex,
        strokeWidth: numberAfter(text, '(?:border|outline|stroke)(?: width)?') ?? (strokeColor ? 4 : undefined),
        ...(size ?? (side ? { width: side, height: side } : {})),
      })
      place(alias, t, `the ${shape}`)
      if (animation) commands.push({ type: 'addAnimation', elementAlias: alias, targetLabel: `the ${shape}`, animation })
      created.push({ ref: { elementAlias: alias, targetLabel: `the ${shape}` }, type: 'shape', label: `the ${shape}` })
    }
    remember(state, created, readScenes(text, state))
    return commands
  }

  // 4. A media type without a specific asset.
  const mediaType = /\b(?:images?|photos?|pictures?|logos?)\b/.test(text) ? 'image'
    : /\b(?:videos?|clips?|footage)\b/.test(text) ? 'video'
    : /\b(?:music|songs?|audio|sounds?|voice-?\s?overs?)\b/.test(text) ? 'audio'
    : null
  if (mediaType) {
    const count = state.context.assets.filter(a => a.type === mediaType).length
    warn(state, count
      ? `Which ${mediaType}? Mention it with @, for example "add @${state.context.assets.find(a => a.type === mediaType)!.filename}".`
      : `There is no ${mediaType} in the project yet. Upload one first.`)
    return []
  }
  return null
}

function findAsset(clause: Clause, state: ParseState) {
  const text = clause.text
  const quoted = clause.quotes.map(q => q.toLowerCase())
  const mention = text.match(/@([\w._()-]+)/)?.[1]
  const assets = state.context.assets
  const byName = (name: string) => assets.find(a => a.filename.toLowerCase() === name || a.name.toLowerCase() === name)
  if (mention) {
    const found = byName(mention) ?? assets.find(a => a.filename.toLowerCase().startsWith(mention))
    if (found) return found
    warn(state, `No asset named "${mention}" in this project.`)
    return null
  }
  for (const q of quoted) {
    const found = byName(q)
    if (found) return found
  }
  return assets
    .filter(a => a.filename.length >= 4 && new RegExp(`(?<![\\w])${escape(a.filename.toLowerCase())}(?![\\w])`).test(text))
    .sort((a, b) => b.filename.length - a.filename.length)[0] ?? null
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const MEDIA_WORDS = /\b(?:mute|unmute|volume|louder|quieter|softer|silence|speed\s+(?:it\s+|them\s+|the\s+\w+\s+)?up|slow\s+(?:it\s+|them\s+|the\s+\w+\s+)?down|playback|faster|slower|normal speed)\b/
const AUDIO_NOUN = /\b(?:music|songs?|soundtrack|bgm|audio|sounds?|voice-?\s?overs?|narration|voice)\b/
const MEDIA_NOUN = /\b(?:music|songs?|soundtrack|bgm|audio|sounds?|voice-?\s?overs?|narration|voice|videos?|clips?|footage)\b/

const media: Handler = (clause, state) => {
  const text = clause.text
  const fadeAudio = AUDIO_NOUN.test(text) && /\bfad/.test(text)
  const loopMedia = MEDIA_NOUN.test(text) && /\b(?:loop|looping|repeat)\b/.test(text)
  const lengthMedia = MEDIA_NOUN.test(text) && readTimes(text).length > 0 && /\b(?:long|length|duration|make|set)\b/.test(text)
  if (!MEDIA_WORDS.test(text) && !fadeAudio && !loopMedia && !lengthMedia) return null

  const scenes = readScenes(text, state)
  const targets = (readElements(clause, state, { scenes }) ?? readElements({ ...clause, text: 'selected' }, state)!)
  const commands: AiEditorCommand[] = []
  for (const t of targets) {
    const isAudio = t.type === 'audio'
    if (t.type !== 'video' && !isAudio) { warn(state, `${t.label} has no sound to change.`); continue }
    const s = t.summary
    const patch: Record<string, unknown> = {}
    if (/\bunmute\b/.test(text)) Object.assign(patch, isAudio ? { volume: 1 } : { muted: false })
    else if (/\b(?:mute|silence)\b/.test(text)) Object.assign(patch, isAudio ? { volume: 0 } : { muted: true })

    const percent = readPercent(text)
    const maxVolume = isAudio ? 2 : 1
    if (/\bvolume\b/.test(text) && percent != null) patch.volume = Math.min(maxVolume, percent)
    else if (/\b(?:louder|turn\s+(?:it\s+)?up|raise|increase)\b/.test(text)) patch.volume = Math.min(maxVolume, round((s?.volume ?? 1) * 1.5))
    else if (/\b(?:quieter|softer|turn\s+(?:it\s+)?down|lower|decrease|reduce)\b/.test(text)) patch.volume = round((s?.volume ?? 1) * 0.5)

    const factor = readFactor(text)
    const speedKey = isAudio ? 'speed' : 'playbackRate'
    if (/\bnormal speed\b/.test(text)) patch[speedKey] = 1
    else if (/\b(?:speed|faster|slower|slow|playback|rate)\b/.test(text)) {
      const rate = factor ?? (percent != null ? percent : /\b(?:slow|slower)\b/.test(text) ? 0.5 : 1.5)
      patch[speedKey] = Math.max(0.25, Math.min(isAudio ? 2 : 4, /\bslow/.test(text) && factor && factor > 1 ? 1 / factor : rate))
    }

    if (/\b(?:stop|no|don't|dont|without)\s+(?:loop|looping|repeat)/.test(text)) patch.loop = false
    else if (/\b(?:loop|looping|repeat)\b/.test(text)) patch.loop = true

    if (lengthMedia && !/\bfad/.test(text)) patch.duration = readTimes(text)[0].seconds

    if (/\bfad/.test(text)) {
      if (!isAudio) continue
      const seconds = readTimes(text)[0]?.seconds ?? 1
      if (/\bout\b/.test(text)) patch.fadeOut = seconds
      if (/\bin\b/.test(text) || !/\bout\b/.test(text)) patch.fadeIn = seconds
    }
    if (Object.keys(patch).length) commands.push({ type: 'updateElement', ...elementRef(t), patch })
  }
  remember(state, targets)
  return commands
}

const moveAnimation: Handler = (clause, state) => {
  const text = clause.text
  if (!/\b(?:move|moves|moving|glide|travel)\b/.test(text)) return null
  if (!/\b(?:speed|delay|animat\w*|towards?|off[\s-]?screen|outside|exit|motion)\b/.test(text)) return null
  const pos = readPosition(text)
  const direction = !pos ? 'left'
    : pos.vertical && pos.horizontal && pos.horizontal !== 'center' && pos.vertical !== 'middle'
      ? `${pos.vertical}${pos.horizontal === 'left' ? 'Left' : 'Right'}` as 'topLeft'
      : pos.horizontal === 'left' || pos.horizontal === 'right' ? pos.horizontal
      : pos.vertical === 'top' ? 'top' : pos.vertical === 'bottom' ? 'bottom' : 'left'
  const targets = elementsOrSelection(clause, state, readScenes(text, state))
  remember(state, targets)
  return targets.map(t => ({
    type: 'applyMove', ...elementRef(t), direction,
    speed: numberAfter(text, 'speed') ?? undefined,
    delay: timeAfter(text, ['delay', 'after', 'delayed by']) ?? numberAfter(text, 'delay') ?? undefined,
    moveOutside: /\b(?:off[\s-]?screen|outside|out of (?:the )?(?:frame|screen|canvas)|exit)\b/.test(text),
  }))
}

const STAGGER_RE = /\bone (?:by|after) (?:one|another|the other)\b|\bin (?:sequence|turn)\b|\bstagger\w*|\b\d+(?:\.\d+)?\s*(?:ms|s|secs?|seconds?)\s+apart\b|\b(?:layer|column|row) by (?:layer|column|row)\b|\bwave\b|\b(?:left|right|top|bottom) to (?:left|right|top|bottom)\b/
const ORDER_WORDS: Array<[RegExp, NonNullable<AiWave['order']>]> = [
  [/\bright to left\b/, 'rightToLeft'], [/\bleft to right\b/, 'leftToRight'],
  [/\btop to bottom\b/, 'topToBottom'], [/\bbottom to top\b/, 'bottomToTop'],
]
const REVERSE: Record<NonNullable<AiWave['order']>, NonNullable<AiWave['order']>> = {
  leftToRight: 'rightToLeft', rightToLeft: 'leftToRight', topToBottom: 'bottomToTop', bottomToTop: 'topToBottom', given: 'given',
}

/**
 * Staggered waves: "pulse all circles left to right one by one, then flash them
 * red right to left, and repeat". A wave clause right after another joins the
 * same sequence, so the waves share one repeat.
 */
const sequence: Handler = (clause, state) => {
  const text = clause.text
  if (!STAGGER_RE.test(text)) return null
  const spec = readAnimation(text)
  if (!spec) return null
  const targets = elementsOrSelection(clause, state, readScenes(text, state))
  if (!targets.length) return []

  const previous = state.lastSequence?.waves.at(-1)
  const named = ORDER_WORDS.find(([re]) => re.test(text))?.[1]
  const order = named ?? (previous && /\b(?:back(?:ward)?s?|in reverse|reversed?)\b/.test(text) ? REVERSE[previous.order ?? 'leftToRight'] : 'leftToRight')
  const step = text.match(/(\d+(?:\.\d+)?)\s*(ms|s|secs?|seconds?)\s+apart\b/)
  const stepSeconds = step ? Number(step[1]) / (step[2] === 'ms' ? 1000 : 1) : timeAfter(text, ['stagger of', 'step of', 'steps of', 'gap of'])
  const wave: AiWave = {
    targets: targets.map(elementRef),
    animation: {
      type: spec.type,
      timing: spec.timing,
      duration: spec.duration,
      direction: spec.direction,
      color: spec.type === 'colorPulse' ? valueColors(text)[0]?.hex : undefined,
    },
    order,
    // A following wave mirrors the previous one unless told otherwise (a backward pass).
    step: stepSeconds ?? previous?.step,
    together: /\b(?:layer|column|row) by (?:layer|column|row)\b|\b(?:layers?|columns?|rows?) (?:at once|together)\b|\bper (?:layer|column|row)\b/.test(text) || Boolean(previous?.together),
  }
  const repeatWord = /\b(?:repeat\w*|again and again|forever|keep (?:going|repeating|looping)|on (?:a )?loop|loop(?:ing|s)?)\b/.test(text)
  const repeat = repeatWord ? timeAfter(text, ['repeat every', 'repeating every', 'every']) ?? true : false

  state.sequenceTouched = true
  remember(state, targets)
  if (state.lastSequence) {
    state.lastSequence.waves.push(wave)
    if (repeat) state.lastSequence.repeat = repeat
    return []
  }
  const start = /\b(?:after (?:that|the last|everything|all)|afterwards|at the end)\b/.test(text)
    ? 'afterLast' as const
    : timeAfter(text, ['starting at', 'start at', 'from']) ?? spec.delay
  const command: Extract<AiEditorCommand, { type: 'animateSequence' }> = { type: 'animateSequence', waves: [wave], start, repeat }
  state.lastSequence = command
  return [command]
}

const animate: Handler = (clause, state) => {
  const text = clause.text
  if (/\brotat\w*\s+(?:[^\d\s]\S*\s+){0,4}(?:by\s+|to\s+)?-?\d/.test(text)) return null // static rotation
  const spec = readAnimation(text)
  if (!spec) return null
  const targets = elementsOrSelection(clause, state, readScenes(text, state))
  const commands: AiEditorCommand[] = []
  for (const t of targets) {
    if (t.type === 'audio') { warn(state, `${t.label} is audio — try "fade in the music over 2s".`); continue }
    const fitted = animationFor(spec, t.type, state)
    if (fitted) commands.push({ type: 'addAnimation', ...elementRef(t), animation: fitted })
  }
  remember(state, targets)
  return commands
}

const position: Handler = (clause, state) => {
  const text = clause.text
  if (!/\b(?:move|put|place|position|align|center|centre|snap|nudge|shift)\b/.test(text)) return null
  if (/\balign\s+(?:the\s+)?text\b|\b(?:left|center|centre|right)[\s-]?align|\bjustif/.test(text)) return null // text alignment
  const nudge = text.match(/\b(\d+)\s*(?:px|pixels?)?\s+(?:to\s+the\s+)?(left|right|up|down|higher|lower)\b/)
  const pos = readPosition(text)
  if (!nudge && !pos) return null
  const targets = elementsOrSelection(clause, state, readScenes(text, state))
  remember(state, targets)
  if (nudge) {
    const amount = Number(nudge[1])
    const dir = nudge[2]
    return targets.map(t => {
      const s = t.summary
      const patch = dir === 'left' || dir === 'right'
        ? { x: (s?.x ?? 0) + (dir === 'left' ? -amount : amount) }
        : { y: (s?.y ?? 0) + (dir === 'up' || dir === 'higher' ? -amount : amount) }
      return { type: 'updateElement', ...elementRef(t), patch }
    })
  }
  return targets.map(t => ({ type: 'alignElement', ...elementRef(t), ...pos }))
}

const modify: Handler = (clause, state) => {
  const text = clause.text
  const patchFor = (t: ElementTarget): Record<string, unknown> => {
    const s = t.summary
    const patch: Record<string, unknown> = {}
    const isText = t.type === 'text'

    // Text content and names: "change the title text to 'Hi'", "rename the circle to 'Badge'".
    const toQuote = text.match(/\bto\s+(?:say\s+|read\s+)?⟦(\d+)⟧/)?.[1] ?? text.match(/\b(?:say|says|read|reads)\s+⟦(\d+)⟧/)?.[1]
    if (toQuote != null) {
      if (/\brename\b|\bname\b/.test(text)) patch.name = clause.quotes[Number(toQuote)]
      else if (isText) patch.content = clause.quotes[Number(toQuote)]
    }
    const replace = text.match(/\breplace\s+⟦(\d+)⟧\s+with\s+⟦(\d+)⟧/)
    if (replace && isText && s?.text) patch.content = s.text.split(clause.quotes[Number(replace[1])]).join(clause.quotes[Number(replace[2])])

    // Colour: border/outline colours go to the stroke; otherwise text colour or shape fill.
    const colors = valueColors(text)
    const border = colors.find(c => isBorderColor(text, c))
    const main = colors.find(c => c !== border)
    const borderWidth = numberAfter(text, '(?:border|outline|stroke)(?: width)?')
    if (border || borderWidth != null) {
      if (t.type === 'shape' || t.type === 'image' || t.type === 'video') {
        const key = t.type === 'shape' ? 'stroke' : 'borderColor'
        const widthKey = t.type === 'shape' ? 'strokeWidth' : 'borderWidth'
        if (border) patch[key] = border.hex
        // A border colour on a 0-width border would be invisible.
        patch[widthKey] = borderWidth ?? (s?.strokeWidth ? s.strokeWidth : 4)
      } else {
        warn(state, `${t.label} has no border.`)
      }
    }
    if (main) {
      if (isText || t.type === 'icon') patch.color = main.hex
      else if (t.type === 'shape') patch.fill = main.hex
    }

    // Size.
    const size = readSize(text)
    const fontSize = numberAfter(text, '(?:font size|text size|font)') ?? (isText ? numberAfter(text, 'size') : null)
    const factor = readFactor(text) ?? (/\b(?:scale|resize|size)\b/.test(text) ? readPercent(text) : null)
    const grow = /\b(?:bigger|larger|enlarge|grow|increase the size)\b/.test(text)
    const shrink = /\b(?:smaller|shrink|decrease the size|reduce the size)\b/.test(text)
    const scale = factor ?? (grow ? 1.25 : shrink ? 0.8 : null)
    if (/\b(?:full\s?screen|fill (?:the )?(?:screen|frame|canvas)|fit (?:the )?(?:screen|frame|canvas)|full size)\b/.test(text)) {
      Object.assign(patch, { x: 0, y: 0, width: state.context.project.width, height: state.context.project.height })
    } else if (size && !isText) {
      Object.assign(patch, size)
    } else if (fontSize != null && isText) {
      patch.fontSize = fontSize
    } else if (scale != null && s) {
      if (isText) patch.fontSize = Math.round((s.fontSize ?? 55) * scale)
      else if (s.width && s.height) {
        const width = Math.round(s.width * scale)
        const height = Math.round(s.height * scale)
        Object.assign(patch, { width, height, x: Math.round(s.x - (width - s.width) / 2), y: Math.round(s.y - (height - s.height) / 2) })
      }
    }

    // Opacity and visibility.
    const percent = readPercent(text)
    if (/\bopacity\b/.test(text) && percent != null) patch.opacity = percent
    else if (/\btransparent\b/.test(text) && percent != null) patch.opacity = round(1 - percent)
    else if (/\b(?:semi[\s-]?transparent|translucent|see[\s-]?through)\b/.test(text)) patch.opacity = 0.5
    else if (/\b(?:opaque|fully visible|solid)\b/.test(text) && !main) patch.opacity = 1
    if (/\b(?:hide|invisible)\b/.test(text)) patch.visible = false
    else if (/\b(?:show|unhide|visible)\b/.test(text)) patch.visible = true

    // Text style.
    if (isText) {
      if (/\b(?:not bold|unbold|normal weight|regular weight)\b/.test(text)) patch.fontWeight = 'normal'
      else if (/\bbold\b/.test(text)) patch.fontWeight = 'bold'
      if (/\b(?:not italic|no italics?)\b/.test(text)) patch.italic = false
      else if (/\bitalic\w*/.test(text)) patch.italic = true
      if (/\b(?:not underlined|no underline|remove (?:the )?underline)\b/.test(text)) patch.underline = false
      else if (/\bunderline\w*/.test(text)) patch.underline = true
      const font = readFontFamily(clause)
      if (font) patch.fontFamily = font
      const align = text.match(/\b(left|center|centre|right)[\s-]?(?:align(?:ed)?|justif\w*)\b|\balign\s+(?:the\s+)?text\s+(?:to\s+the\s+)?(left|center|centre|right)\b/)
      if (align) patch.align = (align[1] ?? align[2]).replace('centre', 'center')
    }

    // Rotation, corners, lock.
    const rotation = text.match(/\brotat\w*\s+(?:[^\d\s]\S*\s+){0,4}?(by\s+|to\s+)?(-?\d+(?:\.\d+)?)\s*(?:degrees?|deg|°)?/)
    if (rotation) {
      const value = Number(rotation[2])
      patch.rotation = rotation[1]?.trim() === 'to' || !s ? value : (s.rotation ?? 0) + value
    }
    if (/\brounded\b|\bround (?:the )?corners\b/.test(text)) patch.cornerRadius = numberAfter(text, '(?:radius|corners?)') ?? 24
    if (/\bunlock\b/.test(text)) patch.locked = false
    else if (/\block\b/.test(text)) patch.locked = true
    return patch
  }

  const hasEdit = /\b(?:make|set|change|turn|color|colour|paint|resize|scale|rename|enlarge|shrink|grow|use|give|apply|hide|show|unhide|lock|unlock|rotate|replace|bold|italic|underline|opacity|font|bigger|smaller|larger)\b/.test(text) ||
    readColors(text).length > 0
  if (!hasEdit) return null
  const quoteValue = [...text.matchAll(/\b(?:to|say|says|read|reads|with)\s+(?:say\s+|read\s+)?⟦(\d+)⟧/g)].map(m => Number(m[1]))
  const scenes = readScenes(text, state)
  const targets = readElements(clause, state, { scenes, skipQuotes: quoteValue }) ??
    (mentionsElement(text) ? [] : readElements({ ...clause, text: 'selected' }, state)!)

  const commands: AiEditorCommand[] = []
  for (const t of targets) {
    const patch = patchFor(t)
    if (Object.keys(patch).length) commands.push({ type: 'updateElement', ...elementRef(t), patch })
  }
  if (targets.length && !commands.length) return null
  remember(state, targets)
  return commands
}

/** In priority order: the first handler that claims a clause wins. */
export const HANDLERS: Handler[] = [
  smart, addScene, remove, duplicate, split, trim, reorder, transition, background, setDuration,
  layer, connect, addElement, media, moveAnimation, sequence, animate, position, modify,
]
