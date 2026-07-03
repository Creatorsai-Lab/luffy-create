import type { AudioElement } from '../types/editor'

type AudioContextCtor = typeof AudioContext

export interface AudioEffectGraph {
  context: AudioContext
  source: MediaElementAudioSourceNode
  bass: BiquadFilterNode
  voiceLow: BiquadFilterNode
  voicePresence: BiquadFilterNode
  saturationTone: BiquadFilterNode
  saturation: WaveShaperNode
  gain: GainNode
}

export type AudioEffectGraphMap = Map<string, AudioEffectGraph>

export function clampAudioEffect(value: number | undefined, min: number, max: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(min, Math.min(max, Number(value)))
}

export function audioPitchRatio(pitch: number | undefined) {
  return Math.pow(2, clampAudioEffect(pitch, -12, 12) / 12)
}

export function audioPreviewPlaybackRate(audio: AudioElement) {
  const speed = Math.max(0.25, Math.min(2, audio.speed ?? 1))
  return speed * audioPitchRatio(audio.pitch)
}

export function syncAudioPlaybackSettings(player: HTMLAudioElement, audio: AudioElement) {
  const pitch = clampAudioEffect(audio.pitch, -12, 12)

  player.playbackRate = audioPreviewPlaybackRate(audio)
  setPreservesPitch(player, Math.abs(pitch) < 0.01)
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

  source.connect(bass)
  bass.connect(voiceLow)
  voiceLow.connect(voicePresence)
  voicePresence.connect(saturationTone)
  saturationTone.connect(saturation)
  saturation.connect(gain)
  gain.connect(context.destination)

  graph = { context, source, bass, voiceLow, voicePresence, saturationTone, saturation, gain }
  graphs.set(id, graph)
  return graph
}

export function applyAudioEffects(graph: AudioEffectGraph, audio: AudioElement) {
  const volume = Math.max(0, Math.min(1, audio.volume ?? 1))
  const bass = clampAudioEffect(audio.bass, -12, 12)
  const voice = clampAudioEffect(audio.voice, -100, 100)
  const saturation = clampAudioEffect(audio.saturation, -100, 100)

  graph.gain.gain.value = volume
  graph.bass.gain.value = bass

  graph.voiceLow.gain.value = voice < 0 ? Math.abs(voice) * 0.12 : -voice * 0.035
  graph.voicePresence.gain.value = voice > 0 ? voice * 0.12 : voice * 0.06

  graph.saturationTone.frequency.value = saturation < 0
    ? 20000 - Math.abs(saturation) * 150
    : 20000
  graph.saturation.curve = makeSaturationCurve(saturation)
  graph.saturation.oversample = '4x'
}

export function disposeAudioEffectGraphs(graphs: AudioEffectGraphMap) {
  graphs.forEach(graph => {
    try { graph.source.disconnect() } catch {}
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
