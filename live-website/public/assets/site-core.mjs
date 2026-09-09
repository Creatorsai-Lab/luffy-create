const ALLOWED_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.in', 'ymail.com',
  'outlook.com', 'hotmail.com', 'live.com',
  'proton.me', 'protonmail.com', 'pm.me',
])

const PLATFORMS = new Set(['windows', 'macos', 'linux'])

export function normalizeEmailDomain(email) {
  const value = String(email || '').trim().toLowerCase()
  const at = value.lastIndexOf('@')
  return at > 0 && at < value.length - 1 ? value.slice(at + 1) : ''
}

export function isAllowedEmail(email) {
  return ALLOWED_DOMAINS.has(normalizeEmailDomain(email))
}

export function selectReleaseAssets(release = {}) {
  const assets = Array.isArray(release.assets) ? release.assets : []
  const find = suffix => assets.find(asset =>
    String(asset.name || '').toLowerCase().endsWith(suffix))?.browser_download_url || ''
  return {
    version: String(release.tag_name || ''),
    windows: find('.exe'),
    macos: find('.dmg'),
    linux: find('.appimage'),
  }
}

export function authViewFromUrl(value) {
  const state = new URL(value).searchParams.get('auth')
  return ['verified', 'recovery', 'login'].includes(state) ? state : null
}

export function createAuthRedirectUrl(value, state, platform = '') {
  const requestedPlatform = PLATFORMS.has(platform) ? platform : ''
  const url = new URL(state === 'verified' && requestedPlatform ? '/download/' : '/', value)
  url.search = new URLSearchParams(requestedPlatform
    ? (state === 'verified' ? { platform: requestedPlatform } : { auth: state, platform: requestedPlatform })
    : { auth: state }).toString()
  url.hash = ''
  return url.toString()
}

export function createDownloadPageUrl(platform = '') {
  return `/download/${PLATFORMS.has(platform) ? `#${platform}` : ''}`
}

export function getRequestedPlatform(value) {
  const url = new URL(value)
  const platform = url.searchParams.get('platform') || url.hash.slice(1)
  return PLATFORMS.has(platform) ? platform : ''
}

export function createDownloadEvent(userId, platform, version) {
  if (!userId || !PLATFORMS.has(platform)) throw new Error('Invalid download event')
  return { user_id: userId, platform, version: String(version || 'latest') }
}

export function getDownloadUrl(assets, platform) {
  return assets?.[platform] || 'https://github.com/Creatorsai-Lab/luffy-create/releases/latest'
}

export function getSessionNav(session) {
  return session ? { label: 'Download', view: 'download' } : { label: 'Start', view: 'login' }
}
