/**
 * Putting videos and images in an area of the frame, worked out from the
 * scene size:
 *   "make video 1 full screen and video 2 bottom right at 400x300"
 *   "put this video in the upper half and this one in the lower half"
 *   (1080×1920 → each box is 1080×960; the clips are cropped to fill it)
 *   "one in the left half and the other in the right half", "the top third",
 *   "the top left quarter", "top 60%", "at x 100 y 200, 500px wide",
 *   "fit the whole video in the upper half" (no crop), "stretch it to fill the screen".
 * Each placement becomes a `placeMedia` command with the exact region in pixels.
 */
import type { AiElementSummary, AiPlanStep } from '../types'
import { escapeRe, readScenes, type ParseState } from './refs'
import { readSize, type Clause } from './text'

type Frame = { width: number; height: number }
type Box = { x: number; y: number; width: number; height: number }
type HAlign = 'left' | 'center' | 'right'
type VAlign = 'top' | 'middle' | 'bottom'

interface Spot {
  region: Box
  label: string
  horizontal?: HAlign
  vertical?: VAlign
  /** A corner, an edge or the centre: the clip keeps a size of its own there (with a margin). */
  anchored?: boolean
  index: number
  end: number
}

export interface MediaPlacement {
  region: Box
  regionLabel: string
  width?: number
  height?: number
  horizontal?: HAlign
  vertical?: VAlign
  fit: 'cover' | 'contain' | 'stretch'
}

const VIDEO_WORD = '(?:videos?|clips?|footage|webcams?|cameras?|recordings?)'
const IMAGE_WORD = '(?:images?|photos?|pictures?|pics?|screenshots?)'
const MEDIA_WORD = `(?:${VIDEO_WORD}|${IMAGE_WORD})`
const PIP = /\bpicture[\s-]in[\s-]picture\b|\bpip\b/
const vert = (w: string): VAlign => (w === 'top' || w === 'upper' ? 'top' : 'bottom')

