// Timeline thumbnails: the slot grid, the coarse-to-fine fill order, and the
// disk cache that only serves frames while the video file is unchanged.
import assert from 'node:assert/strict'
import { mkdtemp, rm, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createFilmstripCache } from '../electron/main/filmstripCache'
import { coarseToFine, frameGrid } from '../src/utils/filmstripCache'

const JPEG = 'data:image/jpeg;base64,/9j/AAAA'
const writeAtomic = (path: string, data: string) => writeFile(path, data)

async function main() {
  // A grid of at most ~240 slots, never finer than a quarter second.
  assert.equal(frameGrid(10), 0.25)
  assert.equal(frameGrid(120), 0.5)
  assert.equal(frameGrid(3600), 15)

  // Every slot exactly once, ends first.
  for (const n of [1, 2, 3, 7, 12, 48]) {
    const order = coarseToFine(n)
    assert.deepEqual(order.slice().sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i), `n=${n}`)
  }
  assert.deepEqual(coarseToFine(5).slice(0, 3), [0, 4, 2])

  const dir = await mkdtemp(join(tmpdir(), 'filmstrip-'))
  try {
    const video = join(dir, 'clip.mp4')
    await writeFile(video, 'fake video bytes')
    const cache = createFilmstripCache(join(dir, 'cache'), writeAtomic)
    assert.deepEqual(await cache.load(video, 0.5), { grid: 0.5, frames: {} }, 'nothing cached yet')

    await cache.save(video, { grid: 0.5, frames: { 0: JPEG, 12: JPEG, x: JPEG, 3: 'data:image/png;base64,AA' } as never })
    assert.deepEqual(await cache.load(video, 0.5), { grid: 0.5, frames: { 0: JPEG, 12: JPEG } }, 'only JPEG frames on numbered slots')
    assert.deepEqual((await cache.load(video, 0.25)).frames, {}, 'another grid does not reuse them')

    // The video changes: its old frames are not used.
    await writeFile(video, 'a different, longer recording')
    assert.deepEqual((await cache.load(video, 0.5)).frames, {})
    await cache.save(video, { grid: 0.5, frames: { 1: JPEG } })
    const later = new Date(Date.now() + 60_000)
    await utimes(video, later, later)
    assert.deepEqual((await cache.load(video, 0.5)).frames, {}, 'touched since: not trusted')

    // A missing video is simply not cached.
    await cache.save(join(dir, 'gone.mp4'), { grid: 0.5, frames: { 0: JPEG } })
    assert.deepEqual((await cache.load(join(dir, 'gone.mp4'), 0.5)).frames, {})
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  console.log('filmstrip tests passed')
}

main().catch(error => { console.error(error); process.exit(1) })
