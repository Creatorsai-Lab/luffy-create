import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * MediaPipe's vision WASM (face detection for auto-reframe), served at
 * /mediapipe/ in dev and copied into the renderer build — straight from
 * node_modules, so the large binaries stay out of git. Only the SIMD build
 * ships: Electron's Chromium always supports WASM SIMD.
 */
function mediapipeWasm(): Plugin {
  const dir = resolve('node_modules/@mediapipe/tasks-vision/wasm')
  const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']
  return {
    name: 'mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/^\/mediapipe\/([\w.]+)$/)?.[1]
        if (!name || !files.includes(name)) return next()
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(resolve(dir, name)))
      })
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({ type: 'asset', fileName: `mediapipe/${name}`, source: readFileSync(resolve(dir, name)) })
      }
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/main/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload/index.ts')
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: resolve('index.html')
      }
    },
    resolve: {
      alias: { '@': resolve('src') }
    },
    plugins: [react(), mediapipeWasm()],
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
    }
  }
})
