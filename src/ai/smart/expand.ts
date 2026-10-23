/**
 * Expands smart steps ("remove silences", "cut to the beat", …) into ordinary
 * commands by analysing the project's media. Media access is injected so the
 * logic can be tested with synthetic audio.
 */
import type { AiEditorCommand, AiElementSummary, AiPlanIssue, AiPlanStep, AiProjectContext, AiSceneSummary, AiSmartStep } from '../types'
import { isSmartStep } from '../types'
import { detectBeats, snapDurationsToBeats } from './beats'
import { mergeRanges, removeRanges, splitAt, type SceneInfo } from './cuts'
import { findCuts } from './shots'
import { detectSpeech, frameLoudness, quietSnapper, silencesBetween, speechFromLoudness, type TimeRange } from './speech'
import { clipWindow, cutCommands, DEFAULT_JUMP_CUT, describeCuts, FILLERS, jumpCutRanges, partsOfSource, type ClipPart, type CutRange, type Word } from './jumpcut'
import { DEFAULT_DUCK_LEVEL, duckingKeys } from './duck'
import { reframePath, type FaceSample } from './reframe'

export interface SmartMedia {
  decodeMono: (path: string) => Promise<{ samples: Float32Array; sampleRate: number } | null>
  detectShotChanges: (path: string, from: number, to: number, find: typeof findCuts) => Promise<number[]>
  /** Word-level transcript of a file, in source seconds. */
  transcribeWords: (path: string) => Promise<Array<{ start: number; end: number; text: string }>>
  /** Faces in [from, to] of a video (source seconds), and the file's width / height. */
  detectFaces: (path: string, from: number, to: number, onProgress?: (share: number) => void) => Promise<{ aspect: number; samples: FaceSample[] }>
}

