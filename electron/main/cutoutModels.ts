import { existsSync, statSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { downloadVerified } from './verifiedDownload'

/**
 * The background-removal models, downloaded once into userData when first
 * used (they are not in the installer). Two packs, so each downloads only
 * when its feature is used:
 * - cutout: Silueta (a pruned U²-Net, MIT via rembg) finds the subject.
 * - select: MobileSAM (Apache-2.0; ONNX export MIT) picks the clicked person or object.
 * Both run on the CPU so they work on low-end computers.
 */

export type CutoutPack = 'cutout' | 'select'

export interface CutoutModelFile {
  name: string
  url: string
  sha256: string
  bytes: number
}

export const CUTOUT_PACKS: Record<CutoutPack, CutoutModelFile[]> = {
  cutout: [{
    name: 'silueta.onnx',
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx',
    sha256: '75da6c8d2f8096ec743d071951be73b4a8bc7b3e51d9a6625d63644f90ffeedb',
    bytes: 44173029,
  }],
  select: [{
    name: 'mobilesam_encoder.onnx',
    url: 'https://huggingface.co/Acly/MobileSAM/resolve/0d3b403339b4674a82493d5e97964dd78089ddc8/mobile_sam_image_encoder.onnx',
    sha256: '580f5fb648ea1062c0aabc26217aed56921985f03f0cbbd852bba81d760cc749',
    bytes: 28157093,
  }, {
    name: 'mobilesam_decoder.onnx',
    url: 'https://huggingface.co/Acly/MobileSAM/resolve/0d3b403339b4674a82493d5e97964dd78089ddc8/sam_mask_decoder_multi.onnx',
    sha256: '8976b90a87ba50a6a72217a5ff994f7d25ce16f2229fcc1ed259e1294c622ffe',
    bytes: 16496559,
  }],
}

export interface CutoutPackStatus {
  installed: boolean
  downloading: boolean
  bytes: number
}

export interface CutoutProgress {
  pack: CutoutPack
  phase: 'download' | 'finished'
  receivedBytes: number
  totalBytes: number
}

export function createCutoutModels(deps: { root: string; fetch?: typeof fetch }) {
  const active = new Map<CutoutPack, AbortController>()
  const file = (name: string) => join(deps.root, name)
  const installed = (pack: CutoutPack) =>
    CUTOUT_PACKS[pack].every(f => existsSync(file(f.name)) && statSync(file(f.name)).size === f.bytes)

  function status(): Record<CutoutPack, CutoutPackStatus> {
    const out = {} as Record<CutoutPack, CutoutPackStatus>
    for (const pack of Object.keys(CUTOUT_PACKS) as CutoutPack[]) {
      out[pack] = { installed: installed(pack), downloading: active.has(pack), bytes: CUTOUT_PACKS[pack].reduce((s, f) => s + f.bytes, 0) }
    }
    return out
  }

  /** Downloads the pack's missing files (verified), then reports 'finished'. Resolves when installed. */
  async function install(pack: CutoutPack, onProgress: (p: CutoutProgress) => void) {
    if (installed(pack)) return
    if (active.has(pack)) throw new Error('This model is already downloading')
    const controller = new AbortController()
    active.set(pack, controller)
    const files = CUTOUT_PACKS[pack]
    const totalBytes = files.reduce((s, f) => s + f.bytes, 0)
    let done = 0
    try {
      await mkdir(deps.root, { recursive: true })
      for (const f of files) {
        if (existsSync(file(f.name)) && statSync(file(f.name)).size === f.bytes) { done += f.bytes; continue }
        const partial = file(`${f.name}.download`)
        try {
          await downloadVerified({
            url: f.url, destination: partial, sha256: f.sha256, bytes: f.bytes, maxBytes: f.bytes + 1024,
            label: 'Background-removal model', signal: controller.signal, fetch: deps.fetch,
            onProgress: received => onProgress({ pack, phase: 'download', receivedBytes: done + received, totalBytes }),
          })
          await rename(partial, file(f.name))
        } catch (error) {
          await rm(partial, { force: true })
          throw error
        }
        done += f.bytes
      }
    } finally {
      active.delete(pack)
      onProgress({ pack, phase: 'finished', receivedBytes: done, totalBytes })
    }
  }

  return {
    status,
    install,
    cancel: (pack: CutoutPack) => active.get(pack)?.abort(),
    path: (name: string) => file(name),
    installed,
  }
}
