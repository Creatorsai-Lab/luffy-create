import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { Stage, Layer, Shape, Transformer, Circle, Path, Label, Tag, Text, Line } from 'react-konva'
import type Konva from 'konva'
import { Clipboard, Copy, Trash2, ImageIcon, Play, Pause, Check, X, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, ArrowUpToLine, ArrowDownToLine, Group, Ungroup, BoxSelect, Lock, Unlock } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import HighlightOverlay from './HighlightOverlay'
import { elementsBox, expandToGroups, groupPerspectivePts, selectedWholeGroup, toGroupPerspective, warpedGroups } from '../../utils/groups'
import GroupPerspective from './GroupPerspective'
import LockedMark from './LockedMark'
import { toast } from '../ui/Toast'
import { useCanvasStore } from '../../store/canvasStore'
import { getAnimatedProps } from '../../engine/animator'
import { buildTransitionTimeline, getTransitionFrameState, getUpcomingTransitionEntry } from '../../utils/transitionTiming'
import { drawBackground } from '../../engine/backgroundRenderer'
import { registerOutgoingStage, registerStage } from '../../engine/stageRegistry'
import { videoRegistry } from '../../engine/videoRegistry'
import { prewarmUpcomingVideos } from '../../engine/videoPreloader'
import { getMorphFrame } from '../../engine/morph'
import { makeShape, makeArrow, makeChart, makeHandDrawLayer } from '../../utils/defaults'
import type { ActivePanel, Background, ImageBg, ImageElement, VideoElement, ShapeType, EditorElement, HandDrawElement, HandDrawStroke } from '../../types/editor'
import { toFileUrl } from '../../utils/pathUtils'
import { getVideoClipState } from '../../utils/videoClip'
import { getCanvasCursor, shouldShowSelectionHandles } from '../../utils/canvasInteraction'
import CanvasElement from './CanvasElement'
import PerspectiveHandles, { QuadHandles } from './PerspectiveHandles'
import CanvasGrid from './CanvasGrid'
import CanvasGuides from './CanvasGuides'
import CanvasSafeArea from './CanvasSafeArea'
import CanvasToolbar from './CanvasToolbar'
import ContextMenu from '../ui/ContextMenu'
import SubtitleOverlay from '../../subtitle/SubtitleOverlay'
import { sceneStartTime } from '../../utils/sceneTiming'
import { useShallow } from 'zustand/react/shallow'
import SceneStage from './SceneStage'
import { blendVolumes, captureLayers, drawBlend, type BlendState } from './transitionComposite'

const IMAGE_BG_ADJUSTMENT_KEYS: (keyof ImageBg)[] = [
  'opacity',
  'brightness',
  'contrast',
  'saturation',
  'hueRotate',
  'blur',
  'glass',
  'exposure',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'temperature',
  'tint',
  'vibrance',
]

function imageElementToBackground(imgEl: ImageElement, fit: ImageBg['fit']): ImageBg {
  const bg: ImageBg = { type: 'image', src: imgEl.src, fit }
  for (const key of IMAGE_BG_ADJUSTMENT_KEYS) {
    const value = imgEl[key as keyof ImageElement]
    if (value !== undefined) Object.assign(bg, { [key]: value })
  }
  return bg
}

