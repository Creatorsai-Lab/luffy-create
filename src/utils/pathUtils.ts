export function toFileUrl(path: string): string {
  if (!path) return ''
  if (
    path.startsWith('localasset://') ||
    path.startsWith('file://') ||
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) return path

  // Windows: C:\path or C:/path
  if (path.match(/^[A-Za-z]:[\\\/]/)) {
    return `localasset:///${path.replace(/\\/g, '/')}`
  }

  // Unix absolute
  if (path.startsWith('/')) return `localasset:///${path.slice(1)}`

  return `localasset:///${path}`
}