export interface Expanded {
  commands: AiEditorCommand[]
  /** One sentence per smart step, used as the plan summary. */
  notes: string[]
}

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
          const snap = audio ? quietSnapper(frameLoudness(audio.samples, audio.sampleRate)) : (t: number) => t
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

    case 'jumpCut': {
      const settings = { ...DEFAULT_JUMP_CUT, ...step.settings }
      const parts: ClipPart[] = step.src
        ? partsOfSource(context, step.src)
        : scenesWithVideo(context, step.sceneIds, warn).map(({ scene, video }) => ({ ...clipWindow(video), scene: sceneInfo(scene), video }))
      if (step.src && !parts.length) warn('That clip is no longer in the project.')
      const sources = new Map<string, ClipPart[]>()
      for (const part of parts) sources.set(part.video.src!, [...(sources.get(part.video.src!) ?? []), part])

      const entries: Array<{ part: ClipPart; ranges: CutRange[] }> = []
      const cutting = settings.pauses || settings.fillers || settings.retakes
      for (const [src, list] of sources) {
        const name = list[0].video.name
        if (!cutting) { entries.push(...list.map(part => ({ part, ranges: [] }))); continue }
        onProgress?.(`Listening to ${name}…`)
        const audio = await media.decodeMono(src)
        if (!audio) { warn(`Could not read the audio of ${name}.`); continue }
        const db = frameLoudness(audio.samples, audio.sampleRate)
        let speech: TimeRange[] | undefined
        if (settings.pauses) {
          speech = speechFromLoudness(db, { minSilence: settings.minPause, threshold: settings.threshold })
          // With no speech at all, every second would count as a pause.
          if (!speech.length) { warn(`No speech found in ${name}, so no pauses were cut.`); speech = undefined }
        }
        let words: Word[] | undefined
        if (settings.fillers || settings.retakes) {
          onProgress?.(`Transcribing ${name}…`)
          words = await media.transcribeWords(src).catch(error => {
            warn(error instanceof Error ? error.message : String(error))
            return undefined
          })
        }
        const snap = quietSnapper(db)
        for (const part of list) entries.push({ part, ranges: jumpCutRanges({ speech, words, snap }, part, settings) })
      }
      const result = cutCommands(entries, settings, { canRemoveScene: context.scenes.length > 1, nextAlias })
      const caveat = result.counts.filler || result.counts.retake ? ' Word timings are approximate — play it back before keeping it.' : ''
      return { commands: result.commands, note: describeCuts(result) + caveat }
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

    case 'reframe': {
      const W = context.project.width
      const H = context.project.height
      const videos = context.scenes.flatMap(scene => scene.elements
        .filter(el => el.type === 'video' && el.src && (step.elementIds ? step.elementIds.includes(el.id) : scene.index === context.currentSceneIndex))
        .map(el => ({ el, scene })))
      if (!videos.length) { warn('There is no video to reframe on this scene.'); return { commands: [] } }
      const commands: AiEditorCommand[] = []
      const notes: string[] = []
      for (const { el, scene } of videos) {
        const clip = clipWindow(el)
        onProgress?.(`Looking for faces in ${el.name}…`)
        const result = await media.detectFaces(el.src!, clip.from, clip.to, share => onProgress?.(`Looking for faces in ${el.name}… ${Math.round(share * 100)}%`))
          .catch(error => { warn(error instanceof Error ? error.message : String(error)); return null })
        if (!result) continue

        // The box the clip will fill, and the crop that fits it without stretching.
        const cropFor = (box: { width: number; height: number }) => {
          const boxAspect = box.width / box.height
          return result.aspect > boxAspect ? { w: boxAspect / result.aspect, h: 1 } : { w: 1, h: result.aspect / boxAspect }
        }
        let box = step.fill ? { x: 0, y: 0, width: W, height: H } : undefined
        let size = cropFor(box ?? { width: el.width ?? W, height: el.height ?? H })
        if (size.w > 0.97 && size.h > 0.97) {
          // The clip already shows its whole picture: nothing to follow unless it fills a frame of another shape.
          const frameSize = cropFor({ width: W, height: H })
          if (step.fill === undefined && (frameSize.w < 0.97 || frameSize.h < 0.97)) {
            box = { x: 0, y: 0, width: W, height: H }
            size = frameSize
          } else {
            warn(`${el.name} shows its whole picture, so there is no room to follow the face — put it in a narrower area first, or say "reframe it to fill the screen".`)
            continue
          }
        }

        const path = reframePath(result.samples, { cropW: size.w, cropH: size.h, mode: step.mode })
        if (!path) {
          warn(`No face found in ${el.name}, so it was centred instead.`)
          commands.push({ type: 'setCropTrack', elementId: el.id, sceneId: scene.id, sceneIndex: scene.index, targetLabel: el.name, box,
            crop: { x: (1 - size.w) / 2, y: (1 - size.h) / 2, ...size }, keys: [] })
          continue
        }
        if (path.coverage < 0.3) warn(`A face was found in only ${Math.round(path.coverage * 100)}% of ${el.name} — check the framing where nobody is on screen.`)
        const first = path.keys[0]
        commands.push({
          type: 'setCropTrack', elementId: el.id, sceneId: scene.id, sceneIndex: scene.index, targetLabel: el.name, box,
          crop: { x: Math.max(0, Math.min(1 - size.w, first.cx - size.w / 2)), y: Math.max(0, Math.min(1 - size.h, first.cy - size.h / 2)), ...size },
          keys: path.keys,
        })
        notes.push(`Reframe ${el.name}${box ? ' to fill the frame' : ''}: the face is in ${Math.round(path.coverage * 100)}% of it; the crop ${path.moving ? 'follows the speaker smoothly' : 'holds steady on the speaker'}${path.cuts ? ` and cuts with the ${path.cuts} shot change${path.cuts === 1 ? '' : 's'}` : ''}.`)
      }
      return { commands, note: notes.join(' ') || undefined }
    }

    case 'duckMusic': {
      const clips = context.scenes.flatMap(scene => scene.elements
        .filter(el => el.type === 'audio' && el.src)
        .map(el => ({ el, sceneId: scene.id, sceneIndex: scene.index, start: sceneStart(context, scene.id) })))
      const music = step.musicIds?.length
        ? clips.filter(c => step.musicIds!.includes(c.el.id))
        : clips.filter(c => c.el.track !== 'voiceover')
      if (!music.length) { warn('There is no music to duck — add a background track first.'); return { commands: [] } }

      // Everything that talks: unmuted video clips and voiceover tracks.
      const voices = [
        ...context.scenes.flatMap(scene => scene.elements
          .filter(el => el.type === 'video' && el.src && !el.muted && (el.volume ?? 1) > 0)
          .map(el => ({ el, start: sceneStart(context, scene.id), window: clipWindow(el) }))),
        ...clips.filter(c => c.el.track === 'voiceover' || (step.musicIds?.length && !step.musicIds.includes(c.el.id)))
          .map(c => ({ el: c.el, start: c.start, window: audioWindow(c.el) })),
      ].filter(v => !music.some(m => m.el.id === v.el.id))
      if (!voices.length) { warn('There is no voice to duck under — the music needs a video with sound or a voiceover.'); return { commands: [] } }

      const decoded = new Map<string, Awaited<ReturnType<SmartMedia['decodeMono']>>>()
      const speech: TimeRange[] = []
      for (const voice of voices) {
        onProgress?.(`Listening to ${voice.el.name}…`)
        if (!decoded.has(voice.el.src!)) decoded.set(voice.el.src!, await media.decodeMono(voice.el.src!).catch(() => null))
        const audio = decoded.get(voice.el.src!)
        if (!audio) { warn(`Could not read the audio of ${voice.el.name}.`); continue }
        const { from, to, toScene } = voice.window
        for (const [a, b] of detectSpeech(audio.samples, audio.sampleRate, { minSilence: 0.35 })) {
          if (b <= from || a >= to) continue
          speech.push([voice.start + toScene(Math.max(a, from)), voice.start + toScene(Math.min(b, to))])
        }
      }
      if (!speech.length) { warn('No speech found, so the music was left as it is.'); return { commands: [] } }

      const level = step.level ?? DEFAULT_DUCK_LEVEL
      const commands: AiEditorCommand[] = []
      for (const m of music) {
        const keys = duckingKeys(speech, {
          absStart: m.start + (m.el.timelineX ?? 0),
          duration: m.el.duration ?? 0,
          startTime: m.el.startTime ?? 0,
          speed: m.el.playbackRate || 1,
        }, { level, fade: step.fade })
        if (!keys.length && !m.el.volumeKeys) continue
        commands.push({ type: 'setVolumeKeys', elementId: m.el.id, sceneId: m.sceneId, sceneIndex: m.sceneIndex, targetLabel: m.el.name, keys })
      }
      const talking = mergeRanges(speech).reduce((sum, [a, b]) => sum + b - a, 0)
      return {
        commands,
        note: commands.length
          ? `Duck ${commands.length === 1 ? music[0].el.name : `${commands.length} music clips`} to ${Math.round(level * 100)}% while someone talks (${talking.toFixed(1)}s of speech).`
          : 'The music does not play while anyone talks, so nothing changed.',
      }
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

/** The part of the source file an audio clip plays, and source → scene time. */
function audioWindow(audio: AiElementSummary) {
  const from = audio.startTime ?? 0
  const rate = audio.playbackRate || 1
  const offset = audio.timelineX ?? 0
  return { from, to: from + (audio.duration ?? 0) * rate, toScene: (t: number) => offset + (t - from) / rate }
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
