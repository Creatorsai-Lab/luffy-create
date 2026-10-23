import type { SmartMedia } from './expand'
import { detectFaces } from './faces'
import { decodeMono, detectShotChanges } from './media'
import type { Word } from './jumpcut'

export { expandSmartSteps } from './expand'

// Transcribing takes a while, so each file is transcribed once per session
// (the jump-cut panel, transcript editing and prompts share it).
const wordCache = new Map<string, Promise<Word[]>>()

/** Word-level transcript of a file with local Whisper, in source seconds. */
export function transcribeWords(path: string): Promise<Word[]> {
  let hit = wordCache.get(path)
  if (!hit) {
    hit = (async () => {
      if (!window.api.subtitle?.transcribeAudio) throw new Error('Local Whisper is not available.')
      const result = await window.api.subtitle.transcribeAudio({ sourcePath: path, words: true })
      return result.cues
        .map(cue => ({ start: cue.start, end: cue.end, text: cue.text.trim() }))
        .filter(word => word.text && word.end >= word.start)
    })()
    wordCache.set(path, hit)
    hit.catch(() => wordCache.delete(path))
  }
  return hit
}

/** The words of a file if they were already transcribed this session. */
export function hasWords(path: string) {
  return wordCache.has(path)
}

/** Real media access in the app: Web Audio, a hidden <video>, and local Whisper. */
export const browserMedia: SmartMedia = {
  decodeMono,
  detectShotChanges: (path, from, to, find) => detectShotChanges(path, from, to, find),
  detectFaces,
  transcribeWords,
}
