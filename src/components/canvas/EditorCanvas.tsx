import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Stage, Layer, Shape, Transformer, Circle, Path } from 'react-konva'
import type Konva from 'konva'
import { Clipboard, Copy, Trash2, ImageIcon, Play, Pause, Check, X, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { getAnimatedProps } from '../../engine/animator'
import { easeInOutCubic, renderTransition } from '../../engine/transitionRenderer'
import { isDirectionalTransition } from '../../engine/directionalTransitions'
import {
  buildTransitionTimeline,
  getEffectiveTransitionDuration,
  getTransitionFrameState,
} from '../../utils/transitionTiming'
import { drawBackground } from '../../engine/backgroundRenderer'
import { registerStage } from '../../engine/stageRegistry'
import { videoRegistry } from '../../engine/videoRegistry'
import { makeShape, makeArrow, makeTable, makeChart, makeHandDrawLayer } from '../../utils/defaults'
import type { ActivePanel, Background, ImageBg, ImageElement, VideoElement, ShapeType, EditorElement, HandDrawElement, HandDrawStroke, SlideDir, TransitionType } from '../../types/editor'
import { toFileUrl } from '../../utils/pathUtils'
import { getVideoClipState } from '../../utils/videoClip'
import CanvasElement from './CanvasElement'
import PerspectiveHandles from './PerspectiveHandles'
import CanvasGrid from './CanvasGrid'
import CanvasGuides from './CanvasGuides'
import CanvasSafeArea from './CanvasSafeArea'
import CanvasToolbar from './CanvasToolbar'
import ContextMenu from '../ui/ContextMenu'
import SubtitleOverlay from '../../subtitle/SubtitleOverlay'
import { captureStageToCanvas } from './captureStageToCanvas'

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
    if (value !== undefined) (bg as Record<string, unknown>)[key] = value
  }
  return bg
}

