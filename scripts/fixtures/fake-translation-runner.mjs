import readline from 'node:readline'

const lines = readline.createInterface({ input: process.stdin })
for await (const line of lines) {
  const request = JSON.parse(line)
  for (const chunk of request.chunks) {
    process.stdout.write(JSON.stringify({
      jobId: request.jobId,
      chunkId: chunk.id,
      text: chunk.text.replace(/\bhello\b/gi, 'नमस्ते'),
    }) + '\n')
  }
}
