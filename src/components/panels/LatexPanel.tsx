import { useState, useEffect } from 'react'
import { Sigma } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { LatexElement } from '../../types/editor'
import { PanelHeader, Row, Slider, ColorInput, AnimSection, ENTER_ANIMS, LOOP_ANIMS, EXIT_ANIMS, isLoopAnim } from './TextPanel'
import { makeLatex, makeAnimation } from '../../utils/defaults'
import { renderLatex } from '../../engine/latexRenderer'

const SAMPLE = 'E = mc^2'

export default function LatexPanel() {
  const { getSelectedEls, updateElement, addElement, addAnimation, project } = useEditorStore()
  const el = getSelectedEls().find(e => e.type === 'latex') as LatexElement | undefined

  const [src, setSrc] = useState(el?.latex ?? SAMPLE)
  const [color, setColor] = useState(el?.color ?? '#222222')
  const [fontSize, setFontSize] = useState(el?.fontSize ?? 48)
  const [previewSvg, setPreviewSvg] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  // Sync local state when a different latex element is selected
  useEffect(() => {
    if (el) { setSrc(el.latex); setColor(el.color); setFontSize(el.fontSize) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el?.id])

  // Live preview render
  useEffect(() => {
    let cancelled = false
    renderLatex(src, color, fontSize).then(r => {
      if (cancelled) return
      setPreviewSvg(r?.svg ?? null)
      setErr(!r)
    })
    return () => { cancelled = true }
  }, [src, color, fontSize])

  async function applyToElement(patch: Partial<LatexElement>) {
    if (!el) return
    const next = { latex: src, color, fontSize, ...patch }
    const r = await renderLatex(next.latex, next.color, next.fontSize)
    updateElement(el.id, r ? { ...patch, width: r.width, height: r.height } : patch)
  }

  async function addToScreen() {
    if (!project) return
    const r = await renderLatex(src, color, fontSize)
    if (!r) return
    const x = Math.round(project.width / 2 - r.width / 2)
    const y = Math.round(project.height / 2 - r.height / 2)
    const elNew = makeLatex(x, y, src, r.width, r.height)
    elNew.color = color
    elNew.fontSize = fontSize
    addElement(elNew)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<Sigma size={12} />} title="LaTeX" />

      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        <p className="text-[11px] text-[#c1c1c1]">
          Write a LaTeX expression (no surrounding <code>$$</code>). It renders as a
          transparent vector equation you can place on the canvas.
        </p>

        <textarea
          className="w-full bg-editor-elevated border border-editor-border rounded text-xs text-editor-text px-2 py-1.5 font-mono resize-none nodrag"
          rows={4}
          spellCheck={false}
          value={src}
          onChange={e => setSrc(e.target.value)}
          placeholder="e.g.  \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
        />

        {/* Preview (light box so any text color stays visible) */}
        <div className="rounded border border-editor-border bg-[#b6b6b8] p-3 min-h-[60px] flex items-center justify-center overflow-auto">
          {err || !previewSvg
            ? <span className="text-[11px] text-red-500">Invalid LaTeX — fix the expression</span>
            : <div dangerouslySetInnerHTML={{ __html: previewSvg }} />}
        </div>

        <Row label="Color">
          <ColorInput value={color} onChange={v => { setColor(v); applyToElement({ color: v }) }} />
        </Row>

        <Row label="Font Size">
          <Slider value={fontSize} min={12} max={200} step={1}
            onChange={v => { setFontSize(v); applyToElement({ fontSize: v }) }} display={`${fontSize}px`} />
        </Row>

        {el ? (
          <button
            onClick={() => applyToElement({ latex: src })}
            disabled={err}
            className="w-full text-xs py-2 bg-editor-accent text-white rounded disabled:opacity-50"
          >
            Update Equation
          </button>
        ) : (
          <button
            onClick={addToScreen}
            disabled={err || !project}
            className="w-full text-xs py-2 bg-editor-accent text-white rounded disabled:opacity-50"
          >
            Add to Screen
          </button>
        )}

      {/* Animations — only for a placed equation. Inside the scroll container so
          it never overlays the controls; the whole panel scrolls as one. */}
      {el && (
        <div className="border-t border-editor-border -mx-3 mt-1">
          <AnimSection
            label="On Enter" color="text-green-400"
            anims={el.animations.filter(a => a.type !== 'move' && !isLoopAnim(a) && a.timing === 'onEnter')}
            types={ENTER_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'fadeIn', timing: 'onEnter' })}
            elId={el.id} isLoop={false}
          />
          <AnimSection
            label="Loop" color="text-editor-accent"
            anims={el.animations.filter(a => a.type !== 'move' && isLoopAnim(a))}
            types={LOOP_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'pulse', timing: 'loop', duration: 1 })}
            elId={el.id} isLoop={true}
          />
          <AnimSection
            label="On Exit" color="text-red-400"
            anims={el.animations.filter(a => a.type !== 'move' && !isLoopAnim(a) && a.timing === 'onExit')}
            types={EXIT_ANIMS}
            onAdd={() => addAnimation(el.id, { ...makeAnimation(), type: 'fadeOut', timing: 'onExit' })}
            elId={el.id} isLoop={false}
          />
        </div>
      )}
      </div>
    </div>
  )
}
