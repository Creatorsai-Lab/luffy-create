import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import type { Project, AudioElement, VideoElement } from '../types/editor'
import type Konva from 'konva'
import { renderTransition } from './transitionRenderer'
import { toFileUrl } from '../utils/pathUtils'
import { buildFfmpegFadeVolumeExpression } from '../utils/audioFade'
import { buildTransitionTimeline, getTransitionFrameState } from '../utils/transitionTiming'

export interface FFmpegExportOptions {
  project: Project
  getStage: () => Konva.Stage | null
  onProgress: (pct: number, message: string) => void
  onLog?: (msg: string) => void
  renderFrame: (t: number) => Promise<void>
  renderSceneFrame?: (sceneId: string, globalTime: number) => Promise<void>
  quality?: '720p' | '1080p'
}

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoaded = false

// FFmpeg's worker reports failures asynchronously and the library registers no
// onerror handler, so a worker that fails to start (e.g. blocked origin) leaves
// load() pending forever. Cap it so the UI surfaces an error instead of hanging.
const FFMPEG_LOAD_TIMEOUT_MS = 30_000
const FALLBACK_EXPORT_AUDIO_GAIN = 4.0

async function deleteIfExists(ffmpeg: FFmpeg, path: string) {
  try { await ffmpeg.deleteFile(path) } catch {}
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s — the FFmpeg worker likely failed to start.`)),
      ms
    )
    promise.then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) }
    )
  })
}

async function loadFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance
  }

  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg()

    ffmpegInstance.on('log', ({ message }) => {
      onLog?.(message)
      console.log('[FFmpeg]', message)
    })
  }

  if (!ffmpegLoaded) {
    onLog?.('Loading FFmpeg...')

    // Get absolute file paths from main process (IPC returns strings, not binaries).
    // Renderer fetches via localasset:// — same CORP headers as video/audio assets,
    // works in both dev and the packaged app (served over the app:// scheme).
    try {
      const { coreJs, coreWasm } = await window.api.ffmpeg.getPaths()
      const toUrl = (p: string) => `localasset:///${p.replace(/\\/g, '/')}`
      onLog?.('Loading FFmpeg core...')
      await withTimeout(
        ffmpegInstance.load({
          coreURL: await toBlobURL(toUrl(coreJs),   'text/javascript'),
          wasmURL: await toBlobURL(toUrl(coreWasm), 'application/wasm'),
        }),
        FFMPEG_LOAD_TIMEOUT_MS,
        'FFmpeg load'
      )
    } catch (err) {
      const msg = `FFmpeg failed to load: ${err instanceof Error ? err.message : String(err)}`
      onLog?.(msg)
      console.error('[FFmpeg]', msg)
      // Reset so a later attempt starts from a clean instance.
      try { ffmpegInstance?.terminate() } catch {}
      ffmpegInstance = null
      ffmpegLoaded = false
      throw new Error(msg)
    }

    ffmpegLoaded = true
    onLog?.('FFmpeg loaded successfully')
  }

  return ffmpegInstance
}

