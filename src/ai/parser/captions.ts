/**
 * Caption styling from plain language:
 *   "hormozi style captions", "use the karaoke preset", "make the captions yellow
 *   with a black outline", "move the captions to the top", "captions in all caps",
 *   "hide the captions".
 */
import { CAPTION_PRESETS } from '../../subtitle/presets'
import { FONT_FAMILIES, type SubtitleStyle } from '../../types/editor'
import type { AiPlanStep } from '../types'
import { readColors } from './colors'
import { escapeRe, type ParseState } from './refs'
import { readPercent, type Clause } from './text'

const CAPTIONS = /\bcaptions?\b|\bsubtitles\b|\bsubtitle (?:style|track|font)\b|\bclosed captions\b/
const STYLE_WORDS = /\b(?:style|look|preset|font|colou?r|bigger|larger|smaller|size|top|bottom|middle|center|centre|upper|lower|caps|capitals|uppercase|lowercase|outline|stroke|box|background|highlight|karaoke|hide|show|turn on|turn off|enable|disable|fade|pop|word by word)\b/

export function captionsHandler(clause: Clause, state: ParseState): AiPlanStep[] | null {
  const text = clause.text
  const again = state.lastCaptions && !state.lastElements && /\b(?:it|them|they)\b/.test(text)
  if (!CAPTIONS.test(text) && !again) return null
  // "add a caption 'Hi'" adds text; "generate captions" is the Captions window's job.
  if (clause.quotes.length && !/\b(?:font|style|look)\b/.test(text)) return null
  const preset = readPreset(text)
  if (!preset && !STYLE_WORDS.test(text) && !FONT_FAMILIES.some(font => text.includes(font.toLowerCase()))) return null
  // A plain "subtitle" text item on the scene wins over captions when there are none.
  const info = state.context.captions
  if (!info && !preset && !again && !/\bcaptions?\b/.test(text)) return null

  const frame = state.context.project
  const portrait = frame.height > frame.width
  const style: Partial<SubtitleStyle> = {}
  let enabled: boolean | undefined

  if (/\b(?:hide|turn off|disable|remove)\b/.test(text) && !/\b(?:outline|stroke|box|background|highlight|caps|capitals)\b/.test(text)) enabled = false
  else if (/\b(?:show|turn on|enable|unhide)\b/.test(text)) enabled = true

  // Colours go to the outline, box or spoken word when those are named next to them, else the text.
  for (const color of readColors(text)) {
    const around = text.slice(Math.max(0, color.index - 24), color.end + 24)
    if (/\b(?:outline|stroke|border)\b/.test(around) && !style.strokeColor) style.strokeColor = color.hex
    else if (/\b(?:box|background|bg)\b/.test(around) && !style.boxColor) style.boxColor = color.hex
    else if (/\b(?:highlight\w*|spoken|active|current word|karaoke)\b/.test(around) && !style.activeColor) style.activeColor = color.hex
    else if (!style.color) { style.color = color.hex; style.fillMode = 'solid' }
  }
  const off = /\b(?:no|without|remove|hide|turn off)\b/
  if (/\b(?:outline|stroke)\b/.test(text)) {
    if (off.test(text)) style.strokeWidth = 0
    else style.strokeWidth = Number(text.match(/(\d+)\s*(?:px)?\s+(?:outline|stroke)|(?:outline|stroke)\s+(?:of\s+)?(\d+)/)?.slice(1).find(Boolean) ?? Math.round(Math.min(frame.width, frame.height) * 0.008))
  }
  if (/\b(?:box|background)\b/.test(text) && !preset) style.boxOpacity = off.test(text) ? 0 : readPercent(text) ?? 0.72
  if (/\b(?:all caps|uppercase|capitals|capital letters|caps)\b/.test(text)) style.uppercase = !/\b(?:no|without|remove|turn off)\b/.test(text)
  else if (/\b(?:lowercase|lower case|normal case|as written)\b/.test(text)) style.uppercase = false
  if (/\bhighlight\w*\b|\bspoken word\b|\bcurrent word\b/.test(text) && !style.activeColor && !preset) {
    if (off.test(text)) style.activeColor = undefined
    else { style.activeColor = '#facc15'; style.animation = 'karaokePulse' }
  }

  if (/\b(?:top|upper)\b/.test(text)) style.positionY = portrait ? 18 : 12
  else if (/\b(?:middle|center|centre)\b/.test(text)) style.positionY = 50
  else if (/\b(?:bottom|lower)\b/.test(text)) style.positionY = portrait ? 78 : 88

  const size = text.match(/\b(?:size|font size)\s+(?:of\s+|to\s+)?(\d+)|(\d+)\s*(?:px|pt)\b/)
  if (size) style.fontSize = Number(size[1] ?? size[2])
  else if (/\b(?:bigger|larger)\b/.test(text)) style.fontSize = Math.round((info?.fontSize ?? 38) * 1.25)
  else if (/\bsmaller\b/.test(text)) style.fontSize = Math.round((info?.fontSize ?? 38) / 1.25)

  const font = [...FONT_FAMILIES].sort((a, b) => b.length - a.length).find(f => new RegExp(`\\b${escapeRe(f.toLowerCase())}\\b`).test(text))
  if (font) style.fontFamily = font

  if (/\bword by word\b|\bpop(?:s|ping)? in\b/.test(text) && !preset) style.animation = 'wordPop'
  else if (/\bfade\b/.test(text) && !preset) style.animation = 'smoothReveal'

  if (!preset && enabled === undefined && !Object.keys(style).length) return null
  state.lastCaptions = true
  state.lastElements = null
  return [{ type: 'setCaptionStyle', preset: preset?.id, style: Object.keys(style).length ? style : undefined, enabled }]
}

function readPreset(text: string) {
  return CAPTION_PRESETS.find(preset =>
    [...preset.words, ...['style', 'look', 'preset', 'captions'].map(w => `${preset.id} ${w}`)]
      .some(word => new RegExp(`\\b${escapeRe(word)}\\b`).test(text)) ||
    new RegExp(`\\b(?:like|use|apply|make (?:them|the captions|captions))\\s+(?:the\\s+)?${escapeRe(preset.label.toLowerCase())}\\b`).test(text))
}
