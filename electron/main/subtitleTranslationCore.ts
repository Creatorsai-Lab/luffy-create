export interface TranslationInputCue {
  id: string
  text: string
}

export interface TranslationChunk {
  id: string
  cues: TranslationInputCue[]
  cueIds: string[]
  text: string
}

export interface ProtectedToken {
  token: string
  source: string
  target: string
}

export interface ProtectedChunk extends TranslationChunk {
  tokens: ProtectedToken[]
}

export type TranslationWarningCode =
  | 'empty-output'
  | 'unchanged-output'
  | 'length-outlier'
  | 'missing-protected-value'
  | 'unexpected-script'

interface GlossaryEntry {
  source: string
  target: string
}

interface ProtectedMatch {
  start: number
  end: number
  source: string
  target: string
  priority: number
}

const TECHNICAL_PATTERNS = [
  /https?:\/\/[^\s]+|www\.[^\s]+/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /`[^`\n]+`/g,
  /\$[^$\n]+\$|\\\([^\n]*?\\\)/g,
  /\b[A-Za-z][A-Za-z0-9_]*\s*=\s*[A-Za-z0-9_][A-Za-z0-9_^*/+\-.()]*/g,
  /\b\d+(?:[.,]\d+)*(?:\s?(?:%|°C|°F|kg|g|mg|km|m|cm|mm|Hz|kHz|MHz|GHz|V|W|J|Pa))?\b/g,
  /\b(?:[A-Z]{2,}|[A-Z](?:\.[A-Z])+\.?)\b/g,
]

function cleanText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function markerFor(id: string) {
  return `__LF_CUE_${encodeURIComponent(id)}__`
}

function serializeCues(cues: TranslationInputCue[]) {
  return cues.map(cue => `${markerFor(cue.id)} ${cue.text}`).join('\n')
}

export function buildTranslationChunks(cues: TranslationInputCue[], maxWords = 120): TranslationChunk[] {
  const chunks: TranslationChunk[] = []
  let current: TranslationInputCue[] = []
  let wordCount = 0

  const push = () => {
    if (!current.length) return
    const stored = current
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      cues: stored,
      cueIds: stored.map(cue => cue.id),
      text: serializeCues(stored),
    })
    current = []
    wordCount = 0
  }

  for (const cue of cues) {
    const text = cleanText(cue.text)
    if (!text) continue
    const words = text.split(' ').length
    if (current.length && wordCount + words > Math.max(1, maxWords)) push()
    current.push({ id: cue.id, text })
    wordCount += words
  }
  push()
  return chunks
}

function glossaryMatches(text: string, glossary: GlossaryEntry[]) {
  const matches: ProtectedMatch[] = []
  const entries = glossary
    .filter(entry => entry.source.trim())
    .sort((a, b) => b.source.length - a.source.length)
  entries.forEach((entry, priority) => {
    let start = 0
    while ((start = text.indexOf(entry.source, start)) >= 0) {
      matches.push({
        start,
        end: start + entry.source.length,
        source: entry.source,
        target: entry.target || entry.source,
        priority,
      })
      start += entry.source.length
    }
  })
  return matches
}

function technicalMatches(text: string) {
  const matches: ProtectedMatch[] = []
  TECHNICAL_PATTERNS.forEach((pattern, index) => {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const source = match[0]
      const start = match.index ?? 0
      matches.push({ start, end: start + source.length, source, target: source, priority: 100 + index })
    }
  })
  return matches
}

function protectText(text: string, glossary: GlossaryEntry[], tokenOffset: number) {
  const matches = [...glossaryMatches(text, glossary), ...technicalMatches(text)]
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || a.priority - b.priority)
  const selected: ProtectedMatch[] = []
  let cursor = -1
  for (const match of matches) {
    if (match.start < cursor) continue
    selected.push(match)
    cursor = match.end
  }

  const tokens: ProtectedToken[] = []
  let output = ''
  cursor = 0
  selected.forEach((match, index) => {
    const token = `__LF_KEEP_${String(tokenOffset + index + 1).padStart(4, '0')}__`
    output += text.slice(cursor, match.start) + token
    tokens.push({ token, source: match.source, target: match.target })
    cursor = match.end
  })
  return { text: output + text.slice(cursor), tokens }
}

export function protectTranslationChunk(chunk: TranslationChunk, glossary: GlossaryEntry[]): ProtectedChunk {
  const tokens: ProtectedToken[] = []
  const cues = chunk.cues.map(cue => {
    const protectedCue = protectText(cue.text, glossary, tokens.length)
    tokens.push(...protectedCue.tokens)
    return { ...cue, text: protectedCue.text }
  })
  return { ...chunk, cues, text: serializeCues(cues), tokens }
}

export function restoreTranslationChunk(text: string, tokens: ProtectedToken[]) {
  let restored = text
  for (const item of tokens) {
    const count = restored.split(item.token).length - 1
    if (count !== 1) throw new Error(`Protected value ${item.token} appeared ${count} times`)
    restored = restored.replace(item.token, item.target)
  }
  return restored
}

export function parseTranslatedChunk(text: string, expectedCueIds: string[]) {
  const expectedMarkers = expectedCueIds.map(markerFor)
  for (const marker of expectedMarkers) {
    if (text.split(marker).length - 1 !== 1) throw new Error(`Cue marker ${marker} is missing or duplicated`)
  }

  const foundMarkers = [...text.matchAll(/__LF_CUE_.*?__/g)].map(match => match[0])
  if (foundMarkers.length !== expectedMarkers.length) throw new Error('Translated cue marker count changed')
  if (foundMarkers.some((marker, index) => marker !== expectedMarkers[index])) {
    throw new Error('Translated cue markers are out of order')
  }

  const result = new Map<string, string>()
  expectedMarkers.forEach((marker, index) => {
    const start = (text.indexOf(marker) + marker.length)
    const end = index + 1 < expectedMarkers.length ? text.indexOf(expectedMarkers[index + 1], start) : text.length
    result.set(expectedCueIds[index], text.slice(start, end).trim())
  })
  return result
}

export function validateTranslation(
  source: string,
  translated: string,
  language: 'en' | 'hi',
  protectedValues: string[],
): TranslationWarningCode[] {
  const warnings: TranslationWarningCode[] = []
  const cleanSource = cleanText(source)
  const cleanTranslated = cleanText(translated)
  if (!cleanTranslated) return ['empty-output']
  if (cleanTranslated.localeCompare(cleanSource, undefined, { sensitivity: 'accent' }) === 0) {
    warnings.push('unchanged-output')
  }

  const ratio = cleanTranslated.length / Math.max(1, cleanSource.length)
  if (ratio < 0.2 || ratio > 5) warnings.push('length-outlier')
  if (protectedValues.some(value => value && !cleanTranslated.includes(value))) {
    warnings.push('missing-protected-value')
  }

  const letters = [...cleanTranslated].filter(character => /\p{L}/u.test(character))
  const expectedLetters = letters.filter(character => language === 'hi'
    ? /[\u0904-\u0939\u0958-\u0961]/u.test(character)
    : /[A-Za-z]/u.test(character))
  const minimumRatio = language === 'hi' ? 0.25 : 0.5
  if (!letters.length || expectedLetters.length / letters.length < minimumRatio) warnings.push('unexpected-script')
  return warnings
}
