// Run before merging main into production:  npm run preflight
//
// 1. Git state: on main, nothing uncommitted, in sync with GitHub.
// 2. The same checks CI runs: type-check, tests, build — plus the downloadable
//    Python runtime being published (the release workflow requires it).
// 3. GitHub's own result: the Validate workflow passed for this exact commit.
//
// Exits non-zero if anything fails, so it can gate a merge script too.

import { spawnSync } from 'node:child_process'
import { checkCatalog } from './python-runtime.mjs'

const results = []

function run(cmd, args, { quiet = false } = {}) {
  const opts = { encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' }
  // npm is npm.cmd on Windows, which needs a shell; pass one command string so Node doesn't warn (DEP0190).
  const r = cmd === 'npm' && process.platform === 'win32'
    ? spawnSync(`npm ${args.join(' ')}`, { ...opts, shell: true })
    : spawnSync(cmd, args, opts)
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function step(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`)
}

// ── 1. Git state ─────────────────────────────────────────────────────────────
step('Git')
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { quiet: true }).out
check('On branch main', branch === 'main', branch === 'main' ? '' : `currently on "${branch}"`)

const dirty = run('git', ['status', '--porcelain'], { quiet: true }).out
check('No uncommitted changes', dirty === '', dirty ? `${dirty.split('\n').length} changed file(s) — commit or stash first` : '')

run('git', ['fetch', 'origin', 'main', '--quiet'], { quiet: true })
const head = run('git', ['rev-parse', 'HEAD'], { quiet: true }).out
const remote = run('git', ['rev-parse', 'origin/main'], { quiet: true }).out
check('main is pushed and up to date with GitHub', head === remote,
  head === remote ? '' : 'local main and origin/main differ — push or pull first')

// ── 2. Local copy of CI ──────────────────────────────────────────────────────
for (const [title, script] of [['Type-check', 'typecheck'], ['Tests', 'test'], ['Build', 'build']]) {
  step(title)
  check(title, run('npm', ['run', script]).ok)
}

step('Python runtime')
const runtimeProblems = await checkCatalog()
check('Python runtime is published for every platform', runtimeProblems.length === 0, runtimeProblems.join('; '))

// ── 3. CI on GitHub for this commit ──────────────────────────────────────────
step('GitHub CI')
const gh = run('gh', ['run', 'list', '--workflow', 'ci.yml', '--commit', head, '--limit', '1',
  '--json', 'status,conclusion,url'], { quiet: true })
if (!gh.ok) {
  check('Validate workflow on GitHub', false, 'could not query GitHub (is the gh CLI installed and logged in?)')
} else {
  const [ci] = JSON.parse(gh.out || '[]')
  if (!ci) check('Validate workflow on GitHub', false, 'no run found for this commit yet — push main and wait for it')
  else if (ci.status !== 'completed') check('Validate workflow on GitHub', false, `still ${ci.status} — wait and re-run (${ci.url})`)
  else check('Validate workflow on GitHub', ci.conclusion === 'success', `${ci.conclusion} (${ci.url})`)
}

// ── Summary ──────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok)
console.log(`\n${'═'.repeat(64)}`)
if (failed.length === 0) {
  console.log('✔ Preflight passed — safe to merge main into production.')
} else {
  console.log(`✘ Preflight failed (${failed.length}): ${failed.map(f => f.name).join(', ')}`)
  console.log('  Do not merge into production until these pass.')
  process.exitCode = 1
}
