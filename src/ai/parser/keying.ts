/**
 * Green screen and background removal from plain language:
 *   "remove the green screen", "key out the blue screen", "chroma key video 2",
 *   "remove the background from my video", "cut me out", "blur my background",
 *   "replace the background behind me with black", "bring the background back".
 * Only when the scene has a video or image — otherwise "background" means the
 * scene background (the background handler).
 */
import type { AiElementSummary, AiPlanStep } from '../types'
import type { MediaKeying } from '../../types/editor'
import { KEYING_DEFAULTS } from '../../utils/keying'
import { readColors } from './colors'
import { readScenes, warn, type ParseState } from './refs'
import type { Clause } from './text'

const SCREEN = /\b(?:green|blue)[\s-]?screens?\b|\bchroma[\s-]?key\w*|\bkey(?:ing)?\s+out\b|\bkey\s+(?:the\s+)?(?:green|blue)\b/
const PERSON = /\b(?:remove|cut out|erase|delete|get rid of|take out|drop|hide|replace|change|swap)\b.*\bbackgrounds?\b|\bbackgrounds?\b.*\b(?:remov\w*|eras\w*)\b|\bcut\s+(?:me|him|her|them|the (?:person|speaker|subject|people))\s+out\b|\b(?:isolate|extract)\s+(?:me|him|her|them|the (?:person|speaker|subject))\b|\bblur\w*\s+(?:my|the|their|his|her|our)\s+(?:background|backdrop|room)\b|\bbackgrounds?\s+(?:behind|around)\s+(?:me|him|her|them|the (?:person|speaker))\b|\bportrait mode\b/
const OFF = /\b(?:turn off|disable|stop|undo|no more|without|bring back|restore|put back|show)\b|\bback\b.*\bbackground\b/
/** "bring the background back", "restore the original background", "turn off the cut-out". */
const RESTORE = /\b(?:bring|put|get)\s+(?:the\s+|my\s+)?(?:original\s+)?(?:background|bg)\s+back\b|\b(?:bring back|restore|put back|unhide)\s+(?:the\s+|my\s+)?(?:original\s+)?(?:background|bg)\b|\b(?:turn off|disable|stop|undo|remove)\s+(?:the\s+)?(?:background removal|cut-?out|green[\s-]?screen (?:effect|removal|key(?:ing)?)|chroma[\s-]?key(?:ing)?)\b/
const MEDIA_WORDS =/\b(?:videos?|clips?|footage|webcam|camera|recording|images?|photos?|pictures?|me|my|myself|person|speaker|subject|people|him|her|them)\b/

