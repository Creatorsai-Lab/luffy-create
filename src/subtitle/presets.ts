/**
 * Caption looks that short-form creators use, as one-click style presets.
 * Sizes and positions are relative to the frame, so a preset looks right in
 * 16:9 and 9:16 alike. A preset only sets style fields; the cues stay as they are.
 */
import type { SubtitleStyle } from '../types/editor'

export interface CaptionPreset {
  id: string
  label: string
  description: string
  /** Distinctive words for it ("hormozi", "karaoke"), for the AI parser — not plain style words like "green". */
  words: string[]
  style: (frame: { width: number; height: number }) => Partial<SubtitleStyle>
}

const short = (frame: { width: number; height: number }) => Math.min(frame.width, frame.height)
const portrait = (frame: { width: number; height: number }) => frame.height > frame.width

/** Everything a preset may set, cleared first so presets don't leak into each other. */
const RESET: Partial<SubtitleStyle> = {
  italic: false, fillMode: 'solid', captionLook: 'normal',
  uppercase: false, strokeWidth: 0, activeColor: undefined, boxOpacity: 0,
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: 'bold',
    label: 'Bold',
    description: 'Big uppercase words with a black outline; the spoken word turns yellow.',
    words: ['hormozi', 'viral', 'tiktok', 'reels', 'shorts', 'bold captions', 'bold subtitles', 'bold style', 'bold look', 'bold preset'],
    style: frame => ({
      ...RESET, fontFamily: 'Montserrat', fontWeight: 'bold', fontSize: Math.round(short(frame) * 0.075),
      color: '#ffffff', uppercase: true, strokeColor: '#000000', strokeWidth: Math.round(short(frame) * 0.009),
      activeColor: '#facc15', animation: 'karaokePulse', maxWidthPct: 80, positionX: 50, positionY: portrait(frame) ? 68 : 80,
    }),
  },
  {
    id: 'karaoke',
    label: 'Karaoke',
    description: 'Words light up green one by one as they are spoken.',
    words: ['karaoke', 'karaoke style', 'karaoke captions'],
    style: frame => ({
      ...RESET, fontFamily: 'Poppins', fontWeight: 'bold', fontSize: Math.round(short(frame) * 0.06),
      color: '#ffffff', strokeColor: '#000000', strokeWidth: Math.round(short(frame) * 0.006),
      activeColor: '#22c55e', animation: 'karaokePulse', maxWidthPct: 84, positionX: 50, positionY: portrait(frame) ? 70 : 82,
    }),
  },
  {
    id: 'boxed',
    label: 'Boxed',
    description: 'White text on a dark rounded box — easy to read on any footage.',
    words: ['boxed', 'netflix', 'boxed captions'],
    style: frame => ({
      ...RESET, fontFamily: 'Inter', fontWeight: 'semibold', fontSize: Math.round(short(frame) * 0.045),
      color: '#ffffff', boxColor: '#000000', boxOpacity: 0.72, animation: 'smoothReveal',
      maxWidthPct: 80, positionX: 50, positionY: portrait(frame) ? 74 : 86,
    }),
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Clean, small white text with a soft fade — for calm, cinematic videos.',
    words: ['minimal', 'minimalist', 'cinematic', 'subtle', 'clean style', 'clean captions'],
    style: frame => ({
      ...RESET, fontFamily: 'Inter', fontWeight: 'normal', fontSize: Math.round(short(frame) * 0.038),
      color: '#ffffff', strokeColor: '#000000', strokeWidth: Math.max(1, Math.round(short(frame) * 0.002)),
      animation: 'smoothReveal', maxWidthPct: 70, positionX: 50, positionY: portrait(frame) ? 78 : 90,
    }),
  },
  {
    id: 'pop',
    label: 'Pop',
    description: 'Playful words that pop in with a bounce, in a comic font.',
    words: ['pop style', 'pop captions', 'playful', 'comic', 'bouncy', 'mrbeast', 'mr beast'],
    style: frame => ({
      ...RESET, fontFamily: 'Bangers', fontWeight: 'normal', fontSize: Math.round(short(frame) * 0.085),
      color: '#ffffff', uppercase: true, strokeColor: '#111111', strokeWidth: Math.round(short(frame) * 0.01),
      activeColor: '#38bdf8', animation: 'wordPop', maxWidthPct: 80, positionX: 50, positionY: portrait(frame) ? 62 : 76,
    }),
  },
]

export function getCaptionPreset(id: string) {
  return CAPTION_PRESETS.find(p => p.id === id)
}

/** The preset a style was made from, if it still matches on the fields a preset sets. */
export function matchingCaptionPreset(style: SubtitleStyle, frame: { width: number; height: number }) {
  return CAPTION_PRESETS.find(preset => Object.entries(preset.style(frame))
    .every(([key, value]) => (style as unknown as Record<string, unknown>)[key] === value ||
      (value === undefined || value === false || value === 0) && !(style as unknown as Record<string, unknown>)[key]))
}
