import { toFileUrl } from '../utils/pathUtils'
import type { SubtitleCue } from './types'

export interface TranscribeOptions {
  sourceSrc: string
  language?: string
  onProgress?: (pct: number, msg: string) => void
}

export interface Transcriber {
  readonly available: boolean
  transcribe(opts: TranscribeOptions): Promise<SubtitleCue[]>
}

function mapBackendCues(cues: Array<{ start: number; end: number; text: string }>): SubtitleCue[] {
  return cues
    .map(cue => ({
      id: crypto.randomUUID(),
      start: Math.max(0, Number(cue.start) || 0),
      end: Math.max(0, Number(cue.end) || 0),
      text: String(cue.text || '').trim(),
    }))
    .filter(cue => cue.text && cue.end > cue.start)
}

function generateIntervalCues(duration: number, count = 10): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const segmentDuration = duration / count
  for (let i = 0; i < count; i++) {
    const start = i * segmentDuration
    const end = (i + 1) * segmentDuration
    cues.push({
      id: crypto.randomUUID(),
      start,
      end,
      text: ''
    })
  }
  return cues
}

// Local VAD timing engine. It detects speech regions but does not perform STT.
export const transcriber: Transcriber = {
  available: true,
  async transcribe(opts: TranscribeOptions): Promise<SubtitleCue[]> {
    const { sourceSrc, onProgress } = opts

    if (window.api.subtitle?.transcribeAudio) {
      try {
        onProgress?.(8, 'Extracting transcript with local Whisper...')
        const result = await window.api.subtitle.transcribeAudio({
          sourcePath: sourceSrc,
          language: opts.language,
        })
        const cues = mapBackendCues(result.cues)
        if (cues.length > 0) {
          onProgress?.(100, `Extracted ${cues.length} text captions`)
          return cues
        }
        onProgress?.(20, 'Local Whisper returned no timed captions; using local timing.')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Local Whisper is unavailable.'
        console.warn('Local Whisper unavailable, falling back to VAD:', error)
        onProgress?.(20, `${message} Using local timing instead.`)
      }
    }

    onProgress?.(5, 'Locating audio file...')
    const fileUrl = toFileUrl(sourceSrc)

    try {
      onProgress?.(15, 'Fetching audio stream...')
      const response = await fetch(fileUrl)
      if (!response.ok) throw new Error(`HTTP error ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()

      onProgress?.(40, 'Initializing audio context...')
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      let audioBuffer: AudioBuffer
      try {
        onProgress?.(55, 'Decoding audio channel data...')
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      } catch (decodeErr) {
        console.warn('VAD: Decoding failed, using fallback interval segmentation.', decodeErr)
        // Check if we can get duration using a temporary video element
        const tempVideo = document.createElement('video')
        tempVideo.src = fileUrl
        await new Promise((resolve) => {
          tempVideo.addEventListener('loadedmetadata', resolve)
          tempVideo.addEventListener('error', resolve)
          setTimeout(resolve, 3000)
        })
        const duration = tempVideo.duration || 15
        tempVideo.src = ''
        return generateIntervalCues(duration, 8)
      } finally {
        await audioCtx.close()
      }

      onProgress?.(75, 'Analyzing voice activity (VAD)...')
      const pcm = audioBuffer.getChannelData(0)
      const sampleRate = audioBuffer.sampleRate
      const duration = audioBuffer.duration

      // Window size: 100ms
      const windowSizeSeconds = 0.1
      const windowSamples = Math.round(sampleRate * windowSizeSeconds)
      
      // Compute average energy/volume per window
      const energies: number[] = []
      for (let i = 0; i < pcm.length; i += windowSamples) {
        let sum = 0
        let count = 0
        for (let j = 0; j < windowSamples && (i + j) < pcm.length; j++) {
          sum += Math.abs(pcm[i + j])
          count++
        }
        energies.push(count > 0 ? sum / count : 0)
      }

      // Find noise floor (average of lowest 20% energies)
      const sortedEnergies = [...energies].sort((a, b) => a - b)
      const noiseFloorIdx = Math.floor(sortedEnergies.length * 0.2)
      const noiseFloor = sortedEnergies[noiseFloorIdx] || 0.005
      
      // Threshold: 2.2x noise floor or at least 0.012
      const threshold = Math.max(0.012, noiseFloor * 2.2)

      // Identify active windows
      const activeWindows = energies.map(e => e > threshold)

      // Voice activity detection state machine
      const minSpeechDuration = 0.5 // seconds
      const maxSilenceDuration = 0.8 // seconds to merge segments
      
      const cues: SubtitleCue[] = []
      let inSpeech = false
      let speechStart = 0

      for (let w = 0; w < activeWindows.length; w++) {
        const time = w * windowSizeSeconds
        const isActive = activeWindows[w]

        if (!inSpeech && isActive) {
          inSpeech = true
          speechStart = time
        } else if (inSpeech && !isActive) {
          // Look ahead to see if silence is brief (merge segments)
          let isBriefSilence = true
          for (let look = 1; look <= Math.round(maxSilenceDuration / windowSizeSeconds); look++) {
            if (w + look < activeWindows.length && activeWindows[w + look]) {
              isBriefSilence = true
              w += look - 1
              break
            }
            isBriefSilence = false
          }

          if (!isBriefSilence) {
            inSpeech = false
            const speechEnd = time
            if (speechEnd - speechStart >= minSpeechDuration) {
              cues.push({
                id: crypto.randomUUID(),
                start: speechStart,
                end: speechEnd,
                text: ''
              })
            }
          }
        }
      }

      // Handle remaining speech at end of file
      if (inSpeech && duration - speechStart >= minSpeechDuration) {
        cues.push({
          id: crypto.randomUUID(),
          start: speechStart,
          end: duration,
          text: ''
        })
      }

      // Fallback if no active segments found
      if (cues.length === 0) {
        return generateIntervalCues(duration, 8)
      }

      onProgress?.(100, `Generated ${cues.length} speech-aligned captions`)
      return cues

    } catch (error) {
      console.error('VAD Transcription failed:', error)
      onProgress?.(100, 'Transcription failed. Generating default interval cues...')
      // General fallback
      return generateIntervalCues(10, 5)
    }
  }
}
