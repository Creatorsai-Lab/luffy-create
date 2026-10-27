// Word transcripts (jump cuts, transcript editing) are cached on disk per media
// file and settings, and only used while the file is unchanged.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTranscriptCache } from '../electron/main/transcriptCache'

const writeAtomic = (path: string, data: string) => writeFile(path, data)
const cues = [{ start: 0.2, end: 0.5, text: ' Hello' }, { start: 0.6, end: 0.9, text: ' world.' }]

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'transcripts-'))
  try {
    const media = join(dir, 'talk.mp4')
    await writeFile(media, 'fake video bytes')
    const cache = createTranscriptCache(join(dir, 'cache'), writeAtomic)
    assert.equal(await cache.load(media, 'words:auto'), null, 'nothing cached yet')

    await cache.save(media, 'words:auto', [...cues, { start: Number.NaN, end: 1, text: 'bad' } as never])
    assert.deepEqual(await cache.load(media, 'words:auto'), cues, 'cached, without broken cues')
    assert.equal(await cache.load(media, 'words:en'), null, 'other settings are separate')
    assert.equal(await cache.load(join(dir, 'other.mp4'), 'words:auto'), null, 'other files are separate')

    // The file changes: its old transcript is not used.
    await writeFile(media, 'a different, longer recording')
    assert.equal(await cache.load(media, 'words:auto'), null)

    // A missing media file: nothing is saved or loaded.
    await cache.save(join(dir, 'gone.mp4'), 'words:auto', cues)
    assert.equal(await cache.load(join(dir, 'gone.mp4'), 'words:auto'), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  console.log('transcript cache tests passed')
}

main().catch(error => { console.error(error); process.exit(1) })
