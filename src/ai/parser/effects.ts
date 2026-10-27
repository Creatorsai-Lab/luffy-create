/**
 * Video and image effects, speed ramps and freeze frames from plain language:
 *   "add a neon outline to me", "make the video look like VHS", "phonk edit on
 *   the beat", "give it a teal and orange look", "add a strong glitch from 2s to
 *   4s", "remove the glitch", "remove all effects", "velocity edit", "slow-mo
 *   start", "bullet time", "freeze the frame at 2s for 1.5s".
 * Only for videos and images — "make the title glow" stays an animation.
 */
import type { AiElementSummary, AiPlanStep } from '../types'
import { fxDef, fxFromWords, lookFromWords } from '../../engine/fx/catalog'
import type { FxType } from '../../types/editor'
import { readColors } from './colors'
import { pickTargets } from './keying'
import { NOUN_KINDS, readScenes, warn, type ParseState } from './refs'
import { readTimes, type Clause } from './text'

const SPEED_CONTEXT = /\b(?:speed|velocity|ramp|curve|slow[\s-]?mo(?:tion)?)\b/
const REMOVE = /\b(?:remove|delete|clear|turn off|get rid of|take off|no more|drop|undo)\b/
const MEDIA = /\b(?:videos?|clips?|footage|images?|photos?|pictures?|pics?|me|myself|person)\b/
const PRONOUN = /\b(?:it|its|them|this|that|these|those|him|her)\b/
const BEAT = /\b(?:on|to|with)\s+(?:the\s+)?(?:beats?|music|rhythm)\b|\bbeat[\s-]?sync\w*|\bsync(?:ed)?\s+to\s+the\s+(?:music|beats?)\b/
const EXPLICIT = /\b(?:effects?|filters?|looks?|grades?|edit)\b/
/** Effects whose words are also animations ("flash them", "make it float") — these need something pointing at a clip. */
const AMBIGUOUS = new Set<FxType>([
  'glow', 'flash', 'shake', 'float', 'wiggle', 'drift', 'flicker', 'strobe', 'wave', 'swirl', 'bulge', 'ripple',
  'kenBurnsIn', 'kenBurnsOut',
])

/** The speed ramp a clause asks for: a preset, 'none' to remove it, or null. */
function readSpeedPreset(text: string): string | null {
  if (REMOVE.test(text) && /\b(?:speed\s*(?:ramp|curve)s?|velocity|slow[\s-]?mo(?:tion)?)\b/.test(text)) return 'none'
  if (/\bconstant\s+speed\b/.test(text)) return 'none'
  if (/\bslow[\s-]?mo(?:tion)?\s+(?:start|intro|at\s+the\s+(?:start|beginning))\b|\b(?:start|begin|open)\w*\s+(?:in|with)\s+(?:a\s+)?slow[\s-]?mo(?:tion)?\b/.test(text)) return 'slowmoStart'
  if (/\bbullet[\s-]?time\b/.test(text)) return 'bullet'
  if (/\bhero[\s-]?time\b/.test(text) || (/\bhero\b/.test(text) && SPEED_CONTEXT.test(text))) return 'hero'
  if (/\bflash\s+in\b/.test(text) && SPEED_CONTEXT.test(text)) return 'flashIn'
  if (/\bflash\s+out\b/.test(text) && SPEED_CONTEXT.test(text)) return 'flashOut'
  if (/\bjump\b/.test(text) && /\b(?:speed|velocity)\b/.test(text)) return 'jump'
  if (/\bmontage\b/.test(text) && SPEED_CONTEXT.test(text)) return 'montage'
  if (/\bvelocity(?:\s+edit)?\b|\bspeed[\s-]*(?:ramp|curve)\w*/.test(text)) return 'montage'
  return null
}

