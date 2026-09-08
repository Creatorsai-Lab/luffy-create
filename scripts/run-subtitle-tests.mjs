import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const files = (await readdir('scripts'))
  .filter(name => /^subtitle.*\.test\.ts$/i.test(name))
  .sort()

for (const file of files) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', `scripts/${file}`],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) process.exit(result.status ?? 1)
}
