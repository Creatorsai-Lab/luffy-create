import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
    upload: (projectId: string, src: string) => ipcRenderer.invoke('assets:upload', projectId, src),
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
    transcribeAudio: (payload: { sourcePath: string; language?: string }) => ipcRenderer.invoke('subtitle:transcribe-audio', payload)
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
