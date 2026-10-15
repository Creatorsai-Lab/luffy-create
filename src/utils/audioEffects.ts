import type { AudioElement } from '../types/editor'
import { audioFadeMultiplierAt } from './audioFade'

type AudioContextCtor = typeof AudioContext

export interface AudioEffectGraph {
  context: AudioContext
  source: MediaElementAudioSourceNode
  pitch: PitchShifter
  bass: BiquadFilterNode
  voiceLow: BiquadFilterNode
  voicePresence: BiquadFilterNode
  saturationTone: BiquadFilterNode
  saturation: WaveShaperNode
  /** Amount the current saturation curve was built for (rebuilt only on change). */
  saturationAmount: number
  gain: GainNode
}

export type AudioEffectGraphMap = Map<string, AudioEffectGraph>

export function clampAudioEffect(value: number | undefined, min: number, max: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(min, Math.min(max, Number(value)))
}

export function clampAudioVolume(value: number | undefined) {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(2, Number(value)))
}

export function audioPitchRatio(pitch: number | undefined) {
  return Math.pow(2, clampAudioEffect(pitch, -12, 12) / 12)
}

/**
 * Rate the source is consumed at. Pitch never changes it — same as export,
 * which shifts pitch with tempo preserved — so preview stays on the timeline.
 */
export function audioPreviewPlaybackRate(audio: AudioElement) {
  return Math.max(0.25, Math.min(2, audio.speed ?? 1))
}

export function syncAudioPlaybackSettings(player: HTMLAudioElement, audio: AudioElement) {
  player.playbackRate = audioPreviewPlaybackRate(audio)
  // Speed keeps the original pitch; the pitch effect is applied in the graph.
  setPreservesPitch(player, true)
}

export function ensureAudioEffectGraph(
  id: string,
  player: HTMLAudioElement,
  graphs: AudioEffectGraphMap
) {
  let graph = graphs.get(id)
  if (graph) return graph

  const Ctor = getAudioContextCtor()
  const context = new Ctor()
  const source = context.createMediaElementSource(player)
  const bass = context.createBiquadFilter()
  const voiceLow = context.createBiquadFilter()
  const voicePresence = context.createBiquadFilter()
  const saturationTone = context.createBiquadFilter()
  const saturation = context.createWaveShaper()
  const gain = context.createGain()

  bass.type = 'lowshelf'
  bass.frequency.value = 160

  voiceLow.type = 'peaking'
  voiceLow.frequency.value = 320
  voiceLow.Q.value = 0.9

  voicePresence.type = 'peaking'
  voicePresence.frequency.value = 2800
  voicePresence.Q.value = 0.8

  saturationTone.type = 'lowpass'
  saturationTone.Q.value = 0.4

  const pitch = createPitchShifter(context)
  source.connect(pitch.input)
  pitch.output.connect(bass)
  bass.connect(voiceLow)
  voiceLow.connect(voicePresence)
  voicePresence.connect(saturationTone)
  saturationTone.connect(saturation)
  saturation.connect(gain)
  gain.connect(context.destination)

  saturation.oversample = '4x'

  graph = { context, source, pitch, bass, voiceLow, voicePresence, saturationTone, saturation, saturationAmount: NaN, gain }
  graphs.set(id, graph)
  return graph
}

export function applyAudioEffects(graph: AudioEffectGraph, audio: AudioElement, clipTime?: number) {
  const volume = clampAudioVolume(audio.volume)
  const fadeMultiplier = clipTime == null
    ? 1
    : audioFadeMultiplierAt({
      duration: audio.duration ?? 0,
      fadeIn: audio.fadeIn ?? 0,
      fadeInVolume: audio.fadeInVolume ?? 1,
      fadeOut: audio.fadeOut ?? 0,
      fadeOutVolume: audio.fadeOutVolume ?? 0,
      clipTime,
    })
  const bass = clampAudioEffect(audio.bass, -12, 12)
  const voice = clampAudioEffect(audio.voice, -100, 100)
  const saturation = clampAudioEffect(audio.saturation, -100, 100)

  graph.gain.gain.value = volume * fadeMultiplier
  graph.pitch.setRatio(audioPitchRatio(audio.pitch))
  graph.bass.gain.value = bass

  graph.voiceLow.gain.value = voice < 0 ? Math.abs(voice) * 0.12 : -voice * 0.035
  graph.voicePresence.gain.value = voice > 0 ? voice * 0.12 : voice * 0.06

  graph.saturationTone.frequency.value = saturation < 0
    ? 20000 - Math.abs(saturation) * 150
    : 20000
  // Called every frame during playback: rebuild the 1024-point curve only when the amount changes.
  if (graph.saturationAmount !== saturation) {
    graph.saturation.curve = makeSaturationCurve(saturation)
    graph.saturationAmount = saturation
  }
}