export default function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef     = useRef<Konva.Stage | null>(null)
  const trRef        = useRef<Konva.Transformer | null>(null)
  const animFrameRef = useRef<number>(0)
  const bgShapeRef   = useRef<Konva.Shape | null>(null)
  // Transitions: the main stage's picture layers, the outgoing scene's hidden stage, and the blend layer.
  const bgLayerRef = useRef<Konva.Layer | null>(null)
  const elementsLayerRef = useRef<Konva.Layer | null>(null)
  const blendLayerRef = useRef<Konva.Layer | null>(null)
  const outgoingStageRef = useRef<Konva.Stage | null>(null)
  const blendScratchRef = useRef<{ main: HTMLCanvasElement; other: HTMLCanvasElement } | null>(null)

  // Computed display size (project coords → screen pixels)
  const [scale,    setScale]    = useState(1)
  const [canvasW,  setCanvasW]  = useState(800)
  const [canvasH,  setCanvasH]  = useState(450)
  const [offsetX,  setOffsetX]  = useState(0)
  const [offsetY,  setOffsetY]  = useState(0)

  const [drawingArrow, setDrawingArrow] = useState<{x1:number;y1:number;x2:number;y2:number}|null>(null)
  const [drawingStroke, setDrawingStroke] = useState<HandDrawStroke | null>(null)
  const drawingStrokeRef = useRef<HandDrawStroke | null>(null)
  const suppressStageClickRef = useRef(false)
  const drawingLayerIdRef = useRef<string | null>(null)
  const drawingBaseStrokesRef = useRef<HandDrawStroke[]>([])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null)
  /** The item pressed last — what Ctrl+arrow moves inside a selected group. */
  const lastPressedIdRef = useRef<string | null>(null)
  const [localPlayingIds, setLocalPlayingIds] = useState<Set<string>>(new Set())
  const [cropState, setCropState] = useState<{ elId: string; pendingCrop: { x: number; y: number; w: number; h: number } } | null>(null)
  const [cropDrag, setCropDrag] = useState<{ handle: string; startX: number; startY: number; startCrop: { x: number; y: number; w: number; h: number } } | null>(null)
  const [cursorCoord, setCursorCoord] = useState<{ x: number; y: number } | null>(null)
  const clipboardRef  = useRef<EditorElement[]>([])
  const clipboardSourceSceneRef = useRef<string | null>(null)

  const {
    project, currentSceneId, selectedIds,
    playhead, isPlaying, exportOpen, activeTool, activePanel, pendingChartType, handDrawSettings,
    cropElementId, setCropElement,
    addElement, selectElement, deselectAll,
    removeElement, updateElement, setBackground, setActiveTool, setActivePanel, openCodeModal,
    undo, redo,
    bringForward, sendBackward, bringToFront, sendToBack,
  } = useEditorStore(useShallow(s => ({ project: s.project, currentSceneId: s.currentSceneId, selectedIds: s.selectedIds, playhead: s.playhead, isPlaying: s.isPlaying, exportOpen: s.exportOpen, activeTool: s.activeTool, activePanel: s.activePanel, pendingChartType: s.pendingChartType, handDrawSettings: s.handDrawSettings, cropElementId: s.cropElementId, setCropElement: s.setCropElement, addElement: s.addElement, selectElement: s.selectElement, deselectAll: s.deselectAll, removeElement: s.removeElement, updateElement: s.updateElement, setBackground: s.setBackground, setActiveTool: s.setActiveTool, setActivePanel: s.setActivePanel, openCodeModal: s.openCodeModal, undo: s.undo, redo: s.redo, bringForward: s.bringForward, sendBackward: s.sendBackward, bringToFront: s.bringToFront, sendToBack: s.sendToBack })))
  const showHighlights = useCanvasStore(s => s.showHighlights)

  const currentScene = project?.scenes.find(s => s.id === currentSceneId) ?? null

  const setStageRef = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage
    registerStage(stage)
  }, [])

  useEffect(() => {
    const cursor = getCanvasCursor(activeTool)
    if (containerRef.current) containerRef.current.style.cursor = cursor
    if (stageRef.current) stageRef.current.container().style.cursor = cursor
  }, [activeTool])

  // ── Auto-select sidebar panel based on selected element ──────────────────────
  useEffect(() => {
    if (selectedIds.length === 0) return
    const stickyPanels: ActivePanel[] = ['perspective', 'motion', 'handDraw', 'effects', 'groupEffects', 'blocks', 'editBg']
    if (stickyPanels.includes(activePanel)) return
    
    const scene = project?.scenes.find(s => s.id === currentSceneId)
    if (!scene) return
    
    const firstSelected = scene.elements.find(e => e.id === selectedIds[0])
    if (!firstSelected) return
    
    const ELEMENT_PANEL: Record<string, ActivePanel> = {
      text:  'text',
      shape: 'shapes',
      arrow: 'arrows',
      code:  'code',
      table: 'table',
      chart: 'charts',
      image: 'upload',
      video: 'video',
      icon:  'icons',
      audio: 'audio',
      latex: 'latex',
      counter: 'counter',
      handDraw: 'handDraw',
    }
    
    // A whole smart group selected → its settings; one part (Ctrl-click) → that part's panel.
    const smartGroup = firstSelected.groupId && scene.groups?.[firstSelected.groupId]?.smart
      && scene.elements.filter(e => e.groupId === firstSelected.groupId).every(e => selectedIds.includes(e.id))
    const homePanel = smartGroup ? 'blocks' : ELEMENT_PANEL[firstSelected.type]
    if (homePanel && activePanel !== homePanel) {
      setActivePanel(homePanel)
    }
  }, [selectedIds, project, currentSceneId, activePanel, setActivePanel])

  // ── Fit slide canvas to available space ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !project) return
    const el = containerRef.current

    const recalc = () => {
      if (!containerRef.current) return
      const PAD   = 15
      const cw    = containerRef.current.clientWidth  - PAD * 2
      const ch    = containerRef.current.clientHeight - PAD * 2
      const pw    = project.width
      const ph    = project.height
      const s     = Math.min(cw / pw, ch / ph, 1)   // never upscale beyond 1:1
      const dw    = Math.round(pw * s)
      const dh    = Math.round(ph * s)
      const ox    = Math.round((containerRef.current.clientWidth  - dw) / 2)
      const oy    = Math.round((containerRef.current.clientHeight - dh) / 2)

      console.log(`[Canvas] project=${pw}×${ph}  container=${containerRef.current.clientWidth}×${containerRef.current.clientHeight}  scale=${s.toFixed(3)}  display=${dw}×${dh}  offset=(${ox},${oy})`)

      setScale(s)
      setCanvasW(dw)
      setCanvasH(dh)
      setOffsetX(ox)
      setOffsetY(oy)
    }

    recalc()
    const ro = new ResizeObserver(recalc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [project?.width, project?.height])

  // ── Animated background rAF ────────────────────────────────────────────────────
  useEffect(() => {
    if (currentScene?.background.type !== 'animated') {
      cancelAnimationFrame(animFrameRef.current)
      return
    }
    const tick = () => {
      bgShapeRef.current?.getLayer()?.batchDraw()
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [currentScene?.background.type])

  // ── Let go of the old selection at once ──────────────────────────────────────
  // (pressElement attaches the new one right after; the effect below keeps it in sync.)
  useEffect(() => useEditorStore.subscribe(s => s.selectedIds, () => { trRef.current?.nodes([]) }), [])

  // ── Sync Transformer to selected nodes ────────────────────────────────────────
  useEffect(() => {
    const sync = () => {
      if (!trRef.current || !stageRef.current) return
      const nodes = transformerNodes(selectedIds)
      // Runs every frame during playback (an element can re-mount mid-play);
      // only re-attach and redraw when the selected nodes actually changed.
      const attached = trRef.current.nodes()
      if (nodes.length === attached.length && nodes.every((n, i) => n === attached[i])) return
      trRef.current.nodes(nodes)
      trRef.current.getLayer()?.batchDraw()
    }
    sync()
    const raf = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(raf)
  }, [selectedIds, currentScene, currentSceneId, playhead])

  // ── Global keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (target.isContentEditable) return
      if (target.closest?.('.monaco-editor')) return
      
      // Undo: Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        console.log('[EditorCanvas] Undo triggered')
        undo()
        return // IMPORTANT: Return after undo to prevent other handlers
      }
      
      // Redo: Ctrl+Shift+Z (Windows/Linux) or Cmd+Shift+Z (Mac), or Ctrl+Y
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault()
        console.log('[EditorCanvas] Redo triggered')
        redo()
        return // IMPORTANT: Return after redo to prevent other handlers
      }
      
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const scene = project?.scenes.find(s => s.id === currentSceneId)
      const selectedEls = () => selectedIds
        .map(id => scene?.elements.find(el => el.id === id))
        .filter((el): el is EditorElement => el != null)
      const { insertCopies, groupElements, ungroupElements } = useEditorStore.getState()
      // Locked items are protected from delete/cut; say so instead of silently ignoring.
      const unlockedSelection = () => {
        const ids = selectedIds.filter(id => !scene?.elements.find(el => el.id === id)?.locked)
        if (ids.length < selectedIds.length) toast.info('Locked items were kept — unlock them first (right-click → Unlock).')
        return ids
      }

      // Group: Ctrl+G, Ungroup: Ctrl+Shift+G
      if (mod && key === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroupElements(selectedIds)
        else groupElements(selectedIds)
        return
      }

      // Select all: Ctrl+A — every unlocked item on this scene
      if (mod && key === 'a') {
        e.preventDefault()
        useEditorStore.setState({ selectedIds: (scene?.elements ?? []).filter(el => !el.locked && el.type !== 'audio').map(el => el.id) })
        return
      }

      // Copy: Ctrl+C, Cut: Ctrl+X
      if (mod && (key === 'c' || key === 'x')) {
        if (scene && selectedIds.length > 0) {
          clipboardRef.current = selectedEls().map(el => JSON.parse(JSON.stringify(el)))
          clipboardSourceSceneRef.current = currentSceneId ?? null
          if (key === 'x') {
            e.preventDefault()
            const toCut = unlockedSelection()
            deselectAll()
            toCut.forEach(id => removeElement(id))
          }
        }
        return
      }

      // Duplicate: Ctrl+D — copies next to the originals, without touching the clipboard
      if (mod && key === 'd') {
        e.preventDefault()
        insertCopies(selectedEls(), { offset: 20 })
        return
      }

      // Paste: Ctrl+V
      if (mod && key === 'v') {
        if (clipboardRef.current.length > 0) {
          e.preventDefault()
          // Only offset position when pasting into the SAME scene (to avoid overlap).
          // When pasting across scenes, preserve exact original coordinates.
          const isSameScene = clipboardSourceSceneRef.current === currentSceneId
          insertCopies(clipboardRef.current, { offset: isSameScene ? 20 : 0, sourceSceneId: clipboardSourceSceneRef.current })
        }
        return
      }

      // Delete removes the selected elements. preventDefault marks the key as
      // used, so the timeline's handler (delete clip / scene) skips it.
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0 && !e.defaultPrevented) {
        e.preventDefault()
        const toDelete = unlockedSelection()
        deselectAll()
        toDelete.forEach(id => removeElement(id))
      }
      
      // Arrow keys: nudge selected element(s). Shift = larger step.
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (selectedIds.length === 0) return  // let the timeline scrub instead
        e.preventDefault()
        // Shift = 40 px, Alt = 100 px, plain = 12 px (canvas is HD-sized so steps are large).
        // Groups move as one; Ctrl moves only the item pressed last.
        const step = e.altKey ? 100 : e.shiftKey ? 40 : 12
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0
        const scene = project?.scenes.find(s => s.id === currentSceneId)
        if (!scene) return
        const only = lastPressedIdRef.current
        const moving = (e.ctrlKey || e.metaKey)
          ? (only && selectedIds.includes(only) ? [only] : selectedIds)
          : expandToGroups(scene, selectedIds)
        moveElements(moving, dx, dy)
        return
      }

      if (e.key === 'Escape') {
        deselectAll()
        setActiveTool('select')
        setContextMenu(null)
      }
      
      // Layer ordering shortcuts (Adobe-style)
      // Bring Forward: Ctrl/Cmd + Shift + ]
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ']') {
        e.preventDefault()
        if (selectedIds.length > 0) {
          selectedIds.forEach(id => bringForward(id))
        }
        return
      }
      
      // Send Backward: Ctrl/Cmd + Shift + [
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '[') {
        e.preventDefault()
        if (selectedIds.length > 0) {
          selectedIds.forEach(id => sendBackward(id))
        }
        return
      }
      
      // Bring to Front: Ctrl/Cmd + ]
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === ']') {
        e.preventDefault()
        if (selectedIds.length > 0) {
          selectedIds.forEach(id => bringToFront(id))
        }
        return
      }
      
      // Send to Back: Ctrl/Cmd + [
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === '[') {
        e.preventDefault()
        if (selectedIds.length > 0) {
          selectedIds.forEach(id => sendToBack(id))
        }
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, removeElement, deselectAll, setActiveTool, undo, redo, project, currentSceneId, updateElement, bringForward, sendBackward, bringToFront, sendToBack, addElement])

  // Reset local video plays when preview starts (VideoKonva takes over)
  useEffect(() => {
    if (isPlaying) setLocalPlayingIds(new Set())
  }, [isPlaying])

  // Load + seek upcoming video clips (split/trimmed clips, next scene) ahead of the cut.
  useEffect(() => {
    if (project && isPlaying) prewarmUpcomingVideos(project, playhead)
  }, [project, isPlaying, playhead])

  // ── Crop mode: initialize pendingCrop from store trigger ──────────────────────
  useEffect(() => {
    if (!cropElementId) { setCropState(null); return }
    const el = currentScene?.elements.find(e => e.id === cropElementId) as (ImageElement | VideoElement) | undefined
    if (!el) { setCropElement(null); return }
    setCropState({
      elId: cropElementId,
      pendingCrop: el.crop ? { ...el.crop } : { x: 0, y: 0, w: 1, h: 1 }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropElementId])

  // ── Crop drag mouse tracking ──────────────────────────────────────────────────
  useEffect(() => {
    if (!cropDrag || !cropState) return
    const cropEl = currentScene?.elements.find(e => e.id === cropState.elId)
    if (!cropEl) return
    const ew = cropEl.width, eh = cropEl.height

    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - cropDrag.startX) / scale / ew
      const dy = (e.clientY - cropDrag.startY) / scale / eh
      const sc = cropDrag.startCrop
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
      const MIN = 0.05
      let { x, y, w, h } = sc

      switch (cropDrag.handle) {
        case 'move': x = clamp(sc.x + dx, 0, 1 - sc.w); y = clamp(sc.y + dy, 0, 1 - sc.h); break
        case 'tl':   x = clamp(sc.x + dx, 0, sc.x + sc.w - MIN); y = clamp(sc.y + dy, 0, sc.y + sc.h - MIN); w = sc.w - (x - sc.x); h = sc.h - (y - sc.y); break
        case 'tc':   y = clamp(sc.y + dy, 0, sc.y + sc.h - MIN); h = sc.h - (y - sc.y); break
        case 'tr':   w = clamp(sc.w + dx, MIN, 1 - sc.x); y = clamp(sc.y + dy, 0, sc.y + sc.h - MIN); h = sc.h - (y - sc.y); break
        case 'ml':   x = clamp(sc.x + dx, 0, sc.x + sc.w - MIN); w = sc.w - (x - sc.x); break
        case 'mr':   w = clamp(sc.w + dx, MIN, 1 - sc.x); break
        case 'bl':   x = clamp(sc.x + dx, 0, sc.x + sc.w - MIN); w = sc.w - (x - sc.x); h = clamp(sc.h + dy, MIN, 1 - sc.y); break
        case 'bc':   h = clamp(sc.h + dy, MIN, 1 - sc.y); break
        case 'br':   w = clamp(sc.w + dx, MIN, 1 - sc.x); h = clamp(sc.h + dy, MIN, 1 - sc.y); break
      }
      setCropState(prev => prev ? { ...prev, pendingCrop: { x, y, w, h } } : null)
    }
    const onUp = () => setCropDrag(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [cropDrag, scale, currentScene])

  // ── Crop keyboard handler ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!cropState) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter')  { e.preventDefault(); applyAndExitCrop(); }
      if (e.key === 'Escape') { e.preventDefault(); exitCropMode(); }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cropState]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyAndExitCrop() {
    if (!cropState || !currentScene) return
    const c = cropState.pendingCrop
    const full = c.x < 0.001 && c.y < 0.001 && c.w > 0.999 && c.h > 0.999
    const cropEl = currentScene.elements.find(e => e.id === cropState.elId) as (ImageElement | VideoElement) | undefined
    if (!cropEl) { setCropElement(null); setCropState(null); return }

    const newW = Math.round(cropEl.width  * c.w)
    const newH = Math.round(cropEl.height * c.h)
    const newX = Math.round(cropEl.x + c.x * cropEl.width)
    const newY = Math.round(cropEl.y + c.y * cropEl.height)

    const existing = cropEl.crop
    let finalCrop: typeof c | undefined
    if (!full) {
      if (existing) {
        finalCrop = {
          x: existing.x + c.x * existing.w,
          y: existing.y + c.y * existing.h,
          w: c.w * existing.w,
          h: c.h * existing.h,
        }
      } else {
        finalCrop = c
      }
    }

    // A hand-set crop replaces any face-following (auto-reframe) crop.
    updateElement(cropState.elId, {
      x: newX, y: newY, width: newW, height: newH,
      crop: finalCrop,
      cropKeys: undefined,
    } as Partial<EditorElement>)
    setCropElement(null); setCropState(null)
  }
  function exitCropMode() { setCropElement(null); setCropState(null) }

  // ── Coordinate helper: client → project space ─────────────────────────────────
  // Uses the stage canvas DOM element's own bounding rect (handles CSS offset correctly)
  function toProjectCoords(clientX: number, clientY: number) {
    const dom = stageRef.current?.container()
    if (!dom) return { x: 0, y: 0 }
    const r = dom.getBoundingClientRect()
    return {
      x: (clientX - r.left) / scale,
      y: (clientY - r.top)  / scale
    }
  }

  // ── Stage event handlers ───────────────────────────────────────────────────────
  function resolveElementId(target: Konva.Node) {
    let node: Konva.Node | null = target
    while (node && node !== node.getStage()) {
      const id = node.id()
      if (id && currentScene?.elements.some(el => el.id === id)) return id
      node = node.getParent()
    }
    return ''
  }

  /** Moves items by (dx, dy) — arrows by both ends; locked items stay. */
  function moveElements(ids: string[], dx: number, dy: number) {
    const scene = useEditorStore.getState().project?.scenes.find(sc => sc.id === useEditorStore.getState().currentSceneId)
    for (const id of ids) {
      const el = scene?.elements.find(x => x.id === id)
      if (!el || el.locked) continue
      if (el.type === 'arrow') updateElement(id, { x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy })
      else updateElement(id, { x: el.x + dx, y: el.y + dy })
    }
  }

  /** Canvas nodes the transformer handles for these ids (locked items get an outline + lock badge instead). */
  function transformerNodes(ids: string[]) {
    const stage = stageRef.current
    if (!stage || !ids.length) return []
    const scene = useEditorStore.getState().project?.scenes.find(sc => sc.id === useEditorStore.getState().currentSceneId)
    const byId = new Map(scene?.elements.map(el => [el.id, el]))
    const wanted = new Set(ids.filter(id => {
      const el = byId.get(id)
      // Members of a group drawn in perspective are only a hidden source; the warped picture stands for them.
      const warped = el?.groupId && scene?.groups?.[el.groupId]?.perspective
      return el && el.type !== 'handDraw' && !el.locked && !warped
    }))
    if (!wanted.size) return []
    // One walk over the canvas; the first node with each id (as findOne did).
    const found = new Map<string, Konva.Node>()
    stage.find((node: Konva.Node) => {
      const id = node.id()
      if (id && wanted.has(id) && !found.has(id)) found.set(id, node)
      return false
    })
    return ids.map(id => found.get(id)).filter((n): n is Konva.Node => !!n && !!n.getStage?.())
  }

  /**
   * Mouse-down on an item. Plain press: select it with its group — unless the
   * selection already holds it (and its whole group), so dragging moves the whole
   * selection. Shift: add/remove it (with its group). Ctrl/Alt: just this item.
   */
  function pressElement(id: string, multi: boolean, member: boolean) {
    lastPressedIdRef.current = id
    const store = useEditorStore.getState()
    const scene = store.project?.scenes.find(sc => sc.id === store.currentSceneId)
    const el = scene?.elements.find(x => x.id === id)
    const group = el?.groupId ? scene!.elements.filter(x => x.groupId === el.groupId).map(x => x.id) : [id]
    const selected = new Set(store.selectedIds)
    if (multi || member) store.selectElement(id, multi, { member })
    else if (!group.every(x => selected.has(x))) store.selectElement(id, false)
    // Attach the new selection right away: a drag can start 3 px later, before
    // React re-renders, and must already carry the whole group.
    trRef.current?.nodes(transformerNodes(useEditorStore.getState().selectedIds))
  }

  function handleStageContextMenu(e: Konva.KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault()

    const target = e.target
    // Ignore background clicks
    if (target === target.getStage() || target.name() === 'bg') return

    // Resolve element id from direct node or any selectable parent Group.
    const id = resolveElementId(target)
    if (!id) return

    // Select the right-clicked element if not already in selection
    if (!selectedIds.includes(id)) {
      selectElement(id, false)
    }

    setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, elementId: id })
  }
  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.evt.button !== 0) return
    if (suppressStageClickRef.current) { suppressStageClickRef.current = false; return }
    if (cropState) { exitCropMode(); return }
    if (!currentScene) return
    if (activeTool === 'handDraw') return
    const { x, y } = toProjectCoords(e.evt.clientX, e.evt.clientY)

    switch (activeTool) {
      case 'shape-rect':
      case 'shape-circle':
      case 'shape-triangle':
      case 'shape-star':
      case 'shape-pentagon':
      case 'shape-hexagon':
      case 'shape-octagon':
      case 'shape-diamond':
      case 'shape-oval':
      case 'shape-speechBubble':
      case 'shape-roundedSpeech':
      case 'shape-cone':
      case 'shape-cube':
      case 'shape-rect-hand':
      case 'shape-circle-hand':
      case 'shape-square-hand':
      case 'shape-heart':
      case 'shape-rect-sketch': {
        const t = activeTool.replace('shape-', '') as ShapeType
        addElement(makeShape(t, x - 60, y - 60))
        setActiveTool('select')
        break
      }
      case 'code':
        openCodeModal()
        setActiveTool('select')
        break
      case 'chart': {
        const chart = makeChart(x - 200, y - 150)
        chart.chartType = pendingChartType
        addElement(chart)
        setActiveTool('select')
        break
      }
      case 'counter':
        // Don't add counter on canvas click - user configures in panel first
        break
      default:
        if (e.target === e.target.getStage() || e.target.name() === 'bg') {
          deselectAll()
          if (currentScene.background.type === 'image') setActivePanel('background')
        }
    }
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    suppressStageClickRef.current = false
    if (activeTool === 'handDraw') {
      if (!project || !currentScene) return
      e.evt.preventDefault()
      const { x, y } = toProjectCoords(e.evt.clientX, e.evt.clientY)
      const width = handDrawSettings.tool === 'eraser' ? handDrawSettings.eraserSize : handDrawSettings.strokeWidth
      const stroke: HandDrawStroke = {
        id: crypto.randomUUID(),
        tool: handDrawSettings.tool,
        points: [x, y],
        color: handDrawSettings.tool === 'eraser' ? '#000000' : handDrawSettings.strokeColor,
        width,
        opacity: handDrawSettings.tool === 'eraser' ? 1 : handDrawSettings.strokeOpacity,
        hardness: handDrawSettings.eraserHardness,
        grainColor: handDrawSettings.tool === 'paint' ? handDrawSettings.paintGrainColor : undefined,
        spread: handDrawSettings.spraySpread,
      }

      const existing = currentScene.elements.find((el): el is HandDrawElement => el.type === 'handDraw')
      if (existing) {
        drawingLayerIdRef.current = existing.id
        drawingBaseStrokesRef.current = existing.strokes
        updateElement(existing.id, {
          x: 0,
          y: 0,
          rotation: 0,
          width: project.width,
          height: project.height,
          strokes: [...existing.strokes, stroke],
        } as Partial<EditorElement>)
        selectElement(existing.id, false)
      } else {
        const layer = makeHandDrawLayer(project.width, project.height)
        layer.strokes = [stroke]
        drawingLayerIdRef.current = layer.id
        drawingBaseStrokesRef.current = []
        addElement(layer)
      }

      drawingStrokeRef.current = stroke
      setDrawingStroke(stroke)
      return
    }

    if (activeTool !== 'arrow') return
    const { x, y } = toProjectCoords(e.evt.clientX, e.evt.clientY)
    setDrawingArrow({ x1: x, y1: y, x2: x, y2: y })
  }

  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (activePanel === 'motion') {
      const { x, y } = toProjectCoords(e.evt.clientX, e.evt.clientY)
      setCursorCoord({ x: Math.round(x), y: Math.round(y) })
    }

    if (drawingStrokeRef.current) {
      if (!project) return
      e.evt.preventDefault()
      const { x, y } = toProjectCoords(e.evt.clientX, e.evt.clientY)
      const stroke = drawingStrokeRef.current
      const lastX = stroke.points[stroke.points.length - 2]
      const lastY = stroke.points[stroke.points.length - 1]
      if (Math.hypot(x - lastX, y - lastY) < 1.25) return

      const next: HandDrawStroke = {
        ...stroke,
        points: [...stroke.points, x, y],
      }
      drawingStrokeRef.current = next
      setDrawingStroke(next)

      if (drawingLayerIdRef.current) {
        updateElement(drawingLayerIdRef.current, {
          x: 0,
          y: 0,
          rotation: 0,
          width: project.width,
          height: project.height,
          strokes: [...drawingBaseStrokesRef.current, next],
        } as Partial<EditorElement>)
      }
      return
    }

    if (!drawingArrow) return
    const { x, y } = toProjectCoords(e.evt.clientX, e.evt.clientY)
    setDrawingArrow(a => a ? { ...a, x2: x, y2: y } : null)
  }

  function handleMouseUp() {
    if (drawingStrokeRef.current) {
      if (drawingLayerIdRef.current) selectElement(drawingLayerIdRef.current, false)
      drawingStrokeRef.current = null
      drawingLayerIdRef.current = null
      drawingBaseStrokesRef.current = []
      setDrawingStroke(null)
      return
    }

    if (!drawingArrow) return
    const { x1, y1, x2, y2 } = drawingArrow
    if (Math.abs(x2 - x1) > 5 || Math.abs(y2 - y1) > 5) {
      addElement(makeArrow(x1, y1, x2, y2))
      // The stage click that follows this mouseup would deselect the new arrow.
      suppressStageClickRef.current = true
    }
    setDrawingArrow(null)
    setActiveTool('select')
  }

  function drawHandDrawPreview(raw: CanvasRenderingContext2D, stroke: HandDrawStroke) {
    if (!project) return
    raw.save()
    raw.beginPath()
    raw.rect(0, 0, project.width, project.height)
    raw.clip()

    if (stroke.tool === 'eraser') {
      const x = stroke.points[stroke.points.length - 2]
      const y = stroke.points[stroke.points.length - 1]
      raw.globalCompositeOperation = 'source-over'
      raw.globalAlpha = 0.85
      raw.strokeStyle = '#ffffff'
      raw.lineWidth = 1.5
      raw.setLineDash([6, 4])
      raw.beginPath()
      raw.arc(x, y, stroke.width / 2, 0, Math.PI * 2)
      raw.stroke()
      raw.restore()
      return
    }

    raw.restore()
  }

  // ── Transitions ─────────────────────────────────────────────────────────────
  // The playhead's scene is always on the main stage. During a transition the
  // outgoing scene of a cut plays on a hidden stage, and the blend layer draws
  // both through the transition (intros and outros blend with black). The same
  // happens paused, so scrubbing shows the transition too. Export composes the
  // two stages itself at full resolution.
  const transitionTimeline = useMemo(
    () => (project ? buildTransitionTimeline(project.scenes, project.endTransition) : null),
    [project?.scenes, project?.endTransition],
  )
  const transitionState = transitionTimeline?.length ? getTransitionFrameState(transitionTimeline, playhead) : null
  const morphActive = (isPlaying || exportOpen) && transitionState?.kind === 'transition' && transitionState.transition.type === 'morph'
  const blend: BlendState | null = transitionState?.kind === 'transition' && !morphActive && transitionState.transition.type !== 'morph' &&
    (transitionState.phase === 'outro' ? transitionState.fromSceneId : transitionState.toSceneId) === currentSceneId
    ? transitionState : null
  const blendRef = useRef<BlendState | null>(null)
  blendRef.current = blend
  const blendActive = Boolean(blend) && !exportOpen

  // Redraw the blend every frame while it shows (both scenes may be playing).
  useEffect(() => {
    if (!blendActive) return
    let frame = 0
    const loop = () => {
      blendLayerRef.current?.batchDraw()
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [blendActive])

  const drawBlendLayer = useCallback((ctx: Konva.Context) => {
    const state = blendRef.current
    const bg = bgLayerRef.current
    const els = elementsLayerRef.current
    if (!state || !bg || !els) return
    const scratch = blendScratchRef.current ??= { main: document.createElement('canvas'), other: document.createElement('canvas') }
    const outgoing = outgoingStageRef.current
    // Until the outgoing scene's stage is up, show the scene as it is.
    if (state.phase === 'cut' && !outgoing) return
    const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
    drawBlend(raw, raw.canvas.width, raw.canvas.height, state,
      captureLayers([bg, els], scratch.main),
      outgoing ? captureLayers(outgoing.getLayers(), scratch.other) : null)
  }, [])

  const setOutgoingStage = useCallback((stage: Konva.Stage | null) => {
    outgoingStageRef.current = stage
    registerOutgoingStage(stage)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────────

  if (!project || !currentScene) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-[#5c1f03]">
        <div className="w-5 h-5 border-2 border-editor-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // During a Morph (playback or export frames) render the live in-between scene.
  // Paused editing always shows the real scene so it stays editable.
  const morphFrame = morphActive ? getMorphFrame(project, playhead) : null
  const activeScene = morphFrame?.scene ?? currentScene
  const localTime = morphFrame ? morphFrame.localTime : currentSceneId ? playhead - sceneStartTime(project.scenes, currentSceneId) : 0

  // Clip sound crosses over: the outgoing scene fades out as the incoming one fades in.
  const volumes = blend ? blendVolumes(blend) : null
  const mainVolume = blend ? (blend.phase === 'outro' ? volumes!.from : volumes!.to) : 1
  // The outgoing copy of a cut. While playing it starts a little before the cut (muted),
  // so its videos are ready and it simply carries on when the main stage moves to the next scene.
  const upcoming = !blend && isPlaying && transitionTimeline ? getUpcomingTransitionEntry(transitionTimeline, playhead, 0.6) : null
  const outgoing = blend?.phase === 'cut'
    ? { scene: project.scenes[blend.fromSceneIndex], localTime: blend.fromLocalTime, volume: volumes!.from }
    : upcoming && upcoming.transition.type !== 'morph' && transitionTimeline
      ? { scene: project.scenes[upcoming.sceneIndex - 1], localTime: playhead - transitionTimeline[upcoming.sceneIndex - 1].startTime, volume: 0 }
      : null

  const sortedEls = [...(activeScene ?? currentScene).elements].sort((a, b) => a.zIndex - b.zIndex)
  const selectedSet = new Set(selectedIds)
  const sceneElementById = new Map((currentScene?.elements ?? []).map(el => [el.id, el]))

  // Lock aspect ratio in transformer when single image/video has lockRatio enabled
  const keepRatioInTransform = (() => {
    if (selectedIds.length !== 1) return false
    const sel = currentScene.elements.find(e => e.id === selectedIds[0])
    if (!sel) return false
    // Cuboid: edge handles change width or height only; corners scale the whole solid.
    if (sel.type === 'shape' && sel.shapeType === 'cube') return true
    return (sel.type === 'image' || sel.type === 'video') &&
      ((sel as ImageElement | VideoElement).lockRatio ?? true)
  })()

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden"
      style={{
        cursor: getCanvasCursor(activeTool)
      }}
    >
      {/* Slide canvas — positioned by CSS, NOT by Konva x/y props */}
      <div
        style={{
          position: 'absolute',
          left: offsetX,
          top:  offsetY,
          width:  canvasW,
          height: canvasH,
          boxShadow: '0 4px 8px rgba(46, 45, 45, 0.3)',
        }}
      >
        <Stage
          ref={setStageRef}
          width={canvasW}
          height={canvasH}
          scaleX={scale}
          scaleY={scale}
          onClick={handleStageClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setCursorCoord(null)}
          onContextMenu={handleStageContextMenu}
        >
          {/* Background */}
          <Layer ref={bgLayerRef}>
            <BackgroundShape
              ref={bgShapeRef}
              bg={(activeScene ?? currentScene).background}
              w={project.width}
              h={project.height}
              time={playhead}
            />
            {/* Grid, Guides, Safe Area */}
            <CanvasGrid width={project.width} height={project.height} />
            <CanvasGuides width={project.width} height={project.height} />
            <CanvasSafeArea width={project.width} height={project.height} />
          </Layer>

          {/* Elements */}
          <Layer ref={elementsLayerRef}>
            {(() => {
              // A group drawn in perspective renders once, as one warped picture, where its lowest member sits.
              const scene = activeScene ?? currentScene
              const warped = warpedGroups(scene)
              const drawnGroups = new Set<string>()
              const renderElement = (el: EditorElement) => {
              const animProps = getAnimatedProps(el, localTime)
              // Always apply animations: during playback OR when a playhead position is explicitly set
              // (which happens during export frame rendering)
              const shouldApplyAnim = isPlaying || playhead > 0
              return (
                <CanvasElement
                  key={el.id}
                  element={el}
                  animProps={shouldApplyAnim ? animProps : null}
                  isSelected={selectedSet.has(el.id)}
                  onSelect={(multi, member) => pressElement(el.id, multi, member)}
                  onDblClick={() => {
                    if (el.type === 'code') openCodeModal(el.id)
                    else if (el.type === 'image' || el.type === 'video') setCropElement(el.id)
                  }}
                  stageScale={scale}
                  localTime={localTime}
                  sceneWidth={project?.width}
                  syncVideoToTime={!localPlayingIds.has(el.id) && (isPlaying || playhead > 0)}
                  videoPlaybackActive={isPlaying}
                  mediaVolume={mainVolume}
                  globalTime={playhead}
                  sceneDuration={(activeScene ?? currentScene).duration}
                />
              )
              }
              return sortedEls.filter(el => el.visible).map(el => {
                const members = el.groupId ? warped.get(el.groupId) : undefined
                if (!members) return renderElement(el)
                if (drawnGroups.has(el.groupId!)) return null
                drawnGroups.add(el.groupId!)
                const box = elementsBox(members)
                return (
                  <GroupPerspective
                    key={`group-perspective-${el.groupId}`}
                    box={box}
                    pts={groupPerspectivePts(scene.groups![el.groupId!].perspective!, box)}
                    nodeId={members[0].id}
                    draggable={activeTool === 'select' && !members.some(m => m.locked)}
                    onPress={shift => pressElement(members[0].id, shift, false)}
                    onMoved={(dx, dy) => moveElements(members.map(m => m.id), dx, dy)}
                  >
                    {members.map(renderElement)}
                  </GroupPerspective>
                )
              })
            })()}
          </Layer>

          {/* A transition in progress: the outgoing and incoming scenes drawn together over the scene. */}
          {blendActive && (
            <Layer ref={blendLayerRef} listening={false}>
              <Shape sceneFunc={drawBlendLayer} listening={false} />
            </Layer>
          )}

          {/* Captions sit above transitions — they belong to the timeline, not to a scene. */}
          <Layer id="subtitles" listening={false}>
            <SubtitleOverlay project={project} time={playhead} />
          </Layer>

          {/* Highlights: where every item is (editor only — never in an export) */}
          {showHighlights && !exportOpen && (
            <Layer listening={false}>
              <HighlightOverlay elements={(activeScene ?? currentScene).elements} />
            </Layer>
          )}

          {/* Transformer + perspective handles + arrow preview */}
          <Layer>
            <Transformer
              ref={trRef}
              visible={shouldShowSelectionHandles(activeTool) && activePanel !== 'perspective' && !cropState}
              rotateEnabled
              enabledAnchors={TRANSFORM_ANCHORS}
              keepRatio={keepRatioInTransform}
              boundBoxFunc={minTransformBox}
              anchorSize={5}
              anchorFill="#6a32c9"
              anchorStroke="#f3e7e7"
              anchorStrokeWidth={1}
              anchorCornerRadius={3}
              borderStroke={SELECTION_COLOR}
              borderStrokeWidth={2}
              rotateAnchorOffset={15}
              rotateLineVisible={false}
              rotationSnaps={ROTATION_SNAPS}
              rotateAnchorCursor="grab"
              anchorStyleFunc={styleTransformAnchor}
            />

            {/* Selected locked items: dashed outline + lock badge (no resize handles) */}
            {!exportOpen && selectedIds.map(id => {
              const el = sceneElementById.get(id)
              if (!el?.locked) return null
              const box = elementsBox([el])
              return <LockedMark key={id} box={box} scale={scale} color={SELECTION_COLOR} />
            })}

            {/* Name tag above a selected group */}
            {!exportOpen && (() => {
              const els = selectedIds.map(id => sceneElementById.get(id)).filter((el): el is EditorElement => el != null)
              const groupId = els[0]?.groupId
              const group = groupId ? currentScene?.groups?.[groupId] : undefined
              if (!group || !els.every(el => el.groupId === groupId)) return null
              const box = elementsBox(els)
              const size = 12 / scale
              return (
                <Label x={box.x} y={box.y - size * 2.2} listening={false}>
                  <Tag fill={SELECTION_COLOR} opacity={0.35} cornerRadius={3 / scale} />
                  <Text text={`${group.smart ? '✦ ' : ''}${group.name}`} fontSize={size} padding={size * 0.35} fill="#ffffff" opacity={0.5} fontStyle="bold" />
                </Label>
              )
            })()}

            {/* A selected group in perspective: its quad is the selection outline. */}
            {!exportOpen && activePanel !== 'perspective' && currentScene && (() => {
              const groupId = selectedWholeGroup(currentScene, selectedIds)
              const group = groupId ? currentScene.groups?.[groupId] : undefined
              if (!groupId || !group?.perspective) return null
              const box = elementsBox(currentScene.elements.filter(el => el.groupId === groupId && el.type !== 'audio'))
              const { tl, tr, br, bl } = groupPerspectivePts(group.perspective, box)
              return <Line x={box.x} y={box.y} points={[...tl, ...tr, ...br, ...bl]} closed stroke={SELECTION_COLOR} strokeWidth={1.5 / scale} listening={false} />
            })()}

            {activePanel === 'perspective' && currentScene && (() => {
              // A whole group (e.g. an add-on) gets one set of handles for the group as a plane.
              const groupId = selectedWholeGroup(currentScene, selectedIds)
              if (groupId) {
                const group = currentScene.groups![groupId]
                const box = elementsBox(currentScene.elements.filter(el => el.groupId === groupId && el.type !== 'audio'))
                return (
                  <QuadHandles x={box.x} y={box.y} width={box.width} height={box.height}
                    pts={group.perspective ? groupPerspectivePts(group.perspective, box) : undefined}
                    onChange={pts => useEditorStore.getState().setGroupPerspective(groupId, toGroupPerspective(pts, box))} />
                )
              }
              if (selectedIds.length !== 1) return null
              const perspEl = currentScene.elements.find(e => e.id === selectedIds[0])
              return perspEl ? <PerspectiveHandles el={perspEl} /> : null
            })()}

            {drawingArrow && (
              <Shape
                sceneFunc={(ctx, shape) => {
                  const { x1, y1, x2, y2 } = drawingArrow
                  ctx.beginPath()
                  ctx.moveTo(x1, y1)
                  ctx.lineTo(x2, y2)
                  ctx.strokeShape(shape)
                }}
                stroke="#6366f1"
                strokeWidth={2}
                dash={[4, 4]}
                listening={false}
              />
            )}

            {drawingStroke?.tool === 'eraser' && (
              <Shape
                sceneFunc={(ctx, shape) => {
                  const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
                  drawHandDrawPreview(raw, drawingStroke)
                  ctx.fillStrokeShape(shape)
                }}
                listening={false}
              />
            )}
          </Layer>
        </Stage>

        {activePanel === 'motion' && cursorCoord && (
          <div
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              zIndex: 35,
              pointerEvents: 'none',
              padding: '5px 8px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(10,12,18,0.82)',
              color: '#f8fafc',
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
              backdropFilter: 'blur(8px)',
            }}
          >
            X {cursorCoord.x} · Y {cursorCoord.y}
          </div>
        )}
      </div>

      {/* The outgoing scene of a transition, drawn off screen for the blend layer and export. */}
      {outgoing && (
        <SceneStage
          key={outgoing.scene.id}
          refSetter={setOutgoingStage}
          project={project}
          scene={outgoing.scene}
          localTime={outgoing.localTime}
          globalTime={playhead}
          width={canvasW}
          height={canvasH}
          scale={scale}
          isPlaying={isPlaying}
          keepPlaying
          mediaVolume={outgoing.volume}
          mediaKeySuffix="@out"
          quietLoading
          subtitles={false}
          style={{ position: 'absolute', left: offsetX, top: offsetY, width: canvasW, height: canvasH, visibility: 'hidden' }}
        />
      )}

      {/* Crop overlay — HTML, not Konva, excluded from export */}
      {cropState && (() => {
        const cropEl = currentScene.elements.find(e => e.id === cropState.elId)
        if (!cropEl) return null
        const ex = offsetX + cropEl.x * scale
        const ey = offsetY + cropEl.y * scale
        const ew = cropEl.width  * scale
        const eh = cropEl.height * scale
        const { x: cx, y: cy, w: cw, h: ch } = cropState.pendingCrop
        const sl = cx * ew, st = cy * eh, sw = cw * ew, sh = ch * eh
        const HS = 8
        const handles = [
          { id: 'tl', l: sl - HS/2, t: st - HS/2, cursor: 'nwse-resize' },
          { id: 'tc', l: sl + sw/2 - HS/2, t: st - HS/2, cursor: 'ns-resize' },
          { id: 'tr', l: sl + sw - HS/2, t: st - HS/2, cursor: 'nesw-resize' },
          { id: 'ml', l: sl - HS/2, t: st + sh/2 - HS/2, cursor: 'ew-resize' },
          { id: 'mr', l: sl + sw - HS/2, t: st + sh/2 - HS/2, cursor: 'ew-resize' },
          { id: 'bl', l: sl - HS/2, t: st + sh - HS/2, cursor: 'nesw-resize' },
          { id: 'bc', l: sl + sw/2 - HS/2, t: st + sh - HS/2, cursor: 'ns-resize' },
          { id: 'br', l: sl + sw - HS/2, t: st + sh - HS/2, cursor: 'nwse-resize' },
        ]
        const MASK = 'rgba(0,0,0,0.55)'
        const startDrag = (handle: string, e: React.MouseEvent) => {
          e.stopPropagation()
          setCropDrag({ handle, startX: e.clientX, startY: e.clientY, startCrop: { ...cropState.pendingCrop } })
        }
        return (
          <div style={{ position: 'absolute', left: ex, top: ey, width: ew, height: eh, zIndex: 25, userSelect: 'none' }}>
            {/* Dark masks */}
            {st > 0    && <div style={{ position: 'absolute', left: 0, top: 0, width: ew, height: st, background: MASK, pointerEvents: 'none' }} />}
            {st+sh < eh && <div style={{ position: 'absolute', left: 0, top: st+sh, width: ew, height: eh-st-sh, background: MASK, pointerEvents: 'none' }} />}
            {sl > 0    && <div style={{ position: 'absolute', left: 0, top: st, width: sl, height: sh, background: MASK, pointerEvents: 'none' }} />}
            {sl+sw < ew && <div style={{ position: 'absolute', left: sl+sw, top: st, width: ew-sl-sw, height: sh, background: MASK, pointerEvents: 'none' }} />}
            {/* Crop border + move handle */}
            <div
              style={{ position: 'absolute', left: sl, top: st, width: sw, height: sh, border: '1px solid rgba(255,255,255,0.85)', boxSizing: 'border-box', cursor: 'move', pointerEvents: 'all' }}
              onMouseDown={e => startDrag('move', e)}
            >
              <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '33.33%', height: 1, background: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '66.66%', height: 1, background: 'rgba(255,255,255,0.22)', pointerEvents: 'none' }} />
            </div>
            {/* Resize handles */}
            {handles.map(h => (
              <div
                key={h.id}
                style={{ position: 'absolute', left: h.l, top: h.t, width: HS, height: HS, background: 'white', border: '1px solid rgba(0,0,0,0.35)', cursor: h.cursor, zIndex: 26, pointerEvents: 'all' }}
                onMouseDown={e => startDrag(h.id, e)}
              />
            ))}
            {/* Apply / Cancel */}
            <div style={{ position: 'absolute', left: sl, top: Math.min(st + sh + 8, eh - 32), display: 'flex', gap: 4, zIndex: 27, pointerEvents: 'all' }}>
              <button onClick={applyAndExitCrop} title="Apply crop (Enter)" style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--editor-accent, #6c63ff)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}><Check size={13} /></button>
              <button onClick={exitCropMode} title="Cancel crop (Escape)" style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2a282b', color: '#f2f2f2', border: '1px solid #3a3a3a', borderRadius: 5, cursor: 'pointer' }}><X size={13} /></button>
            </div>
          </div>
        )
      })()}

      {/* Video play/pause buttons — HTML overlay, not part of Konva, excluded from export */}
      {!isPlaying && sortedEls
        .filter(el => {
          if (el.type !== 'video' || !el.visible) return false
          return getVideoClipState(el as VideoElement, localTime).visible
        })
        .map(el => {
          const v = el as VideoElement
          const isLocalPlaying = localPlayingIds.has(v.id)
          const cx = offsetX + (v.x + v.width  / 2) * scale
          const cy = offsetY + (v.y + v.height / 2) * scale
          return (
            <button
              key={v.id}
              style={{ position: 'absolute', left: cx - 18, top: cy - 18, width: 36, height: 36, zIndex: 10 }}
              className="flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors opacity-60 hover:opacity-100"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                const vid = videoRegistry.get(v.id)
                if (!vid) return
                if (isLocalPlaying) {
                  vid.pause()
                  setLocalPlayingIds(prev => { const s = new Set(prev); s.delete(v.id); return s })
                } else {
                  vid.play().catch(() => {})
                  setLocalPlayingIds(prev => new Set([...prev, v.id]))
                }
              }}
            >
              {isLocalPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
          )
        })
      }

      {/* Scale indicator */}
      <div className="absolute bottom-2 right-3 text-xs text-white bg-black px-2 py-0.5 ">
        {project.width}×{project.height} · {Math.round(scale * 100)}%
      </div>

      {/* Canvas Toolbar */}
      <div className="absolute top-2 right-2">
        <CanvasToolbar />
      </div>

      {/* Context Menu */}
      {(() => {
        const ctxEl = contextMenu
          ? currentScene?.elements.find(e => e.id === contextMenu.elementId) ?? null
          : null
        const isImage = ctxEl?.type === 'image'
        const ctxGroupId = ctxEl?.groupId && currentScene?.elements.some(el => el.id !== ctxEl.id && el.groupId === ctxEl.groupId) ? ctxEl.groupId : undefined

        // Center the right-clicked element on the canvas using its mid-point.
        const center = (axis: 'h' | 'v') => {
          if (ctxEl && project) {
            if (ctxEl.type === 'arrow') {
              const a = ctxEl as unknown as { x1: number; y1: number; x2: number; y2: number }
              if (axis === 'h') { const dx = project.width / 2 - (a.x1 + a.x2) / 2; updateElement(ctxEl.id, { x1: a.x1 + dx, x2: a.x2 + dx } as Partial<EditorElement>) }
              else              { const dy = project.height / 2 - (a.y1 + a.y2) / 2; updateElement(ctxEl.id, { y1: a.y1 + dy, y2: a.y2 + dy } as Partial<EditorElement>) }
            } else {
              const w = (ctxEl as { width?: number }).width ?? 0
              const h = (ctxEl as { height?: number }).height ?? 0
              if (axis === 'h') updateElement(ctxEl.id, { x: Math.round(project.width / 2 - w / 2) } as Partial<EditorElement>)
              else              updateElement(ctxEl.id, { y: Math.round(project.height / 2 - h / 2) } as Partial<EditorElement>)
            }
          }
          setContextMenu(null)
        }

        return (
          <ContextMenu
            visible={contextMenu !== null}
            x={contextMenu?.x ?? 0}
            y={contextMenu?.y ?? 0}
            items={[
              {
                label: 'Copy',
                icon: <Clipboard size={14} />,
                onClick: () => {
                  const scene = currentScene
                  if (scene && selectedIds.length > 0) {
                    clipboardRef.current = selectedIds
                      .map(id => scene.elements.find(el => el.id === id))
                      .filter((el): el is EditorElement => el != null)
                      .map(el => JSON.parse(JSON.stringify(el)))
                    clipboardSourceSceneRef.current = currentSceneId ?? null
                  }
                  setContextMenu(null)
                }
              },
              {
                label: 'Duplicate',
                icon: <Copy size={14} />,
                shortcut: 'Ctrl+D',
                onClick: () => {
                  const els = selectedIds.map(id => currentScene?.elements.find(el => el.id === id)).filter((el): el is EditorElement => el != null)
                  useEditorStore.getState().insertCopies(els, { offset: 20 })
                  setContextMenu(null)
                }
              },
              ...(selectedIds.length >= 2 && !(ctxGroupId && selectedIds.every(id => currentScene?.elements.find(el => el.id === id)?.groupId === ctxGroupId)) ? [{
                label: 'Group',
                icon: <Group size={14} />,
                shortcut: 'Ctrl+G',
                onClick: () => { useEditorStore.getState().groupElements(selectedIds); setContextMenu(null) },
              }] : []),
              ...(ctxGroupId ? [
                {
                  label: `Ungroup "${currentScene?.groups?.[ctxGroupId]?.name ?? 'group'}"`,
                  icon: <Ungroup size={14} />,
                  shortcut: 'Ctrl+Shift+G',
                  onClick: () => { useEditorStore.getState().ungroupElements([contextMenu!.elementId]); setContextMenu(null) },
                },
                {
                  label: 'Select whole group',
                  icon: <BoxSelect size={14} />,
                  onClick: () => { selectElement(contextMenu!.elementId, false); setContextMenu(null) },
                },
              ] : []),
              {
                label: ctxEl?.locked ? 'Unlock' : (ctxGroupId ? 'Lock group' : 'Lock'),
                icon: ctxEl?.locked ? <Unlock size={14} /> : <Lock size={14} />,
                onClick: () => {
                  if (ctxEl) useEditorStore.getState().setLocked(ctxEl.locked ? [ctxEl.id] : selectedIds, !ctxEl.locked)
                  setContextMenu(null)
                }
              },
              {
                label: 'Bring Forward',
                icon: <ArrowUpToLine size={14} />,
                onClick: () => {
                  if (contextMenu?.elementId) bringForward(contextMenu.elementId)
                  setContextMenu(null)
                }
              },
              {
                label: 'Send Backward',
                icon: <ArrowDownToLine size={14} />,
                onClick: () => {
                  if (contextMenu?.elementId) sendBackward(contextMenu.elementId)
                  setContextMenu(null)
                }
              },
              {
                label: 'Bring to Front',
                icon: <ArrowUpToLine size={14} />,
                onClick: () => {
                  if (contextMenu?.elementId) bringToFront(contextMenu.elementId)
                  setContextMenu(null)
                }
              },
              {
                label: 'Send to Back',
                icon: <ArrowDownToLine size={14} />,
                onClick: () => {
                  if (contextMenu?.elementId) sendToBack(contextMenu.elementId)
                  setContextMenu(null)
                }
              },
              {
                label: 'Center Horizontally',
                icon: <AlignHorizontalJustifyCenter size={14} />,
                onClick: () => center('h')
              },
              {
                label: 'Center Vertically',
                icon: <AlignVerticalJustifyCenter size={14} />,
                onClick: () => center('v')
              },
              ...(isImage ? [
                {
                  label: 'Set Background (Cover)',
                  icon: <ImageIcon size={14} />,
                  onClick: () => {
                    if (currentSceneId) {
                      const imgEl = ctxEl as ImageElement
                      setBackground(currentSceneId, imageElementToBackground(imgEl, 'cover'))
                    }
                    setContextMenu(null)
                  }
                },
                {
                  label: 'Set Background (Fill)',
                  icon: <ImageIcon size={14} />,
                  onClick: () => {
                    if (currentSceneId) {
                      const imgEl = ctxEl as ImageElement
                      setBackground(currentSceneId, imageElementToBackground(imgEl, 'fill'))
                    }
                    setContextMenu(null)
                  }
                }
              ] : []),
              {
                label: 'Delete',
                icon: <Trash2 size={14} />,
                dangerous: true,
                onClick: () => {
                  const toDelete = [...selectedIds]
                  deselectAll()
                  toDelete.forEach(id => removeElement(id))
                  setContextMenu(null)
                }
              }
            ]}
            onClose={() => setContextMenu(null)}
          />
        )
      })()}
    </div>
  )
}

