/**
 * Prompt text helpers: clause splitting, quoted-text masking and readers for
 * numbers, times, percents and sizes. Everything works on lower-cased clause
 * text in which quoted strings are replaced by placeholders, so words inside
 * quotes ("add text 'delete scene 2'") never trigger an intent.
 */

export interface Clause {
  /** Lower-cased text with quoted strings replaced by ⟦n⟧. */
  text: string
  /** Quoted strings, original case, in order. */
  quotes: string[]
  /** The clause as typed (quotes restored), for messages. */
  raw: string
}

const QUOTE_RE = /"([^"]*)"|“([^”]*)”|‘([^’]*)’|(?<![\w])'([^']*)'(?![\w])/g
const PLACEHOLDER_RE = /⟦(\d+)⟧/g

/** Verbs that can start a new clause after "and", "then" or a comma. */
const CLAUSE_VERBS = [
  'add', 'insert', 'create', 'put', 'place', 'draw', 'delete', 'remove', 'erase', 'drop', 'clear',
  'duplicate', 'copy', 'clone', 'split', 'cut', 'trim', 'shorten', 'extend', 'lengthen', 'make',
  'set', 'change', 'turn', 'use', 'apply', 'move', 'swap', 'center', 'centre', 'align', 'resize',
  'scale', 'bring', 'send', 'mute', 'unmute', 'fade', 'animate', 'slide', 'zoom', 'spin', 'rotate',
  'rename', 'speed', 'slow', 'loop', 'color', 'colour', 'give', 'enlarge', 'shrink', 'increase',
  'decrease', 'lower', 'raise', 'position', 'replace', 'reduce',
  'connect', 'link', 'wire', 'group', 'ungroup', 'lock', 'unlock', 'flash', 'pulse', 'glow', 'blink', 'highlight', 'bounce', 'appear', 'reveal', 'typewrite',
]

const CONNECTOR_RE = new RegExp(
  `(?:\\s*,\\s*(?:and\\s+then|then|and|also)?|\\s+(?:and\\s+then|and\\s+also|then|and|also))\\s+(?=(?:${CLAUSE_VERBS.join('|')})\\b)`,
  'g'
)

export function splitClauses(prompt: string): Clause[] {
  const quotes: string[] = []
  const masked = prompt.replace(QUOTE_RE, (...m: string[]) => {
    quotes.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
    return `⟦${quotes.length - 1}⟧`
  })

  const clauses: Clause[] = []
  // Drop list markers ("1. ", "- ") first; then a "." ends a sentence only before
  // whitespace, so "1.5s" stays whole.
  const unlisted = masked.replace(/^\s*(?:\d+\s*[.)]|[-*•])\s+/gm, '')
  for (const sentence of unlisted.split(/\r?\n+|;|\.(?=\s|$)/)) {
    const line = sentence.trim().replace(/[!?]+$/, '').trim()
    if (!line) continue
    for (const part of line.toLowerCase().split(CONNECTOR_RE)) {
      const text = part.trim().replace(/^(?:and|then|also|please)\s+/, '').replace(/\bplease\b/g, '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      const local: string[] = []
      const renumbered = text.replace(PLACEHOLDER_RE, (_m, n: string) => {
        local.push(quotes[Number(n)])
        return `⟦${local.length - 1}⟧`
      })
      clauses.push({
        text: renumbered,
        quotes: local,
        raw: renumbered.replace(PLACEHOLDER_RE, (_m, n: string) => `"${local[Number(n)]}"`),
      })
    }
  }
  return clauses
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
}

export function ordinalValue(word: string): number | null {
  if (ORDINALS[word]) return ORDINALS[word]
  const match = word.match(/^(\d+)(?:st|nd|rd|th)$/)
  return match ? Number(match[1]) : null
}

/** "3", "three", "a" → number (used for counts like "add three scenes"). */
export function countValue(word: string): number | null {
  if (/^\d+$/.test(word)) return Number(word)
  return WORD_NUMBERS[word] ?? null
}

export interface TimeMatch {
  seconds: number
  index: number
  end: number
}

const TIME_RE = /\b(\d+):(\d{1,2}(?:\.\d+)?)\b|\b(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?)\b(?:\s*(?:and\s+)?(\d+(?:\.\d+)?)\s*(s|secs?|seconds?)\b)?/g

/** Every time span in the text: "3s", "1.5 seconds", "500ms", "0:12", "1m 30s", "2 minutes". */
export function readTimes(text: string): TimeMatch[] {
  const out: TimeMatch[] = []
  for (const match of text.matchAll(TIME_RE)) {
    const index = match.index ?? 0
    let seconds: number
    if (match[1] != null) {
      seconds = Number(match[1]) * 60 + Number(match[2])
    } else {
      const value = Number(match[3])
      const unit = match[4]
      seconds = unit.startsWith('ms') || unit.startsWith('milli') ? value / 1000
        : unit.startsWith('m') ? value * 60
        : value
      if (match[5]) seconds += Number(match[5])
    }
    out.push({ seconds, index, end: index + match[0].length })
  }
  return out
}

/** The time right after one of the given words, e.g. timeAfter(text, 'at') for "split at 3s". */
export function timeAfter(text: string, words: string[]): number | null {
  for (const time of readTimes(text)) {
    const before = text.slice(0, time.index).trimEnd()
    if (words.some(word => before.endsWith(` ${word}`) || before === word)) return time.seconds
  }
  return null
}

/** "50%", "50 percent" → 0.5 */
export function readPercent(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:%|percent\b)/)
  return match ? Number(match[1]) / 100 : null
}

/** "2x", "x2", "twice", "double", "half" → multiplier. Ignores sizes like "800x450". */
export function readFactor(text: string): number | null {
  const match = text.match(/(?<![\d.])(\d+(?:\.\d+)?)\s*x(?!\s*\d)\b|\bx\s*(\d+(?:\.\d+)?)\b|\b(twice|double|triple|half)\b/)
  if (!match) return null
  if (match[3]) return { twice: 2, double: 2, triple: 3, half: 0.5 }[match[3]]!
  return Number(match[1] ?? match[2])
}

/** "800x450", "800 by 450", "800 × 450 px" */
export function readSize(text: string): { width: number; height: number } | null {
  const match = text.match(/\b(\d{2,5})\s*(?:px)?\s*(?:x|×|by)\s*(\d{2,5})\s*(?:px)?\b/)
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null
}

/** The number after a label: numberAfter(text, 'font size') for "font size 72" / "font size to 72". */
export function numberAfter(text: string, label: string): number | null {
  const match = text.match(new RegExp(`\\b${label}\\s*(?:of|to|=|:|is|at)?\\s*(\\d+(?:\\.\\d+)?)`))
  return match ? Number(match[1]) : null
}