export function disposeAudioEffectGraphs(graphs: AudioEffectGraphMap) {
  graphs.forEach(graph => {
    try { graph.source.disconnect() } catch {}
    graph.pitch.dispose()
    try { graph.bass.disconnect() } catch {}
    try { graph.voiceLow.disconnect() } catch {}
    try { graph.voicePresence.disconnect() } catch {}
    try { graph.saturationTone.disconnect() } catch {}
    try { graph.saturation.disconnect() } catch {}
    try { graph.gain.disconnect() } catch {}
    void graph.context.close().catch(() => {})
  })
  graphs.clear()
}

function getAudioContextCtor(): AudioContextCtor {
  return (window.AudioContext || (window as typeof window & { webkitAudioContext: AudioContextCtor }).webkitAudioContext)
}

function setPreservesPitch(player: HTMLAudioElement, preserve: boolean) {
  const target = player as HTMLAudioElement & {
    preservesPitch?: boolean
    mozPreservesPitch?: boolean
    webkitPreservesPitch?: boolean
  }
  target.preservesPitch = preserve
  target.mozPreservesPitch = preserve
  target.webkitPreservesPitch = preserve
}

function makeSaturationCurve(amount: number) {
  const samples = 1024
  const curve = new Float32Array(samples)
  if (Math.abs(amount) < 0.01) {
    for (let i = 0; i < samples; i++) curve[i] = (i * 2) / (samples - 1) - 1
    return curve
  }

  const drive = amount > 0 ? 1 + amount / 18 : 1
  const soften = amount < 0 ? 1 - Math.abs(amount) / 180 : 1

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive) * soften
  }

  return curve
}

// ── Pitch shift with tempo preserved (preview only) ──────────────────────────
// Two delay-line voices half a cycle apart. Each voice's delay sweeps as a
// sawtooth: a delay changing at slope s plays the input at rate (1 - s), so a
// growing delay lowers pitch and a shrinking one raises it, while the average
// delay — and therefore timing — stays fixed. Each voice is faded to silence
// at its sawtooth jump, and the two equal-power fades sum to a steady level.
// Export does the same job offline with asetrate + atempo.

const PITCH_CYCLE_SEC = 0.1

export interface PitchShifter {
  input: GainNode
  output: GainNode
  setRatio: (ratio: number) => void
  dispose: () => void
}

export function createPitchShifter(context: BaseAudioContext): PitchShifter {
  const input = context.createGain()
  const output = context.createGain()
  const dry = context.createGain()
  const wet = context.createGain()
  input.connect(dry).connect(output)
  wet.connect(output)
  wet.gain.value = 0

  const length = Math.max(2, Math.round(PITCH_CYCLE_SEC * context.sampleRate))
  const makeBuffer = (fill: (phase: number) => number) => {
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = fill(i / length)
    return buffer
  }
  const ramp = makeBuffer(p => p)                       // 0 -> 1 each cycle
  const fadeWindow = makeBuffer(p => Math.sin(Math.PI * p))  // silent at the ramp's jump

  const sources: AudioBufferSourceNode[] = []
  const loop = (buffer: AudioBuffer, start: number) => {
    const src = context.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.start(start)
    sources.push(src)
    return src
  }

  const voices = [0, 0.5].map(offset => {
    const start = context.currentTime + 0.02 + offset * PITCH_CYCLE_SEC
    const delay = context.createDelay(PITCH_CYCLE_SEC * 2)
    const level = context.createGain()
    const sweep = context.createGain()
    level.gain.value = 0
    sweep.gain.value = 0
    input.connect(delay).connect(level).connect(wet)
    loop(ramp, start).connect(sweep).connect(delay.delayTime)
    loop(fadeWindow, start).connect(level.gain)
    return { delay, sweep }
  })

  let current = 1
  return {
    input,
    output,
    setRatio: ratio => {
      if (Math.abs(ratio - current) < 1e-4) return
      current = ratio
      const shifting = Math.abs(ratio - 1) > 1e-3
      dry.gain.value = shifting ? 0 : 1
      wet.gain.value = shifting ? 1 : 0
      // Delay slope = 1 - ratio, so the sweep depth over one cycle is |1 - ratio| * cycle.
      const depth = Math.min(1, Math.abs(1 - ratio)) * PITCH_CYCLE_SEC
      for (const v of voices) {
        v.delay.delayTime.value = ratio > 1 ? depth : 0   // pitch up: start full, shrink
        v.sweep.gain.value = ratio > 1 ? -depth : depth
      }
    },
    dispose: () => {
      sources.forEach(s => { try { s.stop() } catch {} })
      try { input.disconnect() } catch {}
      try { output.disconnect() } catch {}
    },
  }
}
