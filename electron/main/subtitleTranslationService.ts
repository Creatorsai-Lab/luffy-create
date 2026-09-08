import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import {
  buildTranslationChunks,
  parseTranslatedChunk,
  protectTranslationChunk,
  restoreTranslationChunk,
  validateTranslation,
} from './subtitleTranslationCore'
import type { TranslationDirection } from './subtitleTranslationPack'

export interface SubtitleTranslateRequest {
  jobId: string
  sourceLanguage: 'en' | 'hi'
  targetLanguage: 'en' | 'hi'
  cues: Array<{ id: string; text: string }>
  glossary: Array<{ source: string; target: string }>
}

export interface SubtitleTranslateResult {
  jobId: string
  translated: Array<{ id: string; text: string; warnings: string[] }>
  skipped: string[]
  failed: Array<{ id: string; error: string }>
  cancelled: boolean
}

export interface SubtitleTranslationProgress {
  jobId: string
  completed: number
  total: number
}

interface WorkerCommand {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
}

interface TranslationServiceDependencies {
  packManager: { getInstalledPath(direction: TranslationDirection): Promise<string | null> }
  worker?: (packPath: string, direction: TranslationDirection) => Promise<WorkerCommand>
}

export function createSubtitleTranslationService(deps: TranslationServiceDependencies) {
  let active: { jobId: string; child: ChildProcessWithoutNullStreams; cancelled: boolean } | null = null

  async function translate(
    request: SubtitleTranslateRequest,
    onProgress: (progress: SubtitleTranslationProgress) => void,
  ): Promise<SubtitleTranslateResult> {
    if (active) throw new Error('A subtitle translation job is already running')
    if (request.sourceLanguage === request.targetLanguage) throw new Error('Source and target languages must differ')
    const direction: TranslationDirection = request.sourceLanguage === 'en' ? 'en-hi' : 'hi-en'
    if ((direction === 'en-hi' ? 'hi' : 'en') !== request.targetLanguage) throw new Error('Unsupported translation direction')
    const packPath = await deps.packManager.getInstalledPath(direction)
    if (!packPath) throw new Error('Translation model is not installed')

    const chunks = buildTranslationChunks(request.cues).map(chunk => protectTranslationChunk(chunk, request.glossary))
    const skipped = request.cues.filter(cue => !cue.text.trim()).map(cue => cue.id)
    const command = deps.worker
      ? await deps.worker(packPath, direction)
      : { command: 'python', args: [join(packPath, 'runner.py'), packPath] }

    return new Promise(resolve => {
      const child = spawn(command.command, command.args, {
        env: command.env ?? process.env,
        windowsHide: true,
        shell: false,
      })
      active = { jobId: request.jobId, child, cancelled: false }
      const pending = new Map(chunks.map(chunk => [chunk.id, chunk]))
      const translated: SubtitleTranslateResult['translated'] = []
      const failed: SubtitleTranslateResult['failed'] = []
      let stdout = ''
      let stderr = ''

      const failChunk = (chunkId: string, error: unknown) => {
        const chunk = pending.get(chunkId)
        if (!chunk) return
        const message = error instanceof Error ? error.message : String(error)
        failed.push(...chunk.cueIds.map(id => ({ id, error: message })))
        pending.delete(chunkId)
      }

      const accept = (payload: { chunkId?: string; text?: string; error?: string }) => {
        if (payload.error) {
          for (const chunkId of [...pending.keys()]) failChunk(chunkId, payload.error)
          child.kill()
          return
        }
        const chunk = payload.chunkId ? pending.get(payload.chunkId) : undefined
        if (!chunk || typeof payload.text !== 'string') return
        try {
          const restored = restoreTranslationChunk(payload.text, chunk.tokens)
          const parsed = parseTranslatedChunk(restored, chunk.cueIds)
          for (const cue of chunk.cues) {
            const text = parsed.get(cue.id) ?? ''
            translated.push({
              id: cue.id,
              text,
              warnings: validateTranslation(cue.text, text, request.targetLanguage, chunk.tokens.map(token => token.target)),
            })
          }
          pending.delete(chunk.id)
          onProgress({ jobId: request.jobId, completed: translated.length + failed.length, total: request.cues.length - skipped.length })
        } catch (error) {
          failChunk(chunk.id, error)
        }
      }

      child.stdout.on('data', data => {
        stdout += data.toString()
        const lines = stdout.split(/\r?\n/)
        stdout = lines.pop() ?? ''
        for (const line of lines.filter(Boolean)) {
          try { accept(JSON.parse(line)) } catch (error) {
            for (const chunkId of [...pending.keys()]) failChunk(chunkId, error)
            child.kill()
          }
        }
      })
      child.stderr.on('data', data => { stderr += data.toString() })
      child.on('error', error => {
        for (const chunkId of [...pending.keys()]) failChunk(chunkId, error)
      })
      child.on('close', () => {
        const cancelled = active?.jobId === request.jobId && active.cancelled
        if (!cancelled) {
          for (const chunkId of [...pending.keys()]) failChunk(chunkId, stderr || 'Translation worker stopped unexpectedly')
        }
        active = null
        const order = new Map(request.cues.map((cue, index) => [cue.id, index]))
        translated.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        resolve({ jobId: request.jobId, translated, skipped, failed, cancelled: Boolean(cancelled) })
      })
      child.stdin.end(JSON.stringify({
        jobId: request.jobId,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        chunks: chunks.map(chunk => ({ id: chunk.id, text: chunk.text })),
      }) + '\n')
    })
  }

  function cancel(jobId: string) {
    if (!active || active.jobId !== jobId) return false
    active.cancelled = true
    active.child.kill()
    return true
  }

  return { translate, cancel }
}