// ── Transformer rotate handle icon ────────────────────────────────────────────

/** Selection outline color; the rotate icon uses it too. */
const SELECTION_COLOR = '#d44747'

// Transformer settings, made once. (Konva re-measures every selected item when one of
// these changes — a new array or function on each render made big selections crawl.)
const TRANSFORM_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left']
const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315]

function minTransformBox(_old: { x: number; y: number; width: number; height: number; rotation: number }, box: { x: number; y: number; width: number; height: number; rotation: number }) {
  return { ...box, width: Math.max(10, box.width), height: Math.max(10, box.height) }
}

/** The rotation anchor drawn as a rotate icon: accent disc + clockwise arrow. */
function styleTransformAnchor(anchor: Konva.Rect) {
  if (!anchor.hasName('rotater')) return
  const size = 18
  anchor.width(size)
  anchor.height(size)
  anchor.offsetX(size / 2)
  anchor.offsetY(size / 2)
  anchor.sceneFunc(ctx => drawRotateIcon((ctx as unknown as { _context: CanvasRenderingContext2D })._context, size))
  anchor.hitFunc((ctx, shape) => {
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fillStrokeShape(shape)
  })
}

function drawRotateIcon(ctx: CanvasRenderingContext2D, size: number) {
  const c = size / 2
  const r = size * 0.27
  const start = -Math.PI / 2 + 0.55            // just right of 12 o'clock
  const end = start + Math.PI * 2 - 1.3        // clockwise, leaving a gap at the top

  ctx.save()
  ctx.beginPath()
  ctx.arc(c, c, c, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(105, 50, 201, 0.36)'     // accent purple at 50%
  ctx.fill()

  ctx.beginPath()
  ctx.arc(c, c, r, start, end)
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.strokeStyle = SELECTION_COLOR
  ctx.stroke()

  // Arrowhead at the arc's end, pointing clockwise along the tangent.
  const px = c + r * Math.cos(end), py = c + r * Math.sin(end)
  const tx = -Math.sin(end), ty = Math.cos(end)   // clockwise tangent
  const nx = Math.cos(end), ny = Math.sin(end)    // outward normal
  ctx.beginPath()
  ctx.moveTo(px + tx * 2.8, py + ty * 2.8)
  ctx.lineTo(px + nx * 2.4, py + ny * 2.4)
  ctx.lineTo(px - nx * 2.4, py - ny * 2.4)
  ctx.closePath()
  ctx.fillStyle = SELECTION_COLOR
  ctx.fill()
  ctx.restore()
}

// ── Background renderer ────────────────────────────────────────────────────────

const BackgroundShape = React.forwardRef<Konva.Shape, {
  bg: Background; w: number; h: number; time: number
}>(function BackgroundShape({ bg, w, h, time }, ref) {
  const [bgImage, setBgImage] = React.useState<HTMLImageElement | null>(null)
  const bgSrc = bg.type === 'image' ? (bg as ImageBg).src : ''

  React.useEffect(() => {
    if (!bgSrc) { setBgImage(null); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => setBgImage(img)
    img.onerror = () => setBgImage(null)
    img.src = toFileUrl(bgSrc)
  }, [bgSrc])

  const sceneFunc = useCallback((ctx: Konva.Context, shape: Konva.Shape) => {
    const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
    drawBackground(raw, bg, w, h, time, bgImage)
    ctx.fillStrokeShape(shape)
  }, [bg, w, h, time, bgImage])

  return (
    <Shape
      ref={ref}
      name="bg"
      width={w}
      height={h}
      sceneFunc={sceneFunc}
      listening={false}
    />
  )
})