/** Every area of the frame the text names, in order. */
export function readSpots(text: string, frame: Frame): Spot[] {
  const W = frame.width
  const H = frame.height
  const portrait = H > W
  const spots: Spot[] = []
  const taken: Array<[number, number]> = []
  const add = (re: RegExp, make: (m: RegExpExecArray) => Omit<Spot, 'index' | 'end'> | null) => {
    const global = new RegExp(re.source, 'g')
    for (let m = global.exec(text); m; m = global.exec(text)) {
      const start = m.index
      const end = start + m[0].length
      if (taken.some(([a, b]) => start < b && end > a)) continue
      const spot = make(m)
      if (!spot) continue
      taken.push([start, end])
      spots.push({ ...spot, index: start, end })
    }
  }

  // "top and bottom halves" / "left and right halves": two areas at once.
  const halves = /\b(?:(top|upper)\s+and\s+(?:bottom|lower)|(left)\s+and\s+right)\s+halves\b/g
  for (let m = halves.exec(text); m; m = halves.exec(text)) {
    const end = m.index + m[0].length
    taken.push([m.index, end])
    const pair: Array<Omit<Spot, 'index' | 'end'>> = m[1]
      ? [{ region: { x: 0, y: 0, width: W, height: H / 2 }, label: 'upper half' }, { region: { x: 0, y: H / 2, width: W, height: H / 2 }, label: 'lower half' }]
      : [{ region: { x: 0, y: 0, width: W / 2, height: H }, label: 'left half' }, { region: { x: W / 2, y: 0, width: W / 2, height: H }, label: 'right half' }]
    spots.push({ ...pair[0], index: m.index, end: m.index + 1 }, { ...pair[1], index: m.index + 1, end })
  }
  add(/\b(?:full[\s-]?screen|(?:the\s+)?(?:whole|entire|full)\s+(?:screen|frame|scene|canvas)|(?:fill|cover)(?:s|ing)?\s+(?:up\s+)?(?:the\s+)?(?:whole\s+|entire\s+|full\s+)?(?:screen|frame|scene|canvas)|as\s+(?:the\s+)?background)\b/,
    () => ({ region: { x: 0, y: 0, width: W, height: H }, label: 'full screen' }))
  add(/\b(top|upper|bottom|lower|left|right)\s+(\d+(?:\.\d+)?)\s*%/, m => {
    const p = Math.min(100, Number(m[2])) / 100
    const side = m[1]
    if (side === 'left') return { region: { x: 0, y: 0, width: W * p, height: H }, label: `left ${m[2]}%` }
    if (side === 'right') return { region: { x: W * (1 - p), y: 0, width: W * p, height: H }, label: `right ${m[2]}%` }
    return vert(side) === 'top'
      ? { region: { x: 0, y: 0, width: W, height: H * p }, label: `top ${m[2]}%` }
      : { region: { x: 0, y: H * (1 - p), width: W, height: H * p }, label: `bottom ${m[2]}%` }
  })
  add(/\b(top|upper|bottom|lower)[\s-]+(left|right)\s+quarter\b/, m => ({
    region: { x: m[2] === 'left' ? 0 : W / 2, y: vert(m[1]) === 'top' ? 0 : H / 2, width: W / 2, height: H / 2 },
    label: `${vert(m[1])} ${m[2]} quarter`,
  }))
  add(/\b(top|upper|bottom|lower|left|right)\s+half\b/, m => {
    const side = m[1]
    if (side === 'left') return { region: { x: 0, y: 0, width: W / 2, height: H }, label: 'left half' }
    if (side === 'right') return { region: { x: W / 2, y: 0, width: W / 2, height: H }, label: 'right half' }
    return vert(side) === 'top'
      ? { region: { x: 0, y: 0, width: W, height: H / 2 }, label: 'upper half' }
      : { region: { x: 0, y: H / 2, width: W, height: H / 2 }, label: 'lower half' }
  })
  add(/\b(top|upper|bottom|lower|left|right|middle|center|centre)\s+third\b/, m => {
    const side = m[1]
    const across = side === 'left' || side === 'right' || ((side === 'middle' || side === 'center' || side === 'centre') && !portrait)
    const slot = side === 'left' || side === 'top' || side === 'upper' ? 0 : side === 'right' || side === 'bottom' || side === 'lower' ? 2 : 1
    return across
      ? { region: { x: (W / 3) * slot, y: 0, width: W / 3, height: H }, label: `${['left', 'middle', 'right'][slot]} third` }
      : { region: { x: 0, y: (H / 3) * slot, width: W, height: H / 3 }, label: `${['top', 'middle', 'bottom'][slot]} third` }
  })
  add(/\bat\s+x\s*[=:]?\s*(-?\d+)\s*(?:px)?\s*,?\s*(?:and\s+)?y\s*[=:]?\s*(-?\d+)|\bat\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)|\bat\s+(-?\d+)\s*,\s*(-?\d+)\b/, m => {
    const x = Number(m[1] ?? m[3] ?? m[5])
    const y = Number(m[2] ?? m[4] ?? m[6])
    return { region: { x, y, width: Math.max(1, W - x), height: Math.max(1, H - y) }, label: `x ${x}, y ${y}`, horizontal: 'left', vertical: 'top', anchored: true }
  })
  add(/\b(top|upper|bottom|lower)[\s-]+(left|right)(?:\s+corner)?\b/, m => ({
    region: { x: 0, y: 0, width: W, height: H }, label: `${vert(m[1])} ${m[2]} corner`,
    horizontal: m[2] as HAlign, vertical: vert(m[1]), anchored: true,
  }))
  add(/\b(?:in\s+the\s+)?(?:center|centre|middle)\b/, () => ({
    region: { x: 0, y: 0, width: W, height: H }, label: 'centre', horizontal: 'center', vertical: 'middle', anchored: true,
  }))
  add(/\b(?:at|to|along|on)\s+the\s+(top|bottom)(?!\s+(?:half|third|quarter|left|right|\d))\b/, m => ({
    region: { x: 0, y: 0, width: W, height: H }, label: `${m[1]} edge`, horizontal: 'center', vertical: vert(m[1]), anchored: true,
  }))
  return spots.sort((a, b) => a.index - b.index)
}