export async function exportToMP4WithFFmpeg(opts: FFmpegExportOptions): Promise<Blob> {
  const {
    project,
    getStage,
    onProgress,
    onLog,
    renderFrame,
    renderSceneFrame,
    quality = '1080p',
  } = opts

  const fps = project.fps
  const totalDuration = project.scenes.reduce((s, sc) => s + sc.duration, 0)
  const totalFrames = Math.ceil(totalDuration * fps)
  const w = project.width
  const h = project.height

  onProgress(0, 'Initializing FFmpeg...')
  const ffmpeg = await loadFFmpeg(onLog)

  onProgress(5, 'Rendering frames...')

  // Composite canvas (also used for transition rendering).
  const composite = document.createElement('canvas')
  composite.width = w
  composite.height = h
  const compositeCtx = composite.getContext('2d', {
    alpha: false,
    desynchronized: false,
    willReadFrequently: false
  })!

  const sceneTimeline = buildTransitionTimeline(project.scenes)

  const fromCanvas = document.createElement('canvas')
  fromCanvas.width = w
  fromCanvas.height = h
  const fromCtx = fromCanvas.getContext('2d', { alpha: false })!

  const toCanvas = document.createElement('canvas')
  toCanvas.width = w
  toCanvas.height = h
  const toCtx = toCanvas.getContext('2d', { alpha: false })!

  async function captureStageInto(ctx: CanvasRenderingContext2D) {
    const stage = getStage()
    if (!stage) throw new Error('Stage not available during export')
    stage.batchDraw()
    await new Promise(r => requestAnimationFrame(r))
    // pixelRatio = 1/scaleX captures at the project's native resolution (e.g. 1920×1080)
    // regardless of how the stage is scaled to fit the screen
    const c = stage.toCanvas({ pixelRatio: 1 / stage.scaleX() })
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(c, 0, 0, w, h)
  }

  async function canvasToJpegBytes(canvas: HTMLCanvasElement, q: number): Promise<Uint8Array> {
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(b => resolve(b!), 'image/jpeg', q)
    })
    return new Uint8Array(await blob.arrayBuffer())
  }

  const jpegQuality = quality === '1080p' ? 0.95 : 0.92

  for (let i = 0; i < totalFrames; i++) {
    const time = i / fps
    const frameState = getTransitionFrameState(sceneTimeline, time)
    let transitionProgress = 0

    if (frameState.kind === 'transition') {
      if (!renderSceneFrame) {
        // Without scene-specific rendering, we can't reliably render both scenes.
        // Fallback: render only the current frame (no transition compositing).
        await renderFrame(time)
        await captureStageInto(compositeCtx)
      } else {
        const fromScene = project.scenes[frameState.fromSceneIndex]
        const toScene = project.scenes[frameState.toSceneIndex]

        // Hold the previous scene on its final stable frame while the entering
        // scene advances from local time 0. This avoids jumping the entering
        // scene forward during the transition and then resetting it at the cut.
        await renderSceneFrame(fromScene.id, frameState.fromTime)
        await captureStageInto(fromCtx)

        await renderSceneFrame(toScene.id, frameState.toTime)
        await captureStageInto(toCtx)

        renderTransition({
          ctx: compositeCtx,
          width: w,
          height: h,
          progress: frameState.progress,
          type: frameState.transition.type,
          direction: frameState.transition.direction,
          speed: frameState.transition.speed,
          hardness: frameState.transition.hardness,
          fromCanvas,
          toCanvas
        })
        transitionProgress = frameState.progress
      }
    } else {
      // Normal (non-transition) frame.
      await renderFrame(time)
      await captureStageInto(compositeCtx)
    }

    const filename = `frame${String(i).padStart(6, '0')}.jpg`
    const bytes = await canvasToJpegBytes(composite, jpegQuality)
    await ffmpeg.writeFile(filename, bytes)

    const frameProgress = Math.round((i / totalFrames) * 70)
    onProgress(5 + frameProgress, `Rendering frame ${i + 1}/${totalFrames} (${time.toFixed(2)}s${frameState.kind === 'transition' ? `, trans ${(transitionProgress * 100).toFixed(0)}%` : ''})`)

    // Log progress every 30 frames
    if (i % 30 === 0) {
      onLog?.(`Rendered frame ${i + 1}/${totalFrames} at time ${time.toFixed(2)}s`)
    }
  }

  onProgress(85, 'Encoding video...')

  const outputFile = 'output.mp4'
  const crf = quality === '1080p' ? '16' : '18'
  await deleteIfExists(ffmpeg, outputFile)

  // Build FFmpeg command
  const ffmpegArgs = [
    '-y',
    '-framerate', String(fps),
    '-i', 'frame%06d.jpg',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', crf,
    '-preset', 'fast',
    '-movflags', '+faststart',
    '-profile:v', 'high',
    '-level', '4.2',
    // Proper color space tags eliminate the faded/washed-out look
    '-color_range', '1',
    '-colorspace', 'bt709',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
  ]

  // Scale to target resolution (720p or 1080p height, maintaining aspect ratio)
  if (quality === '720p') {
    ffmpegArgs.push('-vf', 'scale=-2:720,format=yuv420p')
  } else if (h > 1080) {
    // 4K project → clamp to 1080p
    ffmpegArgs.push('-vf', 'scale=-2:1080,format=yuv420p')
  }

  ffmpegArgs.push(
    '-r', String(fps),
    '-t', String(totalDuration),
    outputFile
  )

  onLog?.(`FFmpeg command: ${ffmpegArgs.join(' ')}`)

  // Execute FFmpeg (video-only pass)
  await ffmpeg.exec(ffmpegArgs)

  // ── Audio mixing pass ────────────────────────────────────────────────────────
  // Collect every audio element from every scene, with absolute timeline positions
  const audioClips: {
    sourceKind: 'audio' | 'video'
    src: string; absStart: number; startTime: number
    duration: number; speed: number; volume: number
    voice: number; pitch: number; bass: number; saturation: number
    fadeIn: number; fadeInVolume: number; fadeOut: number; fadeOutVolume: number
  }[] = []

  let audioElapsed = 0
  for (const scene of project.scenes) {
    for (const el of scene.elements) {
      if (el.type === 'audio') {
        const a = el as AudioElement
        audioClips.push({
          sourceKind: 'audio',
          src:       a.src,
          absStart:  audioElapsed + (a.x ?? 0),
          startTime: a.startTime ?? 0,
          duration:  a.duration  ?? 0,
          speed:     a.speed     ?? 1,
          volume:    a.volume    ?? 1,
          voice:     a.voice     ?? 0,
          pitch:     a.pitch     ?? 0,
          bass:      a.bass      ?? 0,
          saturation: a.saturation ?? 0,
          fadeIn:    a.fadeIn    ?? 0,
          fadeInVolume: a.fadeInVolume ?? 1,
          fadeOut:   a.fadeOut   ?? 0,
          fadeOutVolume: a.fadeOutVolume ?? 0,
        })
      } else if (el.type === 'video') {
        const v = el as VideoElement
        if (!v.muted && (v.volume ?? 1) > 0) {
          audioClips.push({
            sourceKind: 'video',
            src:       v.src,
            absStart:  audioElapsed + (v.timelineX ?? 0),
            startTime: v.startTime ?? 0,
            duration:  v.duration ?? v.sourceDuration ?? 0,
            speed:     v.playbackRate ?? 1,
            volume:    v.volume ?? 1,
            voice:     0,
            pitch:     0,
            bass:      0,
            saturation: 0,
            fadeIn:    0,
            fadeInVolume: 1,
            fadeOut:   0,
            fadeOutVolume: 0,
          })
        }
      }
    }
    audioElapsed += scene.duration
  }

  let finalBlob: Blob | null = null

  if (audioClips.length > 0) {
    onProgress(86, 'Loading audio files...')

    // Write audio files into FFmpeg FS
    const writtenFiles: string[] = []
    const validClips: typeof audioClips = []

    for (let i = 0; i < audioClips.length; i++) {
      const clip = audioClips[i]
      const rawDur = clip.duration * clip.speed
      if (rawDur <= 0) continue
      const ext = clip.src.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'mp3'
      const fname = `aud${i}.${ext}`
      try {
        const bytes = await fetchFile(toFileUrl(clip.src))
        await ffmpeg.writeFile(fname, bytes)
        writtenFiles.push(fname)
        validClips.push(clip)
      } catch (err) {
        onLog?.(`Warning: skipped audio ${clip.src}: ${err}`)
      }
    }

    if (validClips.length > 0) {
      onProgress(90, 'Mixing audio...')

      const mediaInputs = validClips.map((clip, index) => ({ clip, file: writtenFiles[index] }))

      const runAudioMux = async (
        masterFilters: string[],
        suffix: string,
        sourceKinds: Array<'audio' | 'video'> = ['audio', 'video']
      ) => {
        const inputs = mediaInputs.filter(input => sourceKinds.includes(input.clip.sourceKind))
        if (inputs.length === 0) throw new Error(`No ${sourceKinds.join('/')} clips available for audio mux`)

        const filterSegments: string[] = []
        const outLabels: string[] = []
        const audioInArgs: string[] = []

        inputs.forEach(({ clip, file }, index) => {
          audioInArgs.push('-i', file)
          const rawDur  = clip.duration * clip.speed
          const delayMs = Math.round(clip.absStart * 1000)
          const label   = `[aout_${suffix}_${index}]`

          const filt: string[] = [
            `atrim=start=${clip.startTime.toFixed(3)}:duration=${rawDur.toFixed(3)}`,
            `asetpts=PTS-STARTPTS`,
            ...buildPitchFilters(clip.pitch),
            ...buildAtempoFilters(clip.speed),
            ...buildAudioToneFilters(clip.voice, clip.bass, clip.saturation),
          ]
          const volumeFilter = buildFfmpegFadeVolumeExpression({
            duration: clip.duration,
            baseVolume: clip.volume,
            fadeIn: clip.fadeIn,
            fadeInVolume: clip.fadeInVolume,
            fadeOut: clip.fadeOut,
            fadeOutVolume: clip.fadeOutVolume,
          })
          if (volumeFilter) filt.push(volumeFilter)
          if (delayMs > 0) filt.push(`adelay=${delayMs}:all=1`)
          filt.push(`apad=whole_dur=${totalDuration.toFixed(3)}`)

          filterSegments.push(`[${index + 1}:a]${filt.join(',')}${label}`)
          outLabels.push(label)
        })

        let mixedAudioLabel: string
        if (outLabels.length === 1) {
          mixedAudioLabel = outLabels[0]
        } else {
          mixedAudioLabel = `[afinal_${suffix}]`
          filterSegments.push(`${outLabels.join('')}amix=inputs=${outLabels.length}:normalize=0${mixedAudioLabel}`)
        }

        const masteredAudioLabel = `[amastered_${suffix}]`
        const finalFile = `with_audio_output_${suffix}.mp4`
        await deleteIfExists(ffmpeg, finalFile)
        const allSegments = [
          ...filterSegments,
          `${mixedAudioLabel}${masterFilters.join(',')}${masteredAudioLabel}`,
        ]
        const muxArgs = [
          '-y',
          '-i', outputFile,
          ...audioInArgs,
          '-filter_complex', allSegments.join(';'),
          '-map', '0:v',
          '-map', masteredAudioLabel,
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-t', totalDuration.toFixed(3),
          finalFile,
        ]
        onLog?.(`Audio mux command (${suffix}): ${muxArgs.join(' ')}`)
        await ffmpeg.exec(muxArgs)
        const finalData = await ffmpeg.readFile(finalFile) as Uint8Array
        try { await ffmpeg.deleteFile(finalFile) } catch {}
        return new Blob([finalData as BlobPart], { type: 'video/mp4' })
      }

      try {
        finalBlob = await runAudioMux([
          'loudnorm=I=-14:LRA=11:TP=-1.5',
          'alimiter=limit=0.98',
        ], 'loudnorm')
      } catch (err) {
        onLog?.(`Full audio mix loudness normalization failed, retrying simple gain: ${err}`)
        try {
          finalBlob = await runAudioMux([
            `volume=${FALLBACK_EXPORT_AUDIO_GAIN.toFixed(3)}`,
            'alimiter=limit=0.98',
          ], 'gain')
        } catch (fallbackErr) {
          onLog?.(`Full audio mix failed, retrying timeline audio only: ${fallbackErr}`)
          try {
            finalBlob = await runAudioMux([
              'loudnorm=I=-14:LRA=11:TP=-1.5',
              'alimiter=limit=0.98',
            ], 'audio_only', ['audio'])
          } catch (audioOnlyErr) {
            onLog?.(`Audio mixing failed, exporting video without audio: ${audioOnlyErr}`)
          }
        }
      }

      // Clean up audio files
      for (const fn of writtenFiles) { try { await ffmpeg.deleteFile(fn) } catch {} }
    }
  }

  // ── Fallback: video-only blob ─────────────────────────────────────────────────
  onProgress(95, 'Reading output file...')
  const data = await ffmpeg.readFile(outputFile) as Uint8Array
  const blob = finalBlob ?? new Blob([data as BlobPart], { type: 'video/mp4' })

  onProgress(98, 'Cleaning up...')

  for (let i = 0; i < totalFrames; i++) {
    try { await ffmpeg.deleteFile(`frame${String(i).padStart(6, '0')}.jpg`) } catch {}
  }
  try { await ffmpeg.deleteFile(outputFile) } catch {}

  onProgress(100, 'Export complete!')
  return blob
}

