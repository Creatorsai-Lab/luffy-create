// Static asset import declarations live in ./assets.d.ts (must stay a script
// file so the wildcard module declarations remain global ambient).

export interface ProjectRecord {
  id: string
  name: string
  folder: string
  createdAt: number
  updatedAt: number
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
  matplotlib: boolean
  manim: boolean
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
        upload: (projectId: string, src: string) => Promise<UploadedAsset>
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