interface SizeRead { width?: number; height?: number; fit: MediaPlacement['fit']; margin?: number }

/** Size, fit and margin words in one part of the text. */
function readSizing(text: string, frame: Frame): SizeRead {
  const W = frame.width
  const H = frame.height
  const out: SizeRead = { fit: /\bstretch\w*\b/.test(text) ? 'stretch'
    : /\b(?:fit|contain|letterbox\w*|without crop\w*|no crop\w*|uncropped|whole (?:video|clip|image|picture) visible)\b/.test(text) ? 'contain'
    : 'cover' }
  const pair = readSize(text)
  if (pair) Object.assign(out, pair)
  const widthPx = text.match(/\b(\d+(?:\.\d+)?)\s*(?:px\s*)?(?:wide|width)\b|\bwidth\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)\s*(?:px)?\b/)
  const heightPx = text.match(/\b(\d+(?:\.\d+)?)\s*(?:px\s*)?(?:tall|high|height)\b|\bheight\s*(?:of|=|:|to)?\s*(\d+(?:\.\d+)?)\s*(?:px)?\b/)
  if (!pair && widthPx) out.width = Number(widthPx[1] ?? widthPx[2])
  if (!pair && heightPx) out.height = Number(heightPx[1] ?? heightPx[2])
  if (/\bfull[\s-]width\b/.test(text)) out.width = W
  if (/\bfull[\s-]height\b/.test(text)) out.height = H
  if (/\bhalf (?:the )?(?:screen |frame )?width\b/.test(text)) out.width = W / 2
  if (out.width == null && out.height == null) {
    const percent = text.match(/\b(\d+(?:\.\d+)?)\s*%(?:\s+(?:of\s+the\s+)?(?:width|wide|size|screen|frame))?/)
    if (percent) out.width = W * Math.min(100, Number(percent[1])) / 100
  }
  const margin = text.match(/\b(\d+)\s*(?:px)?\s*(?:margin|padding|inset|from the edges?|away from the edges?|gap)\b|\b(?:margin|padding)\s*(?:of\s*)?(\d+)/)
  if (margin) out.margin = Number(margin[1] ?? margin[2])
  else if (/\b(?:no margin|flush|edge to edge|touching the edges?|at the very edge)\b/.test(text)) out.margin = 0
  // "a quarter of the screen" as a size
  if (out.width == null && /\ba quarter of the (?:screen|frame)\b/.test(text)) { out.width = W / 2; out.height = H / 2 }
  return out
}

/** Builds the placement for one clip from an area and the words around it. */
export function placementFor(spot: Spot, sizing: SizeRead, clip: AiElementSummary | null, frame: Frame): MediaPlacement | null {
  const W = frame.width
  const H = frame.height
  const margin = sizing.margin ?? (spot.anchored ? Math.round(Math.min(W, H) * 0.03) : 0)
  const r = spot.region
  // Explicit coordinates are exact; corners/edges/bands get the margin inside the area.
  const region = spot.label.startsWith('x ') ? r
    : { x: r.x + margin, y: r.y + margin, width: Math.max(1, r.width - margin * 2), height: Math.max(1, r.height - margin * 2) }
  let { width, height } = sizing
  let fit = sizing.fit
  if (spot.anchored && width == null && height == null) {
    const big = clip && ((clip.width ?? 0) > W * 0.6 || (clip.height ?? 0) > H * 0.6)
    if (!clip || big) width = Math.round(W * (H > W ? 0.42 : 0.3)) // a big clip shrinks to a picture-in-picture size
    else if (spot.label.startsWith('x ')) { width = clip.width; height = clip.height; fit = 'stretch' } // keep its size as it is
    else return null // a small clip just moves there: plain alignment does that
  }
  return {
    region: roundBox(region),
    regionLabel: spot.label,
    width: width != null ? Math.round(width) : undefined,
    height: height != null ? Math.round(height) : undefined,
    horizontal: spot.horizontal,
    vertical: spot.vertical,
    fit,
  }
}

