import { toFileUrl } from '../utils/pathUtils'

export function readPythonSandboxImageSize(path: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 640, height: img.naturalHeight || 360 })
    img.onerror = () => resolve({ width: 640, height: 360 })
    img.src = toFileUrl(path)
  })
}

export function readPythonSandboxVideoMeta(path: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => resolve({
      width: video.videoWidth || 640,
      height: video.videoHeight || 360,
      duration: Number.isFinite(video.duration) ? video.duration : 10,
    })
    video.onerror = () => resolve({ width: 640, height: 360, duration: 10 })
    video.src = toFileUrl(path)
  })
}
