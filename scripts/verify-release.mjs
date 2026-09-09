import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export function verifyTagVersion(tag, version) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error('Release tag must use v followed by a semantic version.')
  }
  if (tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} does not match package.json version ${version}.`)
  }
  return true
}

async function main() {
  const tag = process.argv[2] || ''
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  verifyTagVersion(tag, pkg.version)
  console.log(`${tag} matches package.json`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
