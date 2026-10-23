/**
 * Every image/video effect: name, group, where it runs in the pipeline, its
 * settings (the Effects panel builds its controls from these) and the words
 * the AI understands for it. Pure — no browser APIs.
 *
 * Pipeline stages, in order: `item` moves the whole item (float, wiggle,
 * drift); then on the picture, inside its box: `look` (colour), `body`
 * (needs the person mask), `camera` (zoom/shake, combined into one move),
 * `warp` (distortions), `stylize` (everything else, in catalogue order).
 */
import type { FxType } from '../../types/editor'

export type FxGroup = 'body' | 'retro' | 'glitch' | 'warp' | 'light' | 'energy' | 'motion' | 'weather' | 'look'
export type FxStage = 'item' | 'look' | 'body' | 'camera' | 'warp' | 'stylize'

export interface FxParam {
  key: string
  label: string
  kind: 'slider' | 'color' | 'select' | 'toggle'
  default: number | string | boolean
  min?: number
  max?: number
  step?: number
  /** A 0–1 value shown as a percentage. */
  percent?: boolean
  options?: Array<{ value: string; label: string }>
}

export interface FxDef {
  type: FxType
  label: string
  group: FxGroup
  desc: string
  stage: FxStage
  /** Default strength. */
  intensity: number
  /** Has an animation speed. */
  speed?: boolean
  /** Can hit on the music's beats. */
  beat?: boolean
  /** Uses the AI person mask. */
  mask?: boolean
  params: FxParam[]
  /** Words people use for it — for the AI. */
  words: RegExp
}

export const FX_GROUPS: Array<{ id: FxGroup; label: string }> = [
  { id: 'body', label: 'Body (AI)' },
  { id: 'retro', label: 'Retro & Texture' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'warp', label: 'Warp' },
  { id: 'light', label: 'Light' },
  { id: 'energy', label: 'Energy' },
  { id: 'motion', label: 'Motion' },
  { id: 'weather', label: 'Weather' },
  { id: 'look', label: 'Colour look' },
]

const pct = (key: string, label: string, value: number): FxParam => ({ key, label, kind: 'slider', default: value, min: 0, max: 1, step: 0.01, percent: true })
const color = (key: string, label: string, value: string): FxParam => ({ key, label, kind: 'color', default: value })
const select = (key: string, label: string, value: string, options: Array<[string, string]>): FxParam =>
  ({ key, label, kind: 'select', default: value, options: options.map(([v, l]) => ({ value: v, label: l })) })
const toggle = (key: string, label: string, value: boolean): FxParam => ({ key, label, kind: 'toggle', default: value })

const DIRECTIONS: Array<[string, string]> = [['left', 'Left'], ['right', 'Right'], ['up', 'Up'], ['down', 'Down']]
const CORNERS: Array<[string, string]> = [['center', 'Centre'], ['topLeft', 'Top left'], ['topRight', 'Top right'], ['bottomRight', 'Bottom right'], ['bottomLeft', 'Bottom left']]

export const LOOKS: Array<[string, string]> = [
  ['cinematic', 'Cinematic'], ['tealOrange', 'Teal & orange'], ['warm', 'Warm'], ['cool', 'Cool'], ['vintage', 'Vintage'],
  ['fadedFilm', 'Faded film'], ['bleachBypass', 'Bleach bypass'], ['vivid', 'Vivid'], ['cyberpunk', 'Cyberpunk'],
  ['sunset', 'Sunset'], ['monochrome', 'Monochrome'], ['noir', 'Noir'],
]