// Builds a chain of atempo filters that handles any speed (atempo range: 0.5–2.0)
function buildAtempoFilters(speed: number): string[] {
  if (speed === 1) return []
  const filters: string[] = []
  let s = speed
  while (s > 2.0)  { filters.push('atempo=2.0'); s /= 2.0 }
  while (s < 0.5)  { filters.push('atempo=0.5'); s /= 0.5 }
  filters.push(`atempo=${s.toFixed(6)}`)
  return filters
}

function buildPitchFilters(pitch: number): string[] {
  const semitones = clamp(pitch, -12, 12)
  if (Math.abs(semitones) < 0.01) return []

  const ratio = Math.pow(2, semitones / 12)
  const shiftedRate = Math.max(8000, Math.round(44100 * ratio))
  return [
    `asetrate=${shiftedRate}`,
    'aresample=44100',
    ...buildAtempoFilters(1 / ratio),
  ]
}

function buildAudioToneFilters(voice: number, bass: number, saturation: number): string[] {
  const filters: string[] = []
  const voiceTone = clamp(voice, -100, 100)
  const bassGain = clamp(bass, -12, 12)
  const sat = clamp(saturation, -100, 100)

  if (Math.abs(bassGain) >= 0.1) {
    filters.push(`equalizer=f=120:t=q:w=0.9:g=${bassGain.toFixed(2)}`)
  }

  if (voiceTone > 0.1) {
    filters.push(`equalizer=f=2800:t=q:w=0.8:g=${(voiceTone * 0.12).toFixed(2)}`)
  } else if (voiceTone < -0.1) {
    filters.push(`equalizer=f=320:t=q:w=0.9:g=${(Math.abs(voiceTone) * 0.12).toFixed(2)}`)
    filters.push(`equalizer=f=2800:t=q:w=0.8:g=${(voiceTone * 0.06).toFixed(2)}`)
  }

  if (sat > 0.1) {
    filters.push(`volume=${(1 + sat / 65).toFixed(4)}`)
    filters.push('alimiter=limit=0.95')
  } else if (sat < -0.1) {
    filters.push(`equalizer=f=6500:t=q:w=0.7:g=${(sat * 0.08).toFixed(2)}`)
  }

  return filters
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(min, Math.min(max, value))
}

export interface FFmpegStatus {
  ok: boolean
  error?: string
}

export async function checkFFmpeg(onLog?: (msg: string) => void): Promise<FFmpegStatus> {
  try {
    await loadFFmpeg(onLog)
    return { ok: true }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('FFmpeg not available:', msg)
    return { ok: false, error: msg }
  }
}

export async function isFFmpegAvailable(): Promise<boolean> {
  return (await checkFFmpeg()).ok
}
