import { writeFileSync } from 'node:fs'

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  const request = JSON.parse(input.trim())
  writeFileSync(process.env.PROBE_PID_FILE, String(process.pid))
  process.stdout.write(JSON.stringify({
    jobId: request.jobId,
    chunkId: request.chunks[0].id,
    text: request.chunks[0].text,
  }) + '\n')
  setInterval(() => {}, 10_000)
})