type Mention = { index: number; end: number; ids: string[] } | { index: number; end: number; slot: 'other' | 'next' }

export function placeHandler(clause: Clause, state: ParseState): AiPlanStep[] | null {
  const text = clause.text
  // Adding a new clip is the add handler's job (it places the new clip with the same rules);
  // moving animations ("slide in from the top left") are not placements.
  // ("add video 2 to the lower half" with video 2 already on the scene is a placement.)
  const newClip = /@|\b(?:new|another)\b/.test(text) ||
    state.context.assets.some(a => text.includes(a.filename.toLowerCase()) || text.includes(a.name.toLowerCase()))
  if (/^(?:add|insert|import|bring in)\b/.test(text) && newClip) return null
  if (/\b(?:slides?|sliding|fly|flies|wipe|animat\w*|toward|towards|zoom\w*|from the)\b/.test(text)) return null

  const frame = state.context.project
  const sceneTarget = readScenes(text, state)?.[0]
  const scene = sceneTarget
    ? state.context.scenes.find(sc => sc.id === sceneTarget.sceneId)
    : state.context.scenes.find(sc => sc.index === state.context.currentSceneIndex)
  if (!scene) return null
  const media = scene.elements.filter(el => el.type === 'video' || el.type === 'image')
  const pip = PIP.test(text)
  let spots = readSpots(text, frame)
  if (!spots.length && !pip) return null
  if (!media.length) return null

  // ── Which clips the text names, where ──────────────────────────────────────
  const mentions: Mention[] = []
  const taken: Array<[number, number]> = []
  const claim = (index: number, end: number) => {
    if (taken.some(([a, b]) => index < b && end > a)) return false
    taken.push([index, end])
    return true
  }
  const each = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const g = new RegExp(re.source, 'g')
    for (let m = g.exec(text); m; m = g.exec(text)) fn(m)
  }
  const ofType = (word: string) => /^(?:video|clip|footage|webcam|camera|recording)/.test(word) ? media.filter(el => el.type === 'video')
    : /^(?:image|photo|picture|pic|screenshot)/.test(word) ? media.filter(el => el.type === 'image') : media

  // 1. Quoted or written names ("'intro.mp4'", "webcam.mov").
  each(/⟦(\d+)⟧/, m => {
    const quote = clause.quotes[Number(m[1])]?.trim().toLowerCase()
    const el = media.find(e => e.name.toLowerCase() === quote)
    if (el && claim(m.index, m.index + m[0].length)) mentions.push({ index: m.index, end: m.index + m[0].length, ids: [el.id] })
  })
  for (const el of media) {
    const name = el.name.toLowerCase()
    if (name.length < 3 || new RegExp(`^${MEDIA_WORD}(?:\\s*\\d+)?$`).test(name)) continue
    each(new RegExp(`(?<![\\w])${escapeRe(name)}(?![\\w])`), m => {
      if (claim(m.index, m.index + m[0].length)) mentions.push({ index: m.index, end: m.index + m[0].length, ids: [el.id] })
    })
  }
  // 2. Numbered: "video 1", "video_id_2", "clip #2", "the second video", "the last image".
  each(new RegExp(`\\b(${MEDIA_WORD})[_\\-\\s]*(?:(?:id|item|number|num)[_\\-\\s]*)?(?:#|no\\.?\\s*)?(\\d+)\\b(?!\\s*(?:px|x|×|%|by|wide|tall|high))`), m => {
    const el = ofType(m[1])[Number(m[2]) - 1]
    if (el && claim(m.index, m.index + m[0].length)) mentions.push({ index: m.index, end: m.index + m[0].length, ids: [el.id] })
  })
  each(new RegExp(`\\b(first|second|third|fourth|1st|2nd|3rd|4th|last)\\s+(${MEDIA_WORD}|one)\\b`), m => {
    const list = ofType(m[2])
    const n = m[1] === 'last' ? list.length : ({ first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4 } as Record<string, number>)[m[1]]
    const el = list[n - 1]
    if (el && claim(m.index, m.index + m[0].length)) mentions.push({ index: m.index, end: m.index + m[0].length, ids: [el.id] })
  })
  // 3. "this video" / "this one" / "this": the selected clips, one after another (across clauses too).
  const selected = state.context.selectedIds.map(id => media.find(el => el.id === id)).filter((el): el is AiElementSummary => Boolean(el))
  each(new RegExp(`\\b(?:this|that)(?:\\s+(?:${MEDIA_WORD}|one))?\\b`), m => {
    // "this video_id_1" / "this video clip2.mp4": the name right after wins.
    const end = m.index + m[0].length
    if (taken.some(([a]) => a >= end && /^[\s_-]*$/.test(text.slice(end, a)))) return
    const el = selected[state.mediaThisUsed ?? 0] ?? selected[selected.length - 1]
    if (!el || !claim(m.index, end)) return
    state.mediaThisUsed = (state.mediaThisUsed ?? 0) + 1
    mentions.push({ index: m.index, end: m.index + m[0].length, ids: [el.id] })
  })
  // 4. "it", "the other (one)", "one".
  each(/\b(?:it|its)\b/, m => {
    const el = state.lastElements?.map(t => media.find(e => e.id === t.ref.elementId)).find(Boolean)
    if (el && claim(m.index, m.index + m[0].length)) mentions.push({ index: m.index, end: m.index + m[0].length, ids: [el.id] })
  })
  each(new RegExp(`\\bthe other(?:\\s+(?:${MEDIA_WORD}|one))?\\b`), m => {
    if (claim(m.index, m.index + m[0].length)) mentions.push({ index: m.index, end: m.index + m[0].length, slot: 'other' })
  })
  each(/\bone\b/, m => {
    if (claim(m.index, m.index + m[0].length)) mentions.push({ index: m.index, end: m.index + m[0].length, slot: 'next' })
  })
  // 5. "the video" (when there is one), "the videos" / "both videos" (all of them, in order).
  each(new RegExp(`\\b(?:the|both|all|two|three)?\\s*(?:the\\s+)?(${MEDIA_WORD})\\b`), m => {
    const word = m[1]
    const list = ofType(word)
    const plural = /s$/.test(word) || /^(?:both|all|two|three)/.test(m[0].trim())
    const start = m.index + (m[0].length - m[0].trimStart().length)
    if (!list.length || (!plural && list.length !== 1) || !claim(start, m.index + m[0].length)) return
    mentions.push({ index: start, end: m.index + m[0].length, ids: list.map(el => el.id) })
  })
  mentions.sort((a, b) => a.index - b.index)
  if (!mentions.length && !selected.length && !new RegExp(`\\b${MEDIA_WORD}\\b`).test(text) && !pip) return null

  // Clips nobody named, in order: the selection, else the clips of the kind the text talks about.
  const saysVideo = new RegExp(`\\b${VIDEO_WORD}\\b`).test(text)
  const saysImage = new RegExp(`\\b${IMAGE_WORD}\\b`).test(text)
  const kind = media.filter(el => saysVideo === saysImage || (saysVideo ? el.type === 'video' : el.type === 'image'))
  const defaults = (selected.length ? selected : kind.length ? kind : media).map(el => el.id)
  const assigned = new Set<string>()
  const nextFree = () => defaults.find(id => !assigned.has(id)) ?? media.find(el => !assigned.has(el.id))?.id

  // ── Picture in picture: the big clip fills the frame, the named/smaller one goes in a corner ─
  if (pip) {
    const named = mentions.flatMap(m => ('ids' in m ? m.ids : []))
    const pool = selected.length >= 2 ? selected : media
    const byArea = pool.slice().sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0) || Number(b.type === 'video') - Number(a.type === 'video'))
    const small = named.length === 1 ? named[0] : byArea[1]?.id ?? byArea[0]?.id
    const main = byArea.find(el => el.id !== small)?.id
    const corner = spots.find(s => s.anchored && s.horizontal !== 'center') ??
      readSpots('bottom right', frame)[0]
    spots = main ? [{ ...readSpots('full screen', frame)[0], index: -1, end: -1 }, corner] : [corner]
    const order = main ? [main, small] : [small]
    return emit(order.map((id, i) => ({ id, spot: spots[i], part: text })), true)
  }

  // ── Pair every area with a clip ────────────────────────────────────────────
  const pending: string[] = []
  const jobs: Array<{ id: string; spot: Spot; part: string }> = []
  const boundaries = spots.map((spot, i) => {
    const next = spots[i + 1]
    if (!next) return text.length
    const between = text.slice(spot.end, next.index)
    const sep = [...between.matchAll(/,|;|\band\b|\bthen\b|\bwhile\b/g)].pop()
    return sep?.index != null ? spot.end + sep.index : next.index
  })
  let mentionCursor = 0
  for (let i = 0; i < spots.length; i++) {
    const from = i === 0 ? 0 : boundaries[i - 1]
    const to = boundaries[i]
    // Clips named in this part of the sentence.
    while (mentionCursor < mentions.length && mentions[mentionCursor].index < to) {
      const m = mentions[mentionCursor++]
      if ('ids' in m) pending.push(...m.ids.filter(id => !pending.includes(id)))
      else { const id = nextFree(); if (id) pending.push(id) }
    }
    const id = pending.shift() ?? nextFree()
    if (!id) break
    assigned.add(id)
    // Hide the clip words so "video 2" is not read as a size.
    let part = text.slice(from, to)
    for (const m of mentions) {
      if (m.index >= from && m.end <= to) part = part.slice(0, m.index - from) + ' '.repeat(m.end - m.index) + part.slice(m.end - from)
    }
    jobs.push({ id, spot: spots[i], part })
  }
  return emit(jobs)

  function emit(list: Array<{ id: string; spot: Spot; part: string }>, pipSize = false): AiPlanStep[] | null {
    const steps: AiPlanStep[] = []
    for (const { id, spot, part } of list) {
      const clip = media.find(el => el.id === id) ?? null
      if (!clip) continue
      const sizing = readSizing(part.replace(text.slice(spot.index, spot.end), ' '), frame)
      // In picture in picture the small clip always gets a picture-in-picture size (unless one is given).
      const placement = placementFor(spot, sizing, pipSize ? null : clip, frame)
      if (!placement) {
        // A small clip just moves to the corner/edge, keeping its size.
        steps.push({ type: 'alignElement', elementId: clip.id, sceneId: scene!.id, targetLabel: clip.name,
          horizontal: spot.horizontal, vertical: spot.vertical, margin: sizing.margin ?? Math.round(Math.min(frame.width, frame.height) * 0.03) })
        continue
      }
      steps.push({ type: 'placeMedia', elementId: clip.id, sceneId: scene!.id, targetLabel: clip.name, ...placement })
    }
    if (!steps.length) return null
    state.lastElements = list.map(({ id }) => media.find(el => el.id === id)).filter((el): el is AiElementSummary => Boolean(el))
      .map(el => ({ ref: { elementId: el.id, targetLabel: el.name }, type: el.type, summary: el, sceneId: scene!.id, label: el.name }))
    return steps
  }
}

/** For a newly added clip: where the add sentence puts it, if it names an area. */
export function placementForNewClip(text: string, frame: Frame): MediaPlacement | null {
  const spot = readSpots(text, frame)[0]
  if (!spot) return null
  return placementFor(spot, readSizing(text.replace(text.slice(spot.index, spot.end), ' '), frame), null, frame)
}

function roundBox(box: Box): Box {
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
}