export const FX_DEFS: FxDef[] = [
  // ── Body (AI) ─────────────────────────────────────────────────────────────
  { type: 'neonOutline', label: 'Neon outline', group: 'body', stage: 'body', mask: true, intensity: 0.85, speed: true, beat: true,
    desc: 'A glowing neon line traced around the person',
    params: [color('color', 'Colour', '#00f0ff'), color('color2', 'Second colour', '#ff2bd6'), toggle('cycle', 'Colour cycle', true), pct('width', 'Thickness', 0.35), pct('glow', 'Glow', 0.6)],
    words: /\bneon(?:\s+(?:outline|line|edge|glow|light))?\b|\b(?:glowing|light)\s+outline\b|\boutline\s+(?:me|him|her|them|the\s+person)\b/ },
  { type: 'aura', label: 'Aura glow', group: 'body', stage: 'body', mask: true, intensity: 0.75, speed: true, beat: true,
    desc: 'A soft coloured glow radiating from the person',
    params: [color('color', 'Colour', '#a855f7'), pct('size', 'Size', 0.5)],
    words: /\baura\b|\b(?:body|person)\s+glow\b|\bglow(?:ing)?\s+around\s+(?:me|him|her|them|the\s+person)\b/ },
  { type: 'spotlight', label: 'Spotlight', group: 'body', stage: 'body', mask: true, intensity: 0.7,
    desc: 'Dims everything but the person',
    params: [pct('softness', 'Edge softness', 0.4), color('color', 'Surroundings', '#000000')],
    words: /\bspotlight\b|\b(?:dim|darken)\s+(?:the\s+)?(?:background|surroundings)\b/ },
  { type: 'echo', label: 'Echo trail', group: 'body', stage: 'body', mask: true, intensity: 0.7, speed: true, beat: true,
    desc: 'Coloured copies of the person trail behind them',
    params: [{ key: 'count', label: 'Copies', kind: 'slider', default: 3, min: 1, max: 6, step: 1 }, pct('spacing', 'Spacing', 0.35), select('direction', 'Trail', 'left', [...DIRECTIONS, ['around', 'Around']]), toggle('rainbow', 'Rainbow', true)],
    words: /\becho(?:\s+trail)?\b|\b(?:after\s*image|clone\s+trail|ghost\s+trail|trail(?:s)?\s+of\s+(?:me|the\s+person))\b/ },

  // ── Retro & texture ──────────────────────────────────────────────────────
  { type: 'vhs', label: 'VHS', group: 'retro', stage: 'stylize', intensity: 0.8, speed: true,
    desc: 'Tape wobble, colour bleed, noise and tracking lines',
    params: [pct('noise', 'Noise', 0.5), pct('wobble', 'Wobble', 0.5), pct('bleed', 'Colour bleed', 0.5)],
    words: /\bvhs\b|\bvideo\s*tape\b|\btape\s+look\b|\bcamcorder\b|\b(?:90s|80s)\s+(?:look|video|style)\b|\bretro\b/ },
  { type: 'film8mm', label: '8mm film', group: 'retro', stage: 'stylize', intensity: 0.8, speed: true,
    desc: 'Warm home-movie film: gate weave, flicker, dust and soft edges',
    params: [pct('warmth', 'Warmth', 0.6), pct('flicker', 'Flicker', 0.5), pct('dust', 'Dust', 0.5)],
    words: /\b(?:8\s*mm|super\s*8|super-8|home\s+movie|film\s+look|filmic|analog(?:ue)?\s+film)\b/ },
  { type: 'oldFilm', label: 'Old film', group: 'retro', stage: 'stylize', intensity: 0.85, speed: true,
    desc: 'Black-and-white silent-film look with scratches and flicker',
    params: [pct('scratches', 'Scratches', 0.6), pct('sepia', 'Sepia', 0.4)],
    words: /\bold\s+(?:film|movie)\b|\bsilent\s+(?:film|movie)\b|\bvintage\s+film\b|\bsepia\b|\bblack\s+and\s+white\s+film\b/ },
  { type: 'dust', label: 'Dust & scratches', group: 'retro', stage: 'stylize', intensity: 0.7, speed: true,
    desc: 'Specks and hairline scratches on the film',
    params: [pct('amount', 'Amount', 0.5), toggle('scratches', 'Scratches', true)],
    words: /\bdust\b|\bscratch(?:es|ed)?\b|\bspecks?\b/ },
  { type: 'paper', label: 'Paper texture', group: 'retro', stage: 'stylize', intensity: 0.5,
    desc: 'Paper, canvas or grunge texture over the picture',
    params: [select('kind', 'Texture', 'paper', [['paper', 'Paper'], ['canvas', 'Canvas'], ['grunge', 'Grunge']]), pct('scale', 'Scale', 0.5)],
    words: /\b(?:paper|canvas|grunge)\s*(?:texture|look)?\b|\btexture\b/ },
  { type: 'halftone', label: 'Halftone comic', group: 'retro', stage: 'stylize', intensity: 1,
    desc: 'Printed comic dots',
    params: [pct('dot', 'Dot size', 0.35), toggle('mono', 'Black & white', false)],
    words: /\bhalftone\b|\bcomic(?:\s+book)?\b|\bpop\s*art\b|\bprint\s+dots\b/ },
  { type: 'grain', label: 'Film grain', group: 'retro', stage: 'stylize', intensity: 0.35, speed: true,
    desc: 'Living film grain',
    params: [pct('size', 'Size', 0.3), toggle('color', 'Colour grain', false)],
    words: /\bgrain(?:y)?\b|\bnoise\b/ },

  // ── Glitch ───────────────────────────────────────────────────────────────
  { type: 'glitch', label: 'Digital glitch', group: 'glitch', stage: 'stylize', intensity: 0.7, speed: true, beat: true,
    desc: 'Torn blocks, colour split and noise bursts',
    params: [pct('blocks', 'Blocks', 0.6), pct('rgb', 'Colour split', 0.5)],
    words: /\bglitch(?:y|es|ing)?\b|\bdigital\s+distortion\b|\bdatamosh\w*/ },
  { type: 'rgbSplit', label: 'RGB split', group: 'glitch', stage: 'stylize', intensity: 0.6, speed: true, beat: true,
    desc: 'Red, green and blue pull apart',
    params: [select('axis', 'Direction', 'horizontal', [['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['radial', 'From the centre']]), toggle('animate', 'Animate', true)],
    words: /\brgb\s*(?:split|shift)\b|\bchromatic(?:\s+aberration)?\b|\bcolou?r\s+split\b/ },
  { type: 'crt', label: 'CRT screen', group: 'glitch', stage: 'stylize', intensity: 0.8,
    desc: 'Old TV: scanlines, RGB mask and curved glass',
    params: [pct('scanlines', 'Scanlines', 0.6), pct('curve', 'Curve', 0.4)],
    words: /\bcrt\b|\bscan\s*lines?\b|\bold\s+(?:tv|television|monitor)\b|\btv\s+screen\b/ },
  { type: 'signalLoss', label: 'Signal loss', group: 'glitch', stage: 'stylize', intensity: 0.6, speed: true, beat: true,
    desc: 'Rolling bars, dropouts and static',
    params: [],
    words: /\bsignal\s+(?:loss|lost|interference)\b|\bstatic\b|\bbad\s+(?:signal|reception)\b/ },

  // ── Warp ─────────────────────────────────────────────────────────────────
  { type: 'wave', label: 'Wave', group: 'warp', stage: 'warp', intensity: 0.5, speed: true,
    desc: 'The picture ripples in waves',
    params: [pct('frequency', 'Frequency', 0.4), select('axis', 'Direction', 'horizontal', [['horizontal', 'Horizontal'], ['vertical', 'Vertical']])],
    words: /\bwav(?:e|y|ing)\b|\bwobbl\w*|\bdistort(?:ion|ed)?\b|\bwarp(?:s|ed|ing)?\b/ },
  { type: 'swirl', label: 'Swirl', group: 'warp', stage: 'warp', intensity: 0.6, speed: true,
    desc: 'A twisting vortex in the middle',
    params: [pct('radius', 'Size', 0.6)],
    words: /\bswirl\w*|\btwirl\w*|\bvortex\b|\btwist\w*/ },
  { type: 'bulge', label: 'Bulge', group: 'warp', stage: 'warp', intensity: 0.5,
    desc: 'Fisheye bulge, or pinch',
    params: [select('mode', 'Shape', 'bulge', [['bulge', 'Bulge'], ['pinch', 'Pinch'], ['fisheye', 'Fisheye lens']]), pct('radius', 'Size', 0.6)],
    words: /\bbulg\w*|\bfish\s*eye\b|\bpinch\w*|\bbloat\w*/ },
  { type: 'ripple', label: 'Ripple', group: 'warp', stage: 'warp', intensity: 0.5, speed: true,
    desc: 'Rings ripple out from the centre like water',
    params: [pct('frequency', 'Frequency', 0.5)],
    words: /\bripple\w*|\bwater\s+(?:drop|ripple)\b/ },
  { type: 'kaleidoscope', label: 'Kaleidoscope', group: 'warp', stage: 'warp', intensity: 1, speed: true,
    desc: 'Mirrored slices around the centre',
    params: [{ key: 'segments', label: 'Slices', kind: 'slider', default: 6, min: 2, max: 12, step: 1 }, toggle('spin', 'Turn', true)],
    words: /\bkaleidoscop\w*|\bmirror(?:ed)?\s+(?:effect|slices)\b|\btrippy\b/ },
  { type: 'heatHaze', label: 'Heat haze', group: 'warp', stage: 'warp', intensity: 0.5, speed: true,
    desc: 'Shimmering hot air',
    params: [],
    words: /\bheat\s+(?:haze|wave|shimmer)\b|\bmirage\b|\bshimmer\w*/ },

  // ── Light ────────────────────────────────────────────────────────────────
  { type: 'glow', label: 'Glow', group: 'light', stage: 'stylize', intensity: 0.6,
    desc: 'Bright parts bloom with soft light',
    params: [pct('threshold', 'Brightness needed', 0.6), pct('radius', 'Spread', 0.5), color('color', 'Tint', '#ffffff')],
    words: /\b(?:glow|bloom|dreamy|soft\s+glow|glowing)\b/ },
  { type: 'halation', label: 'Halation', group: 'light', stage: 'stylize', intensity: 0.6,
    desc: 'Red film halo around highlights',
    params: [pct('radius', 'Spread', 0.5), color('color', 'Halo', '#ff4a1c')],
    words: /\bhalation\b|\bfilm\s+halo\b/ },
  { type: 'lightLeak', label: 'Light leaks', group: 'light', stage: 'stylize', intensity: 0.7, speed: true,
    desc: 'Warm light drifting across the film',
    params: [color('color', 'Colour', '#ff8a3d')],
    words: /\blight\s*leaks?\b|\bwarm\s+light\b/ },
  { type: 'lightSweep', label: 'Light sweep', group: 'light', stage: 'stylize', intensity: 0.7, speed: true, beat: true,
    desc: 'A band of light sweeps across, shine-like',
    params: [color('color', 'Colour', '#fff6d5'), pct('width', 'Width', 0.3), select('direction', 'Sweep', 'right', DIRECTIONS)],
    words: /\blight\s+sweep\b|\bshine\b|\bshimmer\s+sweep\b|\bglint\b/ },
  { type: 'godRays', label: 'God rays', group: 'light', stage: 'stylize', intensity: 0.6, speed: true,
    desc: 'Volumetric light beams from a bright point',
    params: [pct('x', 'Light across', 0.5), pct('y', 'Light down', 0.1), pct('length', 'Beam length', 0.6), color('color', 'Colour', '#fff2c4')],
    words: /\bgod\s*rays?\b|\b(?:light|sun)\s*(?:rays|beams)\b|\bvolumetric\b/ },
  { type: 'lensFlare', label: 'Lens flare', group: 'light', stage: 'stylize', intensity: 0.7, speed: true,
    desc: 'A drifting lens flare with ghosts',
    params: [pct('x', 'Across', 0.75), pct('y', 'Down', 0.25), color('color', 'Colour', '#ffd9a0')],
    words: /\blens\s+flare\b|\bflare\b|\bsun\s+flare\b/ },
  { type: 'defocus', label: 'Defocus', group: 'light', stage: 'stylize', intensity: 0.6,
    desc: 'Soft out-of-focus lens blur',
    params: [],
    words: /\bdefocus\w*|\bout\s+of\s+focus\b|\blens\s+blur\b/ },
  { type: 'vignette', label: 'Vignette', group: 'light', stage: 'stylize', intensity: 0.55,
    desc: 'Darkened, softened edges',
    params: [pct('size', 'Size', 0.5), pct('softness', 'Softness', 0.6), color('color', 'Colour', '#000000')],
    words: /\bvignett\w*|\bdark(?:en(?:ed)?)?\s+(?:edges|corners)\b/ },

  // ── Energy ───────────────────────────────────────────────────────────────
  { type: 'phonk', label: 'Phonk', group: 'energy', stage: 'stylize', intensity: 0.85, speed: true, beat: true,
    desc: 'Phonk edit: hard mono, red glow, strobe, shake and zoom on the beat',
    params: [color('color', 'Glow colour', '#ff1f3d'), toggle('mono', 'Black & white', true), pct('strobe', 'Strobe', 0.6), pct('shake', 'Shake', 0.5), pct('zoom', 'Zoom pulse', 0.5)],
    words: /\bph(?:o|u)nk\w*/ },
  { type: 'strobe', label: 'Strobe', group: 'energy', stage: 'stylize', intensity: 0.7, speed: true, beat: true,
    desc: 'Rapid light flashes',
    params: [color('color', 'Colour', '#ffffff')],
    words: /\bstrob\w*/ },
  { type: 'zoomPulse', label: 'Zoom pulse', group: 'energy', stage: 'camera', intensity: 0.6, speed: true, beat: true,
    desc: 'Punches in and out — great on the beat',
    params: [],
    words: /\bzoom\s*(?:pulse|punch|bounce|beat)\w*|\bbeat\s+zoom\b|\bpulse\s+zoom\b/ },
  { type: 'shake', label: 'Handheld shake', group: 'energy', stage: 'camera', intensity: 0.5, speed: true, beat: true,
    desc: 'A natural camera shake (no empty edges)',
    params: [toggle('rotate', 'Rotate a little', true)],
    words: /\b(?:camera\s+|handheld\s+)?shak(?:e|y|ing)\b|\bearthquake\b|\bhandheld\b/ },
  { type: 'flash', label: 'Flash', group: 'energy', stage: 'stylize', intensity: 0.8, speed: true, beat: true,
    desc: 'A bright flash every beat or second',
    params: [color('color', 'Colour', '#ffffff')],
    words: /\bflash(?:es|ing)?\b|\bcamera\s+flash\b/ },
  { type: 'flicker', label: 'Light flicker', group: 'energy', stage: 'stylize', intensity: 0.5, speed: true,
    desc: 'Uneven flickering light',
    params: [color('color', 'Colour', '#dcecff')],
    words: /\bflicker\w*/ },

  // ── Motion ───────────────────────────────────────────────────────────────
  { type: 'float', label: 'Float', group: 'motion', stage: 'item', intensity: 0.5, speed: true,
    desc: 'The item floats gently up and down',
    params: [],
    words: /\bfloat(?:ing|s)?\b|\bhover(?:ing)?\b|\bbob(?:bing)?\b/ },
  { type: 'wiggle', label: 'Wiggle', group: 'motion', stage: 'item', intensity: 0.5, speed: true,
    desc: 'The item wiggles playfully',
    params: [],
    words: /\bwiggl\w*|\bjiggl\w*/ },
  { type: 'drift', label: 'Drift', group: 'motion', stage: 'item', intensity: 0.5, speed: true,
    desc: 'The item drifts in a slow loop',
    params: [],
    words: /\bdrift\w*|\bwander\w*/ },
  { type: 'kenBurnsIn', label: 'Ken Burns in', group: 'motion', stage: 'camera', intensity: 0.5,
    desc: 'Slow push in over the clip',
    params: [select('position', 'Towards', 'center', CORNERS)],
    words: /\bken\s*burns(?:\s+in)?\b|\bslow\s+(?:push|zoom)\s+in\b|\bpush\s+in\b/ },
  { type: 'kenBurnsOut', label: 'Ken Burns out', group: 'motion', stage: 'camera', intensity: 0.5,
    desc: 'Slow pull out over the clip',
    params: [select('position', 'From', 'center', CORNERS)],
    words: /\bken\s*burns\s+out\b|\bslow\s+(?:pull|zoom)\s+out\b|\bpull\s+out\b/ },

  // ── Weather ──────────────────────────────────────────────────────────────
  { type: 'rain', label: 'Rain', group: 'weather', stage: 'stylize', intensity: 0.7, speed: true,
    desc: 'Falling rain streaks',
    params: [pct('amount', 'Amount', 0.5), { key: 'wind', label: 'Wind', kind: 'slider', default: 0.15, min: -1, max: 1, step: 0.05 }, color('color', 'Colour', '#cfe3ff')],
    words: /\brain(?:y|ing|drops?)?\b|\bstorm\w*/ },
  { type: 'snow', label: 'Snow', group: 'weather', stage: 'stylize', intensity: 0.8, speed: true,
    desc: 'Drifting snowflakes',
    params: [pct('amount', 'Amount', 0.5), pct('size', 'Flake size', 0.5)],
    words: /\bsnow(?:y|ing|flakes?)?\b|\bwinter\b/ },

  // ── Colour look ──────────────────────────────────────────────────────────
  { type: 'look', label: 'Colour look', group: 'look', stage: 'look', intensity: 0.8,
    desc: 'A colour grade with a strength slider',
    params: [select('look', 'Look', 'cinematic', LOOKS)],
    words: /\b(?:colou?r\s+(?:grade|grading|look)|lut|filter|grade)\b/ },
]

const BY_TYPE = new Map(FX_DEFS.map(d => [d.type, d]))

export function fxDef(type: FxType): FxDef {
  return BY_TYPE.get(type) ?? BY_TYPE.get('glow')!
}

export function isFxType(type: unknown): type is FxType {
  return typeof type === 'string' && BY_TYPE.has(type as FxType)
}

/** A look name from plain words ("warm", "teal and orange", "black and white"), or null. */
export function lookFromWords(text: string): string | null {
  const t = text.toLowerCase()
  if (/\bteal\s*(?:and|&|\+)?\s*orange\b/.test(t)) return 'tealOrange'
  if (/\bbleach(?:ed)?\s*bypass\b/.test(t)) return 'bleachBypass'
  if (/\bfaded\b/.test(t)) return 'fadedFilm'
  if (/\bnoir\b/.test(t)) return 'noir'
  if (/\b(?:black\s+and\s+white|b\s*&\s*w|monochrome|grayscale|greyscale)\b/.test(t)) return 'monochrome'
  if (/\bcyberpunk\b|\bneon\s+(?:look|grade|colou?rs)\b/.test(t)) return 'cyberpunk'
  if (/\bsunset\b|\bgolden\s+hour\b/.test(t)) return 'sunset'
  if (/\bvivid\b|\bpunchy\b|\bsaturated\b/.test(t)) return 'vivid'
  if (/\bvintage\b/.test(t)) return 'vintage'
  if (/\bwarm(?:er)?\b/.test(t)) return 'warm'
  if (/\bcool(?:er)?\b|\bcold\b/.test(t)) return 'cool'
  if (/\bcinematic\b|\bmovie\s+look\b|\bfilm\s+grade\b/.test(t)) return 'cinematic'
  return null
}

/** The effect plain words name, checked most specific first (for the AI). */
export function fxFromWords(text: string): FxType | null {
  const order: FxType[] = [
    'neonOutline', 'aura', 'echo', 'spotlight', 'phonk', 'oldFilm', 'film8mm', 'vhs', 'halftone', 'paper', 'dust', 'grain',
    'rgbSplit', 'signalLoss', 'crt', 'glitch', 'kaleidoscope', 'heatHaze', 'swirl', 'bulge', 'ripple', 'wave',
    'halation', 'lightLeak', 'lightSweep', 'godRays', 'lensFlare', 'vignette', 'defocus', 'glow',
    'zoomPulse', 'kenBurnsOut', 'kenBurnsIn', 'strobe', 'flicker', 'flash', 'shake', 'float', 'wiggle', 'drift',
    'rain', 'snow', 'look',
  ]
  for (const type of order) if (BY_TYPE.get(type)!.words.test(text)) return type
  return null
}
