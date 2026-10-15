import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'

export interface VerifiedDownload {
  url: string
  destination: string
  sha256: string
  bytes: number
  maxBytes: number
  /** Used in error messages, e.g. "Translation model". */
  label: string
  signal: AbortSignal
  fetch?: typeof fetch
  onProgress: (receivedBytes: number, totalBytes: number) => void
}

/**
 * Streams `url` to `destination`, then checks the byte count and sha256 against
 * the catalog values. Throws on any mismatch; the caller deletes the file.
 */
export async function downloadVerified(opts: VerifiedDownload) {
  const limit = `${opts.label} exceeds the ${Math.round(opts.maxBytes / 1024 / 1024)} MB limit`
  const response = await (opts.fetch ?? fetch)(opts.url, { signal: opts.signal })
  if (!response.ok || !response.body) throw new Error(`${opts.label} download failed (${response.status})`)
  const totalBytes = Number(response.headers.get('content-length') || opts.bytes)
  if (totalBytes > opts.maxBytes) throw new Error(limit)

  const file = await open(opts.destination, 'w')
  const reader = response.body.getReader()
  const hash = createHash('sha256')
  let receivedBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      if (receivedBytes > opts.maxBytes) throw new Error(limit)
      hash.update(value)
      await file.write(value)
      opts.onProgress(receivedBytes, totalBytes)
    }
  } finally {
    await file.close()
  }
  if (receivedBytes !== opts.bytes) throw new Error(`${opts.label} download size does not match the catalog`)
  if (hash.digest('hex') !== opts.sha256) throw new Error(`${opts.label} checksum verification failed`)
  return totalBytes
}
