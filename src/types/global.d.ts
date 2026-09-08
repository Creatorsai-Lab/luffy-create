// Static asset import declarations live in ./assets.d.ts (must stay a script
// file so the wildcard module declarations remain global ambient).

export interface ProjectRecord {
  id: string
  name: string
  folder: string
  createdAt: number
  updatedAt: number
  lastOpenedAt?: number
}

export interface AssetRecord {
  filename: string
  path: string
}

export interface UploadedAsset {
  id: string
  filename: string
  path: string
}

export interface PythonStatus {
  available: boolean
  pythonPath: string | null
  version: string | null
  runtimeSource?: 'bundled' | 'user' | 'system' | null
  matplotlib: boolean
  manim: boolean
  bundledPath?: string
  bundledReady?: boolean
  sandboxPath?: string
  sandboxReady?: boolean
  basePythonAvailable?: boolean
  stdout?: string
  stderr?: string
}

export interface PythonOutputFile {
  name: string
  path: string
  ext: string
  size: number
  type: 'image' | 'video' | 'other'
}

export interface PythonRunResult {
  jobId: string
  outputDir: string
  success: boolean
  exitCode: number | null
  timedOut: boolean
  stdout: string
  stderr: string
  outputs: PythonOutputFile[]
}

export interface SubtitleTranscriptionCue {
  start: number
  end: number
  text: string
}

export interface SubtitleTranscriptionResult {
  source: 'whisper.cpp'
  text: string
  cues: SubtitleTranscriptionCue[]
}

export type SubtitleTranslationLanguage = 'en' | 'hi'
export type SubtitleTranslationDirection = 'en-hi' | 'hi-en'

export interface SubtitleTranslationGlossaryEntry {
  source: string
  target: string
}

export interface SubtitleTranslateRequest {
  jobId: string
  sourceLanguage: SubtitleTranslationLanguage
  targetLanguage: SubtitleTranslationLanguage
  cues: Array<{ id: string; text: string }>
  glossary: SubtitleTranslationGlossaryEntry[]
}

export interface SubtitleTranslateResult {
  jobId: string
  translated: Array<{ id: string; text: string; warnings: string[] }>
  skipped: string[]
  failed: Array<{ id: string; error: string }>
  cancelled: boolean
}

export interface SubtitleTranslationProgress {
  jobId?: string
  direction?: SubtitleTranslationDirection
  phase?: 'download' | 'install'
  receivedBytes?: number
  totalBytes: number
  completed?: number
}

export type SubtitleTranslationPackStatus =
  | { state: 'not-installed'; direction: SubtitleTranslationDirection }
  | { state: 'downloading'; direction: SubtitleTranslationDirection }
  | { state: 'installed'; direction: SubtitleTranslationDirection; version: string; path: string }

declare global {
  interface Window {
    api: {
      win: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close:    () => Promise<void>
      }
      projects: {
        list:   ()                         => Promise<ProjectRecord[]>
        create: (name: string)             => Promise<ProjectRecord>
        save:   (id: string, data: string) => Promise<void>
        load:   (id: string)               => Promise<unknown>
        delete: (id: string)               => Promise<void>
        rename: (id: string, name: string) => Promise<void>
      }
      assets: {
        upload: (projectId: string, src: string, kind?: 'image' | 'video' | 'audio') => Promise<UploadedAsset>
        list:   (projectId: string)              => Promise<AssetRecord[]>
      }
      dialog: {
        openFile:  (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
        saveVideo: (defaultName: string)                                => Promise<string | null>
        saveImage: (defaultName: string)                                => Promise<string | null>
      }
      fs: {
        writeFile: (path: string, data: Uint8Array) => Promise<void>
        getPathForFile: (file: File) => string
      }
      shell: {
        openPath: (path: string) => Promise<string>
      }
      ffmpeg: {
        getPaths: () => Promise<{ coreJs: string; coreWasm: string }>
      }
      python: {
        check: () => Promise<PythonStatus>
        setup: () => Promise<PythonStatus>
        run: (payload: {
          jobId?: string
          projectId: string
          code: string
          kind: 'script' | 'manim'
          sceneName?: string
          width?: number
          height?: number
          fps?: number
          timeoutMs?: number
        }) => Promise<PythonRunResult>
        cancel: (jobId: string) => Promise<boolean>
        listOutputs: (outputDir: string) => Promise<PythonOutputFile[]>
      }
      subtitle: {
        transcribeAudio: (payload: {
          sourcePath: string
          language?: string
        }) => Promise<SubtitleTranscriptionResult>
        translationStatus: (direction: SubtitleTranslationDirection) => Promise<SubtitleTranslationPackStatus>
        installTranslation: (direction: SubtitleTranslationDirection) => Promise<SubtitleTranslationPackStatus>
        removeTranslation: (direction: SubtitleTranslationDirection) => Promise<void>
        translate: (request: SubtitleTranslateRequest) => Promise<SubtitleTranslateResult>
        cancelTranslation: (jobId: string) => Promise<boolean>
        onTranslationProgress: (listener: (progress: SubtitleTranslationProgress) => void) => () => void
      }
      ai?: {
        plan: (payload: {
          prompt: string
          context: unknown
          systemPrompt: string
          schema: unknown
        }) => Promise<unknown>
      }
    }
  }
}
