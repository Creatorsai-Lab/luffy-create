import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  SubtitleTranslateRequest,
  SubtitleTranslateResult,
  SubtitleTranslationDirection,
  SubtitleTranslationPackStatus,
  SubtitleTranslationProgress,
} from '../../src/types/global'

const api = {
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximize: () => ipcRenderer.invoke('win:maximize'),
    close:    () => ipcRenderer.invoke('win:close')
  },
  projects: {
    list:   ()                         => ipcRenderer.invoke('projects:list'),
    create: (name: string)             => ipcRenderer.invoke('projects:create', name),
    save:   (id: string, data: string) => ipcRenderer.invoke('projects:save', id, data),
    load:   (id: string)               => ipcRenderer.invoke('projects:load', id),
    delete: (id: string)               => ipcRenderer.invoke('projects:delete', id),
    rename: (id: string, name: string) => ipcRenderer.invoke('projects:rename', id, name)
  },
  assets: {
    upload: (projectId: string, src: string, kind?: 'image' | 'video' | 'audio') => ipcRenderer.invoke('assets:upload', projectId, src, kind),
    list:   (projectId: string)              => ipcRenderer.invoke('assets:list', projectId)
  },
  dialog: {
    openFile:  (filters: { name: string; extensions: string[] }[]) => ipcRenderer.invoke('dialog:open-file', filters),
    saveVideo: (defaultName: string)                                => ipcRenderer.invoke('dialog:save-video', defaultName),
    saveImage: (defaultName: string)                                => ipcRenderer.invoke('dialog:save-image', defaultName)
  },
  fs: {
    writeFile: (path: string, data: Uint8Array) => ipcRenderer.invoke('fs:write-file', path, data),
    // Electron 32 removed File.path — resolve a dropped File's absolute path here.
    getPathForFile: (file: File) => webUtils.getPathForFile(file)
  },
  shell: {
    openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path)
  },
  ffmpeg: {
    getPaths: () => ipcRenderer.invoke('ffmpeg:get-paths') as Promise<{ coreJs: string; coreWasm: string }>
  },
  python: {
    check: () => ipcRenderer.invoke('python:check'),
    setup: () => ipcRenderer.invoke('python:setup'),
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
    }) => ipcRenderer.invoke('python:run', payload),
    cancel: (jobId: string) => ipcRenderer.invoke('python:cancel', jobId),
    listOutputs: (outputDir: string) => ipcRenderer.invoke('python:list-outputs', outputDir)
  },
  subtitle: {
    transcribeAudio: (payload: { sourcePath: string; language?: string }) => ipcRenderer.invoke('subtitle:transcribe-audio', payload),
    translationStatus: (direction: SubtitleTranslationDirection) =>
      ipcRenderer.invoke('subtitle:translation-status', direction) as Promise<SubtitleTranslationPackStatus>,
    installTranslation: (direction: SubtitleTranslationDirection) =>
      ipcRenderer.invoke('subtitle:translation-install', direction) as Promise<SubtitleTranslationPackStatus>,
    removeTranslation: (direction: SubtitleTranslationDirection) =>
      ipcRenderer.invoke('subtitle:translation-remove', direction) as Promise<void>,
    translate: (request: SubtitleTranslateRequest) =>
      ipcRenderer.invoke('subtitle:translate', request) as Promise<SubtitleTranslateResult>,
    cancelTranslation: (jobId: string) =>
      ipcRenderer.invoke('subtitle:translation-cancel', jobId) as Promise<boolean>,
    onTranslationProgress: (listener: (progress: SubtitleTranslationProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: SubtitleTranslationProgress) => listener(progress)
      ipcRenderer.on('subtitle:translation-progress', handler)
      return () => ipcRenderer.removeListener('subtitle:translation-progress', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (e) { console.error(e) }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
