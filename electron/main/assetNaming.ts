import { basename, extname } from 'path'

export type UploadAssetKind = 'image' | 'video' | 'audio' | 'other'

const PREFIX_BY_KIND: Record<UploadAssetKind, string> = {
  image: 'ai',
  video: 'av',
  audio: 'aa',
  other: 'asset',
}

export function makeAssetUploadName(sourcePath: string, kind: UploadAssetKind, hash = randomAssetHash()) {
  const ext = extname(sourcePath).replace(/^\./, '').toLowerCase() || 'bin'
  const stem = basename(sourcePath, extname(sourcePath))
  const slug = makeReadableSlug(stem)
  return `${PREFIX_BY_KIND[kind]}-${slug}-${hash}.${ext}`
}

export function inferUploadAssetKind(sourcePath: string): UploadAssetKind {
  const ext = extname(sourcePath).replace(/^\./, '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio'
  return 'other'
}

export function randomAssetHash() {
  return Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 4).padEnd(4, '0')
}

function makeReadableSlug(stem: string) {
  const words = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return 'upload'

  const chunks: string[] = []
  let usedLetters = 0
  for (const word of words) {
    if (usedLetters >= 10) break
    const remaining = 10 - usedLetters
    if (word.length <= remaining) {
      chunks.push(word)
      usedLetters += word.length
      continue
    }
    const partialLength = Math.min(remaining, 2)
    if (partialLength > 0) chunks.push(word.slice(0, partialLength))
    break
  }

  return chunks.join('-') || 'upload'
}
