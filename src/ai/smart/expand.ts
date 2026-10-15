/**
 * Expands smart steps ("remove silences", "cut to the beat", …) into ordinary
 * commands by analysing the project's media. Media access is injected so the
 * logic can be tested with synthetic audio.
 */
import type { AiEditorCommand, AiElementSummary, AiPlanIssue, AiPlanStep, AiProjectContext, AiSceneSummary, AiSmartStep } from '../types'
import { isSmartStep } from '../types'
import { detectBeats, snapDurationsToBeats } from './beats'
import { removeRanges, splitAt, type SceneInfo } from './cuts'
import { findCuts } from './shots'
import { detectSpeech, frameLoudness, silencesBetween, type TimeRange } from './speech'

export interface SmartMedia {
  decodeMono: (path: string) => Promise<{ samples: Float32Array; sampleRate: number } | null>
  detectShotChanges: (path: string, from: number, to: number, find: typeof findCuts) => Promise<number[]>
  /** Word-level transcript of a file, in source seconds. */
  transcribeWords: (path: string) => Promise<Array<{ start: number; end: number; text: string }>>
}

export interface Expanded {
  commands: AiEditorCommand[]
  /** One sentence per smart step, used as the plan summary. */
  notes: string[]
}

const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'erm', 'er', 'err', 'ah', 'ahh', 'hmm', 'hm', 'mm', 'mhm'])

export async function expandSmartSteps(
  steps: AiPlanStep[],
  context: AiProjectContext,
  issues: AiPlanIssue[],
  media: SmartMedia,
  onProgress?: (message: string) => void
): Promise<Expanded> {
  const commands: AiEditorCommand[] = []
  const notes: string[] = []
  let aliasCount = 0
  const nextAlias = () => `cut${++aliasCount}`
  const warn = (message: string) => issues.push({ level: 'warning', message })

  for (const step of steps) {
    if (!isSmartStep(step)) {
      commands.push(step)
      continue
    }
    const result = await expandOne(step, context, media, nextAlias, warn, onProgress)
    commands.push(...result.commands)
    if (result.note) notes.push(result.note)
  }
  return { commands, notes }
}

async function expandOne(
  step: AiSmartStep,
  context: AiProjectContext,
  media: SmartMedia,
  nextAlias: () => string,
  warn: (message: string) => void,
  onProgress?: (message: string) => void
): Promise<{ commands: AiEditorCommand[]; note?: string }> {
  switch (step.type) {
    case 'removeSilences':
    case 'removeFillers': {
      const fillers = step.type === 'removeFillers'
      const commands: AiEditorCommand[] = []
      let removed = 0
      let count = 0
      for (const { scene, video } of scenesWithVideo(context, step.sceneIds, warn)) {
        const clip = clipWindow(video)
        let ranges: TimeRange[]
        if (fillers) {
          onProgress?.(`Transcribing ${video.name}…`)
          const words = await media.transcribeWords(video.src!).catch(error => {
            warn(error instanceof Error ? error.message : String(error))
            return null
          })
          if (!words) continue
          // Whisper's word edges are approximate: move each cut to the quietest
          // moment nearby so it falls between words, not inside one.
          const audio = await media.decodeMono(video.src!)
          const snap = audio ? quietSnapper(audio.samples, audio.sampleRate) : (t: number) => t
          ranges = words
            .filter(w => FILLERS.has(w.text.toLowerCase().replace(/[^a-z]/g, '')))
            .map((w): TimeRange => [snap(w.start), snap(w.end)])
        } else {
          onProgress?.(`Listening to ${video.name}…`)
          const audio = await media.decodeMono(video.src!)
          if (!audio) { warn(`Could not read the audio of ${video.name}.`); continue }
          const minSilence = step.minSilence ?? 0.6
          const padding = step.padding ?? 0.15
          const speech = detectSpeech(audio.samples, audio.sampleRate, { minSilence: Math.min(minSilence, 0.5) })
          if (!speech.length) { warn(`No speech found in ${video.name}, so nothing was cut.`); continue }
          // Keep a little breathing room next to speech; trim silence at the clip edges fully.
          ranges = silencesBetween(speech, clip.from, clip.to, minSilence)
            .map(([a, b]): TimeRange => [a <= clip.from ? a : a + padding, b >= clip.to ? b : b - padding])
        }
        const sceneRanges = ranges
          .map(([a, b]): TimeRange => [clip.toScene(Math.max(a, clip.from)), clip.toScene(Math.min(b, clip.to))])
          .filter(([a, b]) => b > a)
        const result = removeRanges(sceneInfo(scene), sceneRanges, nextAlias, { canRemoveScene: context.scenes.length > 1, minRange: fillers ? 0.1 : 0.2 })
        commands.push(...result.commands)
        removed += result.removed
        count += result.count
      }
      const what = fillers ? `filler word${count === 1 ? '' : 's'}` : `pause${count === 1 ? '' : 's'}`
      // Local Whisper's word timings can be a few tenths of a second off.
      const caveat = fillers && count ? ' Word timings are approximate — play it back before keeping it.' : ''
      return { commands, note: count ? `Remove ${count} ${what} (${removed.toFixed(1)}s).${caveat}` : `No ${fillers ? 'filler words' : 'pauses'} to remove.` }
    }

    case 'splitShots': {
      const commands: AiEditorCommand[] = []
      let shots = 0
      for (const { scene, video } of scenesWithVideo(context, step.sceneIds, warn)) {
        onProgress?.(`Looking for shot changes in ${video.name}…`)
        const clip = clipWindow(video)
        const cuts = await media.detectShotChanges(video.src!, clip.from, clip.to, findCuts).catch(() => null)
        if (!cuts) { warn(`Could not read the frames of ${video.name}.`); continue }
        const split = splitAt(sceneInfo(scene), cuts.map(clip.toScene))
        commands.push(...split)
        shots += split.length
      }
      return { commands, note: shots ? `Split at ${shots} shot change${shots === 1 ? '' : 's'}.` : 'No shot changes found.' }
    }

    case 'cutToBeat': {
      const music = findMusic(context)
      if (!music) { warn('Add music to the timeline first — cutting to the beat follows the background music.'); return { commands: [] } }
      onProgress?.(`Finding the beat in ${music.el.name}…`)
      const audio = await media.decodeMono(music.el.src!)
      if (!audio) { warn(`Could not read ${music.el.name}.`); return { commands: [] } }
      const grid = detectBeats(audio.samples, audio.sampleRate)
      if (!grid) { warn(`Could not find a steady beat in ${music.el.name}.`); return { commands: [] } }

      // Beats in source seconds → project timeline seconds.
      const speed = music.el.playbackRate ?? 1
      const from = music.el.startTime ?? 0
      const to = from + (music.el.duration ?? Infinity) * speed
      const start = sceneStart(context, music.sceneId) + (music.el.timelineX ?? 0)
      const beats = grid.beats.filter(b => b >= from && b <= to).map(b => start + (b - from) / speed)
      const durations = context.scenes.map(s => s.duration)
      const snapped = snapDurationsToBeats(durations, beats, { beatsPerCut: step.beatsPerCut })
      const commands: AiEditorCommand[] = []
      context.scenes.forEach((scene, i) => {
        if (Math.abs(snapped[i] - scene.duration) > 0.01) {
          commands.push({ type: 'setSceneDuration', sceneId: scene.id, sceneIndex: scene.index, duration: snapped[i] })
        }
      })
      return { commands, note: `Cut ${commands.length} scene${commands.length === 1 ? '' : 's'} to the beat (${grid.bpm} BPM).` }
    }
  }
}