export default function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef     = useRef<Konva.Stage | null>(null)
  const trRef        = useRef<Konva.Transformer | null>(null)
  const animFrameRef = useRef<number>(0)
  const bgShapeRef   = useRef<Konva.Shape | null>(null)
  const transitionCanvasRef = useRef<HTMLCanvasElement>(null)
  const transitionFromImageRef = useRef<HTMLImageElement | null>(null)
  const transitionToCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const transitionFrameRef = useRef<number>(0)
  const transitionSnapshotsRef = useRef(new Map<string, string>())
  const transitionFinalSnapshotsRef = useRef(new Set<string>())

  // Computed display size (project coords → screen pixels)
  const [scale,    setScale]    = useState(1)
  const [canvasW,  setCanvasW]  = useState(800)
  const [canvasH,  setCanvasH]  = useState(450)
  const [offsetX,  setOffsetX]  = useState(0)
  const [offsetY,  setOffsetY]  = useState(0)

  const [drawingArrow, setDrawingArrow] = useState<{x1:number;y1:number;x2:number;y2:number}|null>(null)
  const [drawingStroke, setDrawingStroke] = useState<HandDrawStroke | null>(null)
  const drawingStrokeRef = useRef<HandDrawStroke | null>(null)
  const drawingLayerIdRef = useRef<string | null>(null)
  const drawingBaseStrokesRef = useRef<HandDrawStroke[]>([])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null)
  const [localPlayingIds, setLocalPlayingIds] = useState<Set<string>>(new Set())
  const [cropState, setCropState] = useState<{ elId: string; pendingCrop: { x: number; y: number; w: number; h: number } } | null>(null)
  const [cropDrag, setCropDrag] = useState<{ handle: string; startX: number; startY: number; startCrop: { x: number; y: number; w: number; h: number } } | null>(null)
  const [cursorCoord, setCursorCoord] = useState<{ x: number; y: number } | null>(null)
  const [transitionImageReady, setTransitionImageReady] = useState(false)
  const clipboardRef  = useRef<EditorElement[]>([])

  // ── Live transition overlay ───────────────────────────────────────────────────
  const [transOverlay, setTransOverlay] = useState<{
    snap: string
    type: TransitionType
    direction?: SlideDir
    speed?: number
    hardness?: number
    toSceneId: string
    transitionStart: number
    duration: number
  } | null>(null)
  const transActiveRef = useRef(false)

  const {
    project, currentSceneId, selectedIds,
    playhead, isPlaying, activeTool, activePanel, pendingChartType, handDrawSettings,
    cropElementId, setCropElement,
    addElement, selectElement, deselectAll,
    removeElement, updateElement, setBackground, setActiveTool, setActivePanel, openCodeModal,
    undo, redo, duplicateElement
  } = useEditorStore()

  const currentScene = project?.scenes.find(s => s.id === currentSceneId) ?? null

  const setStageRef = useCallback((stage: Konva.Stage | null) => {
    stageRef.current = stage
    registerStage(stage)
  }, [])

  // ── Auto-select sidebar panel based on selected element ──────────────────────
  useEffect(() => {
    if (selectedIds.length === 0) return
    const stickyPanels: ActivePanel[] = ['perspective', 'move', 'handDraw', 'effects']
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
    
    const homePanel = ELEMENT_PANEL[firstSelected.type]
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

  // ── Sync Transformer to selected nodes ────────────────────────────────────────
  useEffect(() => {
    const sync = () => {
      if (!trRef.current || !stageRef.current) return
      const nodes = selectedIds
        .filter(id => currentScene?.elements.find(el => el.id === id)?.type !== 'handDraw')
        .map(id => stageRef.current!.findOne(`#${id}`))
        .filter((n): n is Konva.Node => !!n && !!n.getStage?.())
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
      
      // Copy: Ctrl+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const scene = project?.scenes.find(s => s.id === currentSceneId)
        if (scene && selectedIds.length > 0) {
          clipboardRef.current = selectedIds
            .map(id => scene.elements.find(el => el.id === id))
            .filter((el): el is EditorElement => el != null)
            .map(el => JSON.parse(JSON.stringify(el)))
        }
        return
      }

      // Paste: Ctrl+V
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboardRef.current.length > 0) {
          e.preventDefault()
          clipboardRef.current.forEach(el => {
            const clone: EditorElement = { ...JSON.parse(JSON.stringify(el)), id: crypto.randomUUID() }
            clone.x += 20
            clone.y += 20
            // Arrows render from absolute endpoints — shift those too
            if (clone.type === 'arrow') {
              clone.x1 += 20; clone.y1 += 20; clone.x2 += 20; clone.y2 += 20
            }
            addElement(clone)
          })
        }
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault() // Prevent browser back navigation
        console.log('[EditorCanvas] Delete key pressed, selectedIds:', selectedIds)
        if (selectedIds.length > 0) {
          console.log('[EditorCanvas] Deleting selected elements:', selectedIds)
          // Create a copy to avoid mutation issues
          const toDelete = [...selectedIds]
          deselectAll() // Deselect first to avoid issues
          toDelete.forEach(id => {
            console.log('[EditorCanvas] Removing element:', id)
            removeElement(id)
          })
        } else {
          console.log('[EditorCanvas] No elements selected to delete')
        }
      }
      
      // Arrow keys: nudge selected element(s). Shift = larger step.
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (selectedIds.length === 0) return  // let the timeline scrub instead
        e.preventDefault()
        // Ctrl = fastest, Shift = fast, plain = normal (canvas is HD-sized so steps are large)
        const step = (e.ctrlKey || e.metaKey) ? 100 : e.shiftKey ? 40 : 12
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0
        const scene = project?.scenes.find(s => s.id === currentSceneId)
        if (!scene) return
        for (const id of selectedIds) {
          const el = scene.elements.find(x => x.id === id)
          if (!el || el.locked) continue
          if (el.type === 'arrow') {
            updateElement(id, { x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy })
          } else {
            updateElement(id, { x: el.x + dx, y: el.y + dy })
          }
        }
        return
      }

      if (e.key === 'Escape') {
        deselectAll()
        setActiveTool('select')
        setContextMenu(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, removeElement, deselectAll, setActiveTool, undo, redo, project, currentSceneId, updateElement])

  // Reset local video plays when preview starts (VideoKonva takes over)
  useEffect(() => {
    if (isPlaying) setLocalPlayingIds(new Set())
  }, [isPlaying])

  useEffect(() => {
    if (isPlaying || !stageRef.current || !currentSceneId) return
    const ratio = 1 / (stageRef.current.scaleX() || 1)
    transitionSnapshotsRef.current.set(
      currentSceneId,
      stageRef.current.toDataURL({ pixelRatio: ratio }),
    )
    transitionFinalSnapshotsRef.current.delete(currentSceneId)
  }, [currentSceneId, isPlaying, project])

  // Resolve the same transition window used by Preview and export. Capture the
  // outgoing scene once just before its boundary so the incoming scene can play.
  useEffect(() => {
    if (!project || !isPlaying) {
      if (transActiveRef.current) { transActiveRef.current = false; setTransOverlay(null) }
      return
    }
    const timeline = buildTransitionTimeline(project.scenes)
    const frameState = getTransitionFrameState(timeline, playhead)
    if (frameState.kind === 'transition') {
      if (!transActiveRef.current && stageRef.current) {
        let snap = transitionSnapshotsRef.current.get(frameState.fromSceneId)
        if (!snap && currentSceneId === frameState.fromSceneId) {
          const ratio = 1 / (stageRef.current.scaleX() || 1)
          snap = stageRef.current.toDataURL({ pixelRatio: ratio })
          transitionSnapshotsRef.current.set(frameState.fromSceneId, snap)
        }
        if (!snap) return
        const transitionDuration = getEffectiveTransitionDuration(
          timeline[frameState.toSceneIndex],
        )
        transActiveRef.current = true
        setTransOverlay({
          snap,
          type: frameState.transition.type,
          direction: frameState.transition.direction,
          speed: frameState.transition.speed,
          hardness: frameState.transition.hardness,
          toSceneId: frameState.toSceneId,
          transitionStart: timeline[frameState.toSceneIndex].startTime,
          duration: transitionDuration,
        })
      }
      return
    }

    if (transActiveRef.current) {
      transActiveRef.current = false
      setTransOverlay(null)
    }

    const current = timeline[frameState.sceneIndex]
    const next = timeline[frameState.sceneIndex + 1]
    if (!stageRef.current) return
    const ratio = 1 / (stageRef.current.scaleX() || 1)
    if (!transitionSnapshotsRef.current.has(current.sceneId)) {
      transitionSnapshotsRef.current.set(
        current.sceneId,
        stageRef.current.toDataURL({ pixelRatio: ratio }),
      )
    }
    if (!next || next.transition.type === 'none') return
    const captureLead = Math.min(0.05, getEffectiveTransitionDuration(next))
    if (playhead >= current.endTime - captureLead && playhead < current.endTime) {
      if (!transitionFinalSnapshotsRef.current.has(current.sceneId)) {
        transitionSnapshotsRef.current.set(
          current.sceneId,
          stageRef.current.toDataURL({ pixelRatio: ratio }),
        )
        transitionFinalSnapshotsRef.current.add(current.sceneId)
      }
    }
  }, [project, playhead, isPlaying])

  const drawDirectionalPreview = useCallback(() => {
    if (!transOverlay || !isDirectionalTransition(transOverlay.type)) return
    const canvas = transitionCanvasRef.current
    const from = transitionFromImageRef.current
    const stage = stageRef.current
    if (!canvas || !from || !stage) return
    if (canvas.width !== canvasW) canvas.width = canvasW
    if (canvas.height !== canvasH) canvas.height = canvasH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const toCanvas = transitionToCanvasRef.current ?? document.createElement('canvas')
    transitionToCanvasRef.current = toCanvas
    renderTransition({
      ctx,
      width: canvasW,
      height: canvasH,
      progress: (playhead - transOverlay.transitionStart) / transOverlay.duration,
      type: transOverlay.type,
      direction: transOverlay.direction,
      speed: transOverlay.speed,
      hardness: transOverlay.hardness,
      fromCanvas: from,
      toCanvas: captureStageToCanvas(stage, toCanvas, canvasW, canvasH),
    })
  }, [canvasH, canvasW, playhead, transOverlay])

  useEffect(() => {
    if (!transOverlay || !isDirectionalTransition(transOverlay.type)) {
      transitionFromImageRef.current = null
      setTransitionImageReady(false)
      return
    }
    let active = true
    const image = new Image()
    image.onload = () => {
      if (!active) return
      transitionFromImageRef.current = image
      setTransitionImageReady(true)
    }
    image.src = transOverlay.snap
    return () => {
      active = false
      image.onload = null
    }
  }, [transOverlay?.snap, transOverlay?.type])

  useEffect(() => {
    if (!transitionImageReady) return
    cancelAnimationFrame(transitionFrameRef.current)
    transitionFrameRef.current = requestAnimationFrame(drawDirectionalPreview)
    return () => cancelAnimationFrame(transitionFrameRef.current)
  }, [drawDirectionalPreview, transitionImageReady])

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

    updateElement(cropState.elId, {
      x: newX, y: newY, width: newW, height: newH,
      crop: finalCrop,
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
      case 'table':
        addElement(makeTable(x - 180, y - 60))
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
    if (activePanel === 'move') {
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

  // ── Render ─────────────────────────────────────────────────────────────────────

  if (!project || !currentScene) {
    return (
      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-[#5c1f03]">
        <div className="w-5 h-5 border-2 border-editor-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // During live transition, render the TO scene; otherwise the current scene
  const activeSceneId = transOverlay ? transOverlay.toSceneId : currentSceneId
  const activeScene   = project.scenes.find(s => s.id === activeSceneId) ?? currentScene

  // Compute scene-local time for animations
  let localTime = 0
  if (transOverlay) {
    localTime = Math.max(0, playhead - transOverlay.transitionStart)
  } else {
    let acc = 0
    for (const sc of project.scenes) {
      if (sc.id === currentSceneId) { localTime = playhead - acc; break }
      acc += sc.duration
    }
  }

  const sortedEls = [...(activeScene ?? currentScene).elements].sort((a, b) => a.zIndex - b.zIndex)

  // Lock aspect ratio in transformer when single image/video has lockRatio enabled
  const keepRatioInTransform = (() => {
    if (selectedIds.length !== 1) return false
    const sel = currentScene.elements.find(e => e.id === selectedIds[0])
    if (!sel) return false
    return (sel.type === 'image' || sel.type === 'video') &&
      ((sel as ImageElement | VideoElement).lockRatio ?? true)
  })()

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden"
      style={{
        cursor: activeTool !== 'select' ? 'crosshair' : 'default'
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
          boxShadow: '0 4px 12px rgba(46, 45, 45, 0.42)',
          borderRadius: 2
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
          <Layer>
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
          <Layer>
            {sortedEls.filter(el => el.visible).map(el => {
              const animProps = getAnimatedProps(el, localTime)
              // Always apply animations: during playback OR when a playhead position is explicitly set
              // (which happens during export frame rendering)
              const shouldApplyAnim = isPlaying || playhead > 0
              return (
                <CanvasElement
                  key={el.id}
                  element={el}
                  animProps={shouldApplyAnim ? animProps : null}
                  isSelected={selectedIds.includes(el.id)}
                  onSelect={multi => { if (!el.locked) selectElement(el.id, multi) }}
                  onDblClick={() => {
                    if (el.type === 'code') openCodeModal(el.id)
                    else if (el.type === 'image' || el.type === 'video') setCropElement(el.id)
                  }}
                  stageScale={scale}
                  localTime={localTime}
                  syncVideoToTime={!localPlayingIds.has(el.id) && (isPlaying || playhead > 0)}
                  videoPlaybackActive={isPlaying}
                />
              )
            })}
            <SubtitleOverlay project={project} time={playhead} />
          </Layer>

          {/* Transformer + perspective handles + arrow preview */}
          <Layer>
            <Transformer
              ref={trRef}
              visible={activePanel !== 'perspective' && !cropState}
              rotateEnabled
              enabledAnchors={['top-left','top-center','top-right','middle-right','bottom-right','bottom-center','bottom-left','middle-left']}
              keepRatio={keepRatioInTransform}
              boundBoxFunc={(_old, box) => ({
                ...box,
                width:  Math.max(10, box.width),
                height: Math.max(10, box.height)
              })}
              anchorSize={7}
              anchorFill="#5a5ba0"
              anchorStroke="#fff"
              anchorStrokeWidth={1}
              anchorCornerRadius={3}
              borderStroke="#f776d9"
              borderStrokeWidth={1}
              rotateAnchorOffset={25}
              rotateLineVisible={false}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotateAnchorCursor="grab"
              anchorStyleFunc={(anchor) => {
                // Custom styling for rotation anchor - make it look like a rotation icon
                if (anchor.hasName('rotater')) {
                  anchor.cornerRadius(10)
                  anchor.fill('#6c6d9473')
                  anchor.stroke('#ebebeb')
                  anchor.strokeWidth(1.5)
                  anchor.width(12)
                  anchor.height(12)
                  anchor.offsetX(5) 
                  anchor.offsetY(0)
                }
              }}
            />

            {activePanel === 'perspective' && selectedIds.length === 1 && (() => {
              const perspEl = currentScene?.elements.find(e => e.id === selectedIds[0])
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

        {activePanel === 'move' && cursorCoord && (
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

      {transOverlay && isDirectionalTransition(transOverlay.type) && (
        <>
          <img
            src={transOverlay.snap}
            style={{
              position: 'absolute',
              left: offsetX, top: offsetY,
              width: canvasW, height: canvasH,
              pointerEvents: 'none',
              zIndex: 39,
            }}
          />
          <canvas
            ref={transitionCanvasRef}
            width={canvasW}
            height={canvasH}
            style={{
              position: 'absolute',
              left: offsetX, top: offsetY,
              width: canvasW, height: canvasH,
              pointerEvents: 'none',
              zIndex: 40,
            }}
          />
        </>
      )}

      {/* Existing transitions keep their lightweight HTML preview path. */}
      {transOverlay && !isDirectionalTransition(transOverlay.type) && (() => {
        const rawP = Math.min(1, Math.max(0, (playhead - transOverlay.transitionStart) / transOverlay.duration))
        const p = easeInOutCubic(rawP)
        const dir = transOverlay.direction
        // The overlay is the OLD (FROM) scene sitting on top; the NEW scene renders
        // beneath. So we animate the OLD scene's EXIT. `dir` = edge the NEW scene
        // enters from, therefore the OLD scene leaves toward the OPPOSITE edge.
        let overlayStyle: React.CSSProperties = {}
        switch (transOverlay.type) {
          case 'fade':
            overlayStyle = { opacity: 1 - p }
            break
          case 'slide':
          case 'push':
            // old exits opposite to where the new enters
            if (dir === 'right') overlayStyle = { transform: `translateX(-${p * 100}%)` }
            else if (dir === 'left') overlayStyle = { transform: `translateX(${p * 100}%)` }
            else if (dir === 'down') overlayStyle = { transform: `translateY(-${p * 100}%)` }
            else if (dir === 'up') overlayStyle = { transform: `translateY(${p * 100}%)` }
            else overlayStyle = { transform: `translateX(-${p * 100}%)` }
            break
          case 'zoom':
            overlayStyle = { opacity: 1 - p, transform: `scale(${1 + p * 0.035})`, transformOrigin: 'center center' }
            break
          case 'wipe':
            if (dir === 'right') overlayStyle = { clipPath: `inset(0 0 0 ${p * 100}%)` }
            else if (dir === 'left') overlayStyle = { clipPath: `inset(0 ${p * 100}% 0 0)` }
            else if (dir === 'down') overlayStyle = { clipPath: `inset(${p * 100}% 0 0 0)` }
            else overlayStyle = { clipPath: `inset(0 0 ${p * 100}% 0)` }
            break
          case 'morph': {
            // Match export: stable center grow/blend, no directional drift.
            overlayStyle = {
              opacity: 1 - p,
              transform: `scale(${1 + p * 0.025})`,
              transformOrigin: 'center center',
            }
            break
          }
        }
        return (
          <img
            src={transOverlay.snap}
            style={{
              position: 'absolute',
              left: offsetX, top: offsetY,
              width: canvasW, height: canvasH,
              pointerEvents: 'none',
              zIndex: 40,
              ...overlayStyle,
            }}
          />
        )
      })()}

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
                  }
                  setContextMenu(null)
                }
              },
              {
                label: 'Duplicate',
                icon: <Copy size={14} />,
                onClick: () => {
                  selectedIds.forEach(id => duplicateElement(id))
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
