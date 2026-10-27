/**
 * The Planner: notes and ideas that belong to the app, not to a project.
 * One JSON file in the app's data folder, written safely:
 *  - every write goes to a temp file first and then replaces the real one;
 *  - the previous good version is kept as planner.bak.json and used if the
 *    main file is ever unreadable;
 *  - writes run one at a time, in order.
 * No Electron imports, so it can be tested with a plain folder.
 */
import { copyFile, mkdir, readFile } from 'fs/promises'
import { join } from 'path'

export interface Plan {
  id: string
  title: string
  body: string
  /** Accent colour of the card (a hex value), optional. */
  color?: string
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

export interface PlannerData {
  version: 1
  plans: Plan[]
}

const MAX_PLANS = 5000
const MAX_TITLE = 200
const MAX_BODY = 200_000

/** Keeps only well-formed plans, trimmed to sane sizes. Accepts anything (it reads files and renderer input). */
export function normalizePlanner(value: unknown): PlannerData {
  const list = (value && typeof value === 'object' && Array.isArray((value as { plans?: unknown }).plans))
    ? (value as { plans: unknown[] }).plans
    : []
  const seen = new Set<string>()
  const plans: Plan[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Record<string, unknown>
    const id = typeof p.id === 'string' && p.id.trim() ? p.id.slice(0, 64) : null
    if (!id || seen.has(id)) continue
    seen.add(id)
    const now = Date.now()
    const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : now)
    plans.push({
      id,
      title: typeof p.title === 'string' ? p.title.slice(0, MAX_TITLE) : '',
      body: typeof p.body === 'string' ? p.body.slice(0, MAX_BODY) : '',
      ...(typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? { color: p.color } : {}),
      ...(p.pinned === true ? { pinned: true } : {}),
      createdAt: time(p.createdAt),
      updatedAt: time(p.updatedAt),
    })
    if (plans.length >= MAX_PLANS) break
  }
  return { version: 1, plans }
}

export function createPlannerStore(dir: string, writeFileAtomic: (path: string, data: string) => Promise<void>) {
  const file = join(dir, 'planner.json')
  const backup = join(dir, 'planner.bak.json')
  let queue: Promise<void> = Promise.resolve()

  async function read(path: string): Promise<PlannerData | null> {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf-8'))
      return parsed && Array.isArray(parsed.plans) ? normalizePlanner(parsed) : null
    } catch {
      return null // missing or unreadable
    }
  }

  return {
    /** The plans: from the file, else its backup, else none. */
    async load(): Promise<PlannerData> {
      await queue.catch(() => {})
      return (await read(file)) ?? (await read(backup)) ?? { version: 1, plans: [] }
    },

    /** Saves after any save already running; the current good file becomes the backup first. */
    save(data: unknown): Promise<void> {
      const clean = normalizePlanner(data)
      const run = queue.catch(() => {}).then(async () => {
        await mkdir(dir, { recursive: true })
        if (await read(file)) await copyFile(file, backup).catch(() => {})
        await writeFileAtomic(file, JSON.stringify(clean))
      })
      queue = run
      return run
    },
  }
}
