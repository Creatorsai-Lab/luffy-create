/**
 * Jump cuts for talking clips: which pauses, filler words and abandoned takes
 * ("retakes") to cut out of a clip, and the scene commands that cut them —
 * optionally punching in on every other part so the cuts feel deliberate.
 * Shared by the jump-cut panel, transcript editing and the "jump cut" prompt.
 * Pure: the audio and words are analysed elsewhere.
 */
import type { AiEditorCommand, AiSceneRef } from '../types'
import type { SpeedCurve } from '../../types/editor'
import { clipTimeAtFootage, footageTimeAt } from '../../utils/speedCurve'
import { removeRanges, type SceneInfo } from './cuts'
import { silencesBetween, type TimeRange } from './speech'

/** Why a stretch is cut: a pause, a filler word, an abandoned take, or words deleted in the transcript. */
export type CutKind = 'pause' | 'filler' | 'retake' | 'edit'

/** A stretch to cut, in source seconds. */
export interface CutRange {
  from: number
  to: number
  kind: CutKind
}

/** A transcribed word, in source seconds. */
export interface Word {
  start: number
  end: number
  text: string
}

export interface JumpCutSettings {
  pauses: boolean
  /** Only pauses at least this long are cut (seconds). */
  minPause: number
  /** Silence kept next to speech on each side of a cut (seconds). */
  padding: number
  /** Loudness (dBFS) under which sound counts as silence; worked out from the clip when missing. */
  threshold?: number
  fillers: boolean
  retakes: boolean
  /** Zoom every other part in by `zoom` (1.1 = 10% closer), so cuts read as deliberate. */
  punchIn: boolean
  zoom: number
}

export const DEFAULT_JUMP_CUT: JumpCutSettings = {
  pauses: true,
  minPause: 0.5,
  padding: 0.1,
  fillers: false,
  retakes: false,
  punchIn: false,
  zoom: 1.1,
}

export const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'erm', 'er', 'err', 'ah', 'ahh', 'hmm', 'hm', 'mm', 'mhm'])

export function isFiller(text: string) {
  return FILLERS.has(text.toLowerCase().replace(/[^a-z]/g, ''))
}

/** The part of the source file a clip plays, and source ↔ scene time. */
export interface ClipWindow {
  from: number
  to: number
  toScene: (t: number) => number
  fromScene: (t: number) => number
}

export function clipWindow(video: Pick<ClipVideo, 'startTime' | 'playbackRate' | 'duration' | 'sourceDuration' | 'timelineX' | 'speedCurve' | 'freeze'>): ClipWindow {
  const from = video.startTime ?? 0
  const rate = video.playbackRate || 1
  const length = video.duration ?? Math.max(0, (video.sourceDuration ?? 0) - from) / rate
  const offset = video.timelineX ?? 0
  // A speed ramp or freeze frame: source time follows the curve.
  if (video.speedCurve || video.freeze?.hold) {
    const timed = { ...video, duration: length, playbackRate: rate, startTime: from }
    return {
      from, to: from + footageTimeAt(timed, length),
      toScene: (t: number) => offset + clipTimeAtFootage(timed, t - from),
      fromScene: (t: number) => from + footageTimeAt(timed, t - offset),
    }
  }
  return { from, to: from + length * rate, toScene: (t: number) => offset + (t - from) / rate, fromScene: (t: number) => from + (t - offset) * rate }
}

/** The fields of a video clip the cut engine reads (an AiElementSummary or the editor's VideoElement). */
export interface ClipVideo {
  type: string
  id: string
  name: string
  src?: string
  startTime?: number
  duration?: number
  playbackRate?: number
  sourceDuration?: number
  timelineX?: number
  speedCurve?: SpeedCurve
  freeze?: { at: number; hold: number }
}

/** One scene's piece of a source file: the clip that plays it there and the window it plays. */
export interface ClipPart extends ClipWindow {
  scene: SceneInfo
  video: ClipVideo
}

/**
 * Every scene that plays `src` (the longest such clip in each), in timeline
 * order — a clip and the parts it was cut into. Takes the AI context or the
 * project itself.
 */
export function partsOfSource(project: { scenes: ReadonlyArray<{ id: string; duration: number; index?: number; elements: ReadonlyArray<object> }> }, src: string): ClipPart[] {
  const parts: ClipPart[] = []
  project.scenes.forEach((scene, i) => {
    const video = (scene.elements as ClipVideo[])
      .filter(el => el.type === 'video' && el.src === src)
      .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0]
    if (video) parts.push({ ...clipWindow(video), scene: { id: scene.id, index: scene.index ?? i + 1, duration: scene.duration }, video })
  })
  return parts
}

/** Words that play inside a window (by their middle). */
export function wordsIn(words: Word[], window: { from: number; to: number }) {
  return words.filter(w => {
    const mid = (w.start + w.end) / 2
    return mid >= window.from && mid <= window.to
  })
}