/** Returns t moved to the quietest 10 ms frame within ±0.12 s. */
function quietSnapper(samples: Float32Array, sampleRate: number) {
  const loudness = frameLoudness(samples, sampleRate)
  return (t: number) => {
    const center = Math.round(t / 0.01)
    let best = center
    for (let i = Math.max(0, center - 12); i <= Math.min(loudness.length - 1, center + 12); i++) {
      if (loudness[i] < loudness[best] - 0.5) best = i
    }
    return Math.round(best) / 100
  }
}

function scenesWithVideo(context: AiProjectContext, sceneIds: string[] | undefined, warn: (m: string) => void) {
  const scenes = sceneIds ? context.scenes.filter(s => sceneIds.includes(s.id)) : context.scenes
  const out: Array<{ scene: AiSceneSummary; video: AiElementSummary }> = []
  for (const scene of scenes) {
    // The longest clip carries the scene's sound.
    const video = scene.elements
      .filter(el => el.type === 'video' && el.src)
      .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0]
    if (video) out.push({ scene, video })
    else if (sceneIds) warn(`Scene ${scene.index} has no video clip.`)
  }
  if (!out.length && !sceneIds) warn('There is no video clip in the project to analyse.')
  return out
}

/** The part of the source file a clip plays, and source → scene time. */
function clipWindow(video: AiElementSummary) {
  const from = video.startTime ?? 0
  const rate = video.playbackRate || 1
  const length = video.duration ?? Math.max(0, (video.sourceDuration ?? 0) - from) / rate
  const offset = video.timelineX ?? 0
  return { from, to: from + length * rate, toScene: (t: number) => offset + (t - from) / rate }
}

function findMusic(context: AiProjectContext) {
  const clips = context.scenes.flatMap(scene => scene.elements
    .filter(el => el.type === 'audio' && el.src)
    .map(el => ({ el, sceneId: scene.id })))
  const longest = (list: typeof clips) => list.sort((a, b) => (b.el.duration ?? 0) - (a.el.duration ?? 0))[0]
  return longest(clips.filter(c => c.el.track === 'background')) ?? longest(clips) ?? null
}

function sceneStart(context: AiProjectContext, sceneId: string) {
  let t = 0
  for (const scene of context.scenes) {
    if (scene.id === sceneId) return t
    t += scene.duration
  }
  return 0
}

function sceneInfo(scene: AiSceneSummary): SceneInfo {
  return { id: scene.id, index: scene.index, duration: scene.duration }
}
