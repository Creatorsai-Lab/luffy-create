import type { SmartMedia } from './expand'
import { decodeMono, detectShotChanges } from './media'

export { expandSmartSteps } from './expand'

/** Real media access in the app: Web Audio, a hidden <video>, and local Whisper. */
export const browserMedia: SmartMedia = {
  decodeMono,
  detectShotChanges: (path, from, to, find) => detectShotChanges(path, from, to, find),
  transcribeWords: async path => {
    if (!window.api.subtitle?.transcribeAudio) throw new Error('Local Whisper is not available.')
    const result = await window.api.subtitle.transcribeAudio({ sourcePath: path, words: true })
    return result.cues.map(cue => ({ start: cue.start, end: cue.end, text: cue.text }))
  },
}
