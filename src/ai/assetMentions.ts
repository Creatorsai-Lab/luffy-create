import type { AiProjectContext } from './types'

export type AssetMention = {
  start: number
  end: number
  query: string
} | null

export function getActiveAssetMention(input: string, caret = input.length): AssetMention {
  const safeCaret = Math.max(0, Math.min(input.length, caret))
  const beforeCaret = input.slice(0, safeCaret)
  const match = beforeCaret.match(/(?:^|\s)@([\w._()-]*)$/)
  if (!match || match.index == null) return null
  const atOffset = match[0].lastIndexOf('@')
  const start = match.index + atOffset
  return {
    start,
    end: safeCaret,
    query: match[1] ?? '',
  }
}

export function filterMentionAssets(
  assets: AiProjectContext['assets'],
  mention: AssetMention,
  limit = 8
) {
  if (!mention) return []
  const query = mention.query.toLowerCase()
  return assets
    .filter(asset => {
      const name = asset.name.toLowerCase()
      const filename = asset.filename.toLowerCase()
      return !query || name.includes(query) || filename.includes(query)
    })
    .slice(0, limit)
}
