import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { preloadFonts } from './utils/fontLoader'

// Provide a no-op stub when running outside Electron (e.g. plain browser dev tab)
if (typeof window !== 'undefined' && !window.api) {
  const noop = async () => {}
  const noopNull = async () => null
  ;(window as unknown as { api: unknown }).api = {
    win:     { minimize: noop, maximize: noop, close: noop },
    app:     { onBeforeClose: () => () => {}, closeReady: () => {} },
    projects: {
      list:   async () => [],
      create: async (name: string) => ({ id: `mem_${Date.now()}`, name, folder: '', createdAt: Date.now(), updatedAt: Date.now() }),
      save:   noop,
      load:   async () => { throw new Error('not available in browser') },
      delete: noop,
      rename: noop
    },
    assets:  { upload: async () => ({ id: '', filename: '', path: '' }), list: async () => [] },
    dialog:  { openFile: noopNull, saveVideo: noopNull },
    fs:      { writeFile: async () => { console.warn('fs.writeFile not available in browser mode') } },
    shell:   { openPath: async () => '' }
  }
}

// Start font preloading in the background immediately.
// React mounts in parallel; fonts will be ready before the user can type.
preloadFonts().catch(() => {})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
