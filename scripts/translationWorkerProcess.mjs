import { spawn } from 'node:child_process'

export function runTranslationProbe(command, args, input, env = process.env, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, windowsHide: true })
    let buffer = ''
    let stderr = ''
    let result
    let failure
    const timer = setTimeout(() => {
      failure = new Error('Translation verification timed out')
      child.kill()
    }, timeoutMs)

    child.stdout.on('data', chunk => {
      buffer += chunk.toString()
      const newline = buffer.indexOf('\n')
      if (newline < 0 || result || failure) return
      try {
        result = JSON.parse(buffer.slice(0, newline))
        if (result.error) failure = new Error(result.error)
      } catch (error) {
        failure = error
      }
      child.kill()
    })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', error => { failure = error })
    child.on('close', code => {
      clearTimeout(timer)
      if (failure) reject(failure)
      else if (result) resolve(result)
      else reject(new Error(stderr || `Runner exited with ${code}`))
    })
    child.stdin.end(input)
  })
}
