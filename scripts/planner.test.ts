// The Planner's storage: bad data is cleaned up, saves land in order, and a
// damaged file falls back to the last good version. Plus sorting and search.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createPlannerStore, normalizePlanner } from '../electron/main/planner'
import { searchPlans, sortPlans } from '../src/planner/plannerStore'
import { timeAgo } from '../src/components/modals/PlannerModal'

const plan = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `T${id}`, body: `B${id}`, createdAt: 1, updatedAt: 1, ...extra })
const writeAtomic = async (path: string, data: string) => { await writeFile(`${path}.tmp`, data); await writeFile(path, data) }

async function main() {
  // Clean-up: duplicates, junk and oversized fields.
  const clean = normalizePlanner({ plans: [plan('a'), plan('a'), null, 42, { id: '' }, plan('b', { title: 'x'.repeat(500), color: 'red', pinned: 'yes' })] })
  assert.deepEqual(clean.plans.map(p => p.id), ['a', 'b'])
  assert.equal(clean.plans[1].title.length, 200)
  assert.equal(clean.plans[1].color, undefined, 'only hex colours')
  assert.equal(clean.plans[1].pinned, undefined)
  assert.deepEqual(normalizePlanner('nonsense'), { version: 1, plans: [] })

  const dir = await mkdtemp(join(tmpdir(), 'planner-'))
  try {
    const store = createPlannerStore(join(dir, 'planner'), writeAtomic)
    assert.deepEqual(await store.load(), { version: 1, plans: [] }, 'nothing saved yet')

    // Saves run in order: the last one wins.
    await Promise.all([store.save({ plans: [plan('1')] }), store.save({ plans: [plan('1'), plan('2')] }), store.save({ plans: [plan('3')] })])
    assert.deepEqual((await store.load()).plans.map(p => p.id), ['3'])

    // The previous good file is the backup; a damaged main file falls back to it.
    await store.save({ plans: [plan('4')] })
    const backup = JSON.parse(await readFile(join(dir, 'planner', 'planner.bak.json'), 'utf-8'))
    assert.deepEqual(backup.plans.map((p: { id: string }) => p.id), ['3'])
    await writeFile(join(dir, 'planner', 'planner.json'), '{ broken')
    assert.deepEqual((await store.load()).plans.map(p => p.id), ['3'], 'falls back to the backup')
    // Saving again does not copy the damaged file over the good backup.
    await store.save({ plans: [plan('5')] })
    const stillGood = JSON.parse(await readFile(join(dir, 'planner', 'planner.bak.json'), 'utf-8'))
    assert.deepEqual(stillGood.plans.map((p: { id: string }) => p.id), ['3'])
    assert.deepEqual((await store.load()).plans.map(p => p.id), ['5'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  // Cards: pinned first, then the most recently edited; search needs every word.
  const list = [plan('old', { updatedAt: 1 }), plan('new', { updatedAt: 3 }), plan('pin', { updatedAt: 2, pinned: true })]
  assert.deepEqual(sortPlans(list as never).map(p => p.id), ['pin', 'new', 'old'])
  const notes = [plan('x', { title: 'Transformer video', body: 'attention heads, then the decoder' }), plan('y', { title: 'Vlog', body: 'Goa trip' })]
  assert.deepEqual(searchPlans(notes as never, 'attention video').map(p => p.id), ['x'])
  assert.deepEqual(searchPlans(notes as never, '').length, 2)
  assert.equal(timeAgo(1000, 1000 + 10_000), 'just now')
  assert.equal(timeAgo(0, 3 * 3600_000), '3 h ago')

  console.log('planner tests passed')
}

main().catch(error => { console.error(error); process.exit(1) })
