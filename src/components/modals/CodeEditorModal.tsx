import { useState, Suspense, lazy } from 'react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import { X, Save } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { LANGUAGES } from '../../types/editor'
import type { CodeElement } from '../../types/editor'
import { makeCode } from '../../utils/defaults'

// Lazy-load Monaco to avoid blocking app boot
const MonacoEditor = lazy(() => import('@monaco-editor/react'))

export default function CodeEditorModal() {
  const { project, currentSceneId, codeModalElemId, getSelectedEls,
    addElement, updateElement, closeCodeModal } = useEditorStore()

  const scene = project?.scenes.find(s => s.id === currentSceneId)
  const existingEl = codeModalElemId
    ? (scene?.elements.find(e => e.id === codeModalElemId) as CodeElement | undefined)
    : undefined

  const [code, setCode] = useState(existingEl?.code ?? '// Enter your code\n')
  const [language, setLanguage] = useState(existingEl?.language ?? 'javascript')

  function handleSave() {
    if (existingEl) {
      updateElement(existingEl.id, { code, language })
    } else {
      const el = makeCode(200, 200)
      el.code = code
      el.language = language
      addElement(el)
    }
    closeCodeModal()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onKeyDown={e => e.stopPropagation()}
    >
      <div className="bg-editor-panel border border-editor-border rounded-3xl shadow-2xl flex flex-col overflow-hidden w-[75vw] h-[75vh] max-w-[960px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border">
          <span className="text-sm font-medium text-editor-text">
            {existingEl ? 'Edit Code Block' : 'New Code Block'}
          </span>
          <div className="flex items-center gap-3">
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1"
            >
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-editor-accent text-white rounded hover:bg-editor-accent-hover transition-colors"
            >
              <Save size={12} /> Save
            </button>
            <button
              onClick={closeCodeModal}
              className="text-[#f2f2f2] hover:text-editor-text transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-[#f2f2f2]">Loading editor…</div>}>
            <MonacoEditor
              height="100%"
              language={language}
              value={code}
              onChange={v => setCode(v ?? '')}
              theme="vs-dark"
              onMount={(editor: MonacoEditorNS.IStandaloneCodeEditor) => editor.focus()}
              options={{
                fontSize: 13,
                fontFamily: "Cascadia Code, Consolas, 'Courier New', monospace",
                minimap: { enabled: false },
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                renderLineHighlight: 'line',
                padding: { top: 12, bottom: 12 }
              }}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