export function effectsHandler(clause: Clause, state: ParseState): AiPlanStep[] | null {
  const text = clause.text
  if (/\btransitions?\b/.test(text)) return null

  const speed = readSpeedPreset(text)
  const freeze = /\bfreez(?:e|es|ing)\b/.test(text)
  const look = /\b(?:look|grade|grading|filter|lut|tone|feel|vibe|style)\b/.test(text) || /\bblack\s+and\s+white\b|\bteal\s*(?:and|&)\s*orange\b|\bnoir\b/.test(text) ? lookFromWords(text) : null
  const named = fxFromWords(text)
  const type: FxType | null = look ? 'look' : named
  const removing = REMOVE.test(text)
  const removeAll = removing && /\b(?:all\s+(?:the\s+)?)?(?:effects?|filters?|looks?|grades?)\b/.test(text) && !named
  if (!speed && !freeze && !type && !removeAll) return null

  // Items that aren't videos or images ("make the title glow") belong to other handlers — and so does
  // "it" / "them" when the previous step was about such items.
  const other = NOUN_KINDS.some(kind => !kind.types.some(t => t === 'image' || t === 'video') && kind.re.test(text))
  if (other) return null
  const pronoun = PRONOUN.test(text)
  const lastIsMedia = Boolean(state.lastElements?.some(t => t.type === 'video' || t.type === 'image'))
  if (pronoun && state.lastElements?.length && !lastIsMedia && !MEDIA.test(text)) return null

  const sceneTarget = readScenes(text, state)?.[0]
  const scene = sceneTarget
    ? state.context.scenes.find(sc => sc.id === sceneTarget.sceneId)
    : state.context.scenes.find(sc => sc.index === state.context.currentSceneIndex)
  const media = scene?.elements.filter(el => el.type === 'video' || el.type === 'image') ?? []
  const selected = media.filter(el => state.context.selectedIds.includes(el.id))
  // "film grain" or "lens flare" can only mean a clip; "flash" or "float" only when something points at one.
  const explicit = MEDIA.test(text) || EXPLICIT.test(text)
  const specific = Boolean(type && !AMBIGUOUS.has(type))
  // "a paper texture background" is the scene's background.
  if (/\bbackground\b/.test(text) && type !== 'spotlight' && !explicit && !selected.length) return null
  if (!media.length) {
    if (speed || freeze || explicit || specific || removeAll) { warn(state, 'There is no video or image on this scene.'); return [] }
    return null
  }
  if (!speed && !freeze && !explicit && !specific && !selected.length && !(pronoun && lastIsMedia)) return null

  const targets = pickTargets(text, clause, media, selected, state)
  state.lastElements = targets.map(el => ({ ref: { elementId: el.id, targetLabel: el.name }, type: el.type, summary: el, sceneId: scene?.id, label: el.name }))
  const ref = (el: AiElementSummary, sceneId = scene?.id) => ({ elementId: el.id, sceneId, targetLabel: el.name })
  // A clip cut into parts gets the effect in every part (as in the Effects panel).
  const withParts = (list: AiElementSummary[]) => {
    const seen = new Set<string>()
    return list.flatMap(el => el.type !== 'video' || !el.src ? [{ el, sceneId: scene?.id }]
      : state.context.scenes.flatMap(sc => sc.elements.filter(o => o.type === 'video' && o.src === el.src).map(o => ({ el: o, sceneId: sc.id }))))
      .filter(({ el }) => !seen.has(el.id) && Boolean(seen.add(el.id)))
  }
  const videos = targets.filter(el => el.type === 'video')

  if (speed) {
    if (!videos.length) { warn(state, 'Speed ramps work on videos.'); return [] }
    return videos.map(el => ({ type: 'setSpeedCurve' as const, ...ref(el), preset: speed }))
  }
  if (freeze) {
    if (!videos.length) { warn(state, 'Freeze frames work on videos.'); return [] }
    const times = readTimes(text)
    const forAt = text.search(/\bfor\b/)
    const holdTime = forAt >= 0 ? times.find(t => t.index > forAt) : undefined
    const at = times.find(t => t !== holdTime)?.seconds ?? 0
    const hold = removing ? 0 : holdTime?.seconds ?? 1
    return videos.map(el => ({ type: 'freezeFrame' as const, ...ref(el), at, hold }))
  }

  if (removeAll || (removing && type)) {
    return withParts(targets).map(({ el, sceneId }) => ({
      type: 'removeEffects' as const, ...ref(el, sceneId), ...(removeAll ? {} : { effect: type! }),
    }))
  }
  if (!type) return null

  const def = fxDef(type)
  const params: Record<string, string | number | boolean> = {}
  if (type === 'look' && look) params.look = look
  const colorParam = def.params.find(p => p.kind === 'color')
  const colors = readColors(text)
  if (colorParam && colors.length) params[colorParam.key] = colors[0].hex
  const strong = /\b(?:strong|heavy|intense|big|extreme|hard|crazy)\b/.test(text)
  const subtle = /\b(?:subtle|light|gentle|soft|slight|little)\b/.test(text)
  // "from 2s to 5s", "for the first 3 seconds", "for 2 seconds".
  const times = readTimes(text)
  const window = /\bfrom\b/.test(text) && times.length >= 2 ? { start: times[0].seconds, end: times[1].seconds }
    : /\bfirst\b/.test(text) && times.length ? { start: 0, end: times[0].seconds }
    : /\bfor\b/.test(text) && times.length ? { start: 0, end: times[0].seconds }
    : {}
  const beatSync = def.beat && (BEAT.test(text) || type === 'phonk') ? true : undefined

  return withParts(targets).map(({ el, sceneId }) => ({
    type: 'addEffect' as const,
    ...ref(el, sceneId),
    effect: type,
    ...(Object.keys(params).length && { params }),
    ...(strong ? { intensity: 0.95 } : subtle ? { intensity: Math.max(0.2, def.intensity * 0.5) } : {}),
    ...(beatSync && { beatSync }),
    ...window,
  }))
}