export function keyingHandler(clause: Clause, state: ParseState): AiPlanStep[] | null {
  const text = clause.text
  const restore = RESTORE.test(text)
  const screen = !restore && SCREEN.test(text)
  const person = !restore && !screen && PERSON.test(text)
  if (!screen && !person && !restore) return null

  const sceneTarget = readScenes(text, state)?.[0]
  const scene = sceneTarget
    ? state.context.scenes.find(sc => sc.id === sceneTarget.sceneId)
    : state.context.scenes.find(sc => sc.index === state.context.currentSceneIndex)
  const media = scene?.elements.filter(el => el.type === 'video' || el.type === 'image') ?? []
  // Restoring only means clips when one has its background removed.
  if (restore && !media.some(el => el.keying)) return null
  if (!media.length) {
    if (screen) {
      warn(state, 'There is no video or image on this scene to key.')
      return []
    }
    return null // "remove the background" of a scene without media: the scene background
  }
  // "remove the background" alone only means the clip when something points at it.
  const selected = media.filter(el => state.context.selectedIds.includes(el.id))
  if (person && !MEDIA_WORDS.test(text) && !selected.length && !/\bportrait mode\b|\bblur\b/.test(text)) return null

  const targets = restore && !selected.length && !/\b(?:videos?|clips?|images?|photos?|it)\b/.test(text)
    ? media.filter(el => el.keying)
    : pickTargets(text, clause, media, selected, state)
  state.lastElements = targets.map(el => ({ ref: { elementId: el.id, targetLabel: el.name }, type: el.type, summary: el, sceneId: scene?.id, label: el.name }))
  // A clip cut into parts (jump cuts, splits) changes in every part, like the Edit BG panel does.
  const withParts = (list: AiElementSummary[]) => list.flatMap(el => el.type !== 'video' || !el.src ? [{ el, sceneId: scene?.id }]
    : state.context.scenes.flatMap(sc => sc.elements.filter(other => other.type === 'video' && other.src === el.src).map(other => ({ el: other, sceneId: sc.id }))))
  const command = (list: AiElementSummary[], patch: Record<string, unknown>) => {
    const seen = new Set<string>()
    return withParts(list)
      .filter(({ el }) => !seen.has(el.id) && Boolean(seen.add(el.id)))
      .map(({ el, sceneId }) => ({ type: 'updateElement' as const, elementId: el.id, sceneId, targetLabel: el.name, patch }))
  }

  if (restore || (OFF.test(text) && !/\bremove\b.*\b(?:green|blue)[\s-]?screen/.test(text))) {
    const keyed = targets.filter(el => el.keying)
    if (!keyed.length) warn(state, 'No clip here has its background removed.')
    return command(keyed, { keying: null })
  }

  let keying: MediaKeying
  if (screen) {
    const named = readColors(text).find(c => !/^(?:green|blue)$/.test(c.name ?? ''))
    const color = named?.hex ?? (/\bblue[\s-]?screen|\bkey\s+(?:the\s+)?blue\b|\bblue\b/.test(text) ? '#0047bb' : KEYING_DEFAULTS.color)
    keying = { mode: 'chroma', color, strength: KEYING_DEFAULTS.strength, softness: KEYING_DEFAULTS.softness, spill: KEYING_DEFAULTS.spill }
  } else {
    const colors = readColors(text)
    const background = /\bblur\w*\b|\bportrait mode\b/.test(text) ? 'blur' : colors.length ? 'color' : 'none'
    keying = {
      mode: 'person',
      feather: KEYING_DEFAULTS.feather,
      background,
      ...(background === 'color' && { backgroundColor: colors[0].hex }),
      ...(background === 'blur' && { backgroundBlur: KEYING_DEFAULTS.backgroundBlur }),
    }
  }
  if (targets.length > 1 && !selected.length) warn(state, `Applied to all ${targets.length} clips on the scene — select one to change only that.`)
  return command(targets, { keying })
}

/** Which clips: named, numbered ("video 2"), "it", the selection, else the videos (or images) on the scene. */
function pickTargets(text: string, clause: Clause, media: AiElementSummary[], selected: AiElementSummary[], state: ParseState) {
  const named = media.filter(el => el.name.length >= 3 && !/^(?:video|clip|image|photo)(?:\s*\d+)?$/i.test(el.name) &&
    (clause.quotes.some(q => q.trim().toLowerCase() === el.name.toLowerCase()) || text.includes(el.name.toLowerCase())))
  if (named.length) return named
  const numbered = text.match(/\b(video|clip|image|photo|picture)[_\-\s]*(?:(?:id|item|number|num)[_\-\s]*)?#?(\d+)\b/)
  if (numbered) {
    const list = media.filter(el => (/^(?:video|clip)$/.test(numbered[1]) ? el.type === 'video' : el.type === 'image'))
    const el = list[Number(numbered[2]) - 1]
    if (el) return [el]
  }
  if (selected.length) return selected
  if (/\b(?:it|this|that)\b/.test(text)) {
    const last = media.filter(el => state.lastElements?.some(t => t.ref.elementId === el.id))
    if (last.length) return last
  }
  const wantsImage = /\b(?:images?|photos?|pictures?)\b/.test(text) && !/\b(?:videos?|clips?|footage)\b/.test(text)
  const videos = media.filter(el => el.type === 'video')
  const images = media.filter(el => el.type === 'image')
  return wantsImage ? (images.length ? images : videos) : videos.length ? videos : images
}