/** Pauses inside the window, keeping `padding` of silence next to speech. */
export function pauseRanges(speech: TimeRange[], window: { from: number; to: number }, s: Pick<JumpCutSettings, 'minPause' | 'padding'>): CutRange[] {
  const out: CutRange[] = []
  for (const [a, b] of silencesBetween(speech, window.from, window.to, s.minPause)) {
    // Silence at the clip's edges goes completely; inside, keep a breath either side.
    const from = a <= window.from ? a : a + s.padding
    const to = b >= window.to ? b : b - s.padding
    if (to - from >= 0.1) out.push({ from, to, kind: 'pause' })
  }
  return out
}

export function fillerRanges(words: Word[], snap: (t: number) => number = t => t): CutRange[] {
  return words
    .filter(w => isFiller(w.text))
    .map((w): CutRange => ({ from: snap(w.start), to: snap(w.end), kind: 'filler' }))
    .filter(r => r.to - r.from >= 0.05)
}

const normalWord = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const endsPhrase = (text: string) => /[.!?…,;:—-]["')\]]*$/.test(text.trim())

/**
 * Abandoned takes: a phrase started again ("So today we're— so today we're
 * going to…"). Each result is [from, to) word indices of the take to drop; the
 * last take is kept. Both takes must start a phrase (start of the clip, after
 * punctuation, a pause or a filler), and agree on at least three words — or two
 * when the whole abandoned take is repeated.
 */
export function findRetakes(words: Word[], opts: { maxWords?: number; maxSeconds?: number } = {}): Array<[number, number]> {
  const maxWords = opts.maxWords ?? 30
  const maxSeconds = opts.maxSeconds ?? 15
  const startsPhrase = (i: number) => {
    if (i === 0) return true
    const prev = words[i - 1]
    return endsPhrase(prev.text) || isFiller(prev.text) || words[i].start - prev.end >= 0.2
  }
  // Fillers don't count when comparing takes.
  const index: number[] = []
  const token: string[] = []
  words.forEach((w, i) => {
    const t = normalWord(w.text)
    if (t && !FILLERS.has(t)) { index.push(i); token.push(t) }
  })

  const out: Array<[number, number]> = []
  let p = 0
  while (p < token.length) {
    let restart = -1
    if (startsPhrase(index[p])) {
      for (let q = p + 1; q < token.length && q - p <= maxWords; q++) {
        if (words[index[q]].start - words[index[p]].start > maxSeconds) break
        if (token[q] !== token[p] || !startsPhrase(index[q])) continue
        let same = 0
        while (q + same < token.length && p + same < q && token[p + same] === token[q + same]) same++
        if (same >= 3 || (same === q - p && same >= 2)) { restart = q; break }
      }
    }
    if (restart >= 0) {
      out.push([index[p], index[restart]])
      p = restart
    } else {
      p++
    }
  }
  return out
}

export function retakeRanges(words: Word[], snap: (t: number) => number = t => t): CutRange[] {
  return findRetakes(words).map(([i, j]): CutRange => ({ from: snap(words[i].start), to: snap(words[j].start), kind: 'retake' }))
}

/** What jump cut would remove from one window of a source, with each cut's reason. */
export function jumpCutRanges(
  input: { speech?: TimeRange[]; words?: Word[]; snap?: (t: number) => number },
  window: { from: number; to: number },
  s: JumpCutSettings
): CutRange[] {
  const ranges: CutRange[] = []
  if (s.pauses && input.speech) ranges.push(...pauseRanges(input.speech, window, s))
  const words = input.words ? wordsIn(input.words, window) : []
  if (s.fillers) ranges.push(...fillerRanges(words, input.snap))
  if (s.retakes) ranges.push(...retakeRanges(words, input.snap))
  return clampRanges(ranges, window)
}

/**
 * Cuts for words deleted in a transcript (indices into `words`) and pauses
 * deleted there. A deleted run also takes half of the gap on either side, so
 * what's left joins with a natural pause; edges are moved to quiet moments.
 */
export function transcriptCuts(
  words: Word[],
  deletedWords: ReadonlySet<number>,
  deletedPauses: ReadonlyArray<{ from: number; to: number }>,
  snap: (t: number) => number = t => t,
  padding = 0.1
): CutRange[] {
  const out: CutRange[] = []
  let i = 0
  while (i < words.length) {
    if (!deletedWords.has(i)) { i++; continue }
    let j = i
    while (j + 1 < words.length && deletedWords.has(j + 1)) j++
    const before = i > 0 ? words[i - 1].end : undefined
    const after = j + 1 < words.length ? words[j + 1].start : undefined
    const from = before == null ? words[i].start : Math.max(before, (before + words[i].start) / 2)
    const to = after == null ? words[j].end : Math.min(after, (words[j].end + after) / 2)
    out.push({ from: snap(from), to: snap(to), kind: 'edit' })
    i = j + 1
  }
  for (const pause of deletedPauses) {
    const from = pause.from + padding
    const to = pause.to - padding
    if (to - from >= 0.05) out.push({ from, to, kind: 'pause' })
  }
  return out.sort((a, b) => a.from - b.from)
}

function clampRanges(ranges: CutRange[], window: { from: number; to: number }) {
  return ranges
    .map(r => ({ ...r, from: Math.max(window.from, r.from), to: Math.min(window.to, r.to) }))
    .filter(r => r.to > r.from)
    .sort((a, b) => a.from - b.from)
}

/** Seconds actually removed: overlapping cuts only count once. */
export function cutLength(ranges: Array<{ from: number; to: number }>) {
  let total = 0
  let end = -Infinity
  for (const r of [...ranges].sort((a, b) => a.from - b.from)) {
    const from = Math.max(r.from, end)
    if (r.to > from) total += r.to - from
    end = Math.max(end, r.to)
  }
  return total
}

export interface CutResult {
  commands: AiEditorCommand[]
  /** Seconds removed from the timeline. */
  removed: number
  counts: Record<CutKind, number>
  /** Parts given a punch-in zoom. */
  punched: number
}

/**
 * The commands that cut `ranges` (source seconds) out of each part, from the
 * end of each scene backwards. With `punchIn`, the parts left are zoomed in
 * on every other one, across all parts in timeline order.
 */
export function cutCommands(
  entries: Array<{ part: ClipPart; ranges: CutRange[] }>,
  settings: { punchIn?: boolean; zoom?: number },
  opts: { canRemoveScene: boolean; nextAlias: () => string }
): CutResult {
  const counts: Record<CutKind, number> = { pause: 0, filler: 0, retake: 0, edit: 0 }
  const commands: AiEditorCommand[] = []
  const punchTargets: Array<{ ref: AiSceneRef; part: ClipPart }> = []
  let removed = 0

  for (const { part, ranges } of entries) {
    const inWindow = clampRanges(ranges, part)
    for (const r of inWindow) counts[r.kind]++
    const sceneRanges = inWindow.map((r): TimeRange => [part.toScene(r.from), part.toScene(r.to)])
    const result = removeRanges(part.scene, sceneRanges, opts.nextAlias, {
      canRemoveScene: opts.canRemoveScene,
      minRange: 0.05,
      minKeep: 0.3,
      nameParts: settings.punchIn,
    })
    commands.push(...result.commands)
    removed += result.removed
    if (settings.punchIn) {
      const clipFrom = part.toScene(part.from)
      const clipTo = part.toScene(part.to)
      // Only parts that still show the clip can be zoomed.
      for (const kept of result.kept) {
        if (Math.min(kept.to, clipTo) - Math.max(kept.from, clipFrom) > 0.05) punchTargets.push({ ref: kept.ref, part })
      }
    }
  }

  let punched = 0
  const zoom = Math.min(1.5, Math.max(1, settings.zoom ?? DEFAULT_JUMP_CUT.zoom))
  punchTargets.forEach(({ ref, part }, i) => {
    const punchIn = i % 2 === 1 ? zoom : 1
    if (punchIn > 1) punched++
    // The first part keeps the clip's own id; later parts hold copies found by name.
    const target = ref.sceneId
      ? { sceneId: ref.sceneId, sceneIndex: ref.sceneIndex, elementId: part.video.id }
      : { sceneAlias: ref.sceneAlias, elementName: part.video.name }
    commands.push({ type: 'updateElement', ...target, targetLabel: part.video.name, patch: { punchIn } })
  })

  return { commands, removed: Math.round(removed * 100) / 100, counts, punched }
}

/** "Cut 12 pauses, 3 filler words and 1 retake (14.2s), punching in on every other part." */
export function describeCuts(result: Pick<CutResult, 'counts' | 'removed' | 'punched'>) {
  const parts = [
    plural(result.counts.pause, 'pause'),
    plural(result.counts.filler, 'filler word'),
    plural(result.counts.retake, 'retake'),
    result.counts.edit ? `${result.counts.edit} deleted passage${result.counts.edit === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  const punch = result.punched ? `, punching in on ${result.punched} part${result.punched === 1 ? '' : 's'}` : ''
  if (!parts.length) return result.punched ? `Punch in on ${result.punched} part${result.punched === 1 ? '' : 's'}.` : 'Nothing to cut.'
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return `Cut ${list} (${result.removed.toFixed(1)}s)${punch}.`
}

function plural(n: number, word: string) {
  return n ? `${n} ${word}${n === 1 ? '' : 's'}` : ''
}
