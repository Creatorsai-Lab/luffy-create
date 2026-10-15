import { create } from 'zustand'

export interface CanvasSettings {
  // Grid
  showGrid: boolean
  gridSize: number
  gridColor: string
  snapToGrid: boolean

  // Guides
  showGuides: boolean
  guides: { type: 'horizontal' | 'vertical'; position: number; id: string }[]
  snapToGuides: boolean
  guideSnapDistance: number

  // Rulers
  showRulers: boolean
  rulerUnit: 'px' | 'cm' | 'in'

  // Smart guides (alignment helpers)
  showSmartGuides: boolean
  smartGuideColor: string

  // Safe area
  showSafeArea: boolean
  safeAreaMargin: number

  // Canvas zoom and pan
  canvasZoom: number
  canvasPanX: number
  canvasPanY: number
  minZoom: number
  maxZoom: number

  // Element snapping
  snapToElements: boolean
  elementSnapDistance: number
}

interface CanvasActions {
  // Grid
  setShowGrid: (show: boolean) => void
  setGridSize: (size: number) => void
  setSnapToGrid: (snap: boolean) => void

  // Guides
  setShowGuides: (show: boolean) => void
  addGuide: (type: 'horizontal' | 'vertical', position: number) => void
  removeGuide: (id: string) => void
  moveGuide: (id: string, position: number) => void
  clearGuides: () => void
  setSnapToGuides: (snap: boolean) => void

  // Rulers
  setShowRulers: (show: boolean) => void
  setRulerUnit: (unit: 'px' | 'cm' | 'in') => void

  // Smart guides
  setShowSmartGuides: (show: boolean) => void

  // Safe area
  setShowSafeArea: (show: boolean) => void
  setSafeAreaMargin: (margin: number) => void

  // Canvas zoom and pan
  setCanvasZoom: (zoom: number) => void
  setCanvasPan: (x: number, y: number) => void
  resetPan: () => void

  // Element snapping
  setSnapToElements: (snap: boolean) => void

  // Reset all
  resetCanvasSettings: () => void
}

const DEFAULT_SETTINGS: CanvasSettings = {
  showGrid: false,
  gridSize: 100,
  gridColor: 'rgba(159, 152, 160, 0.87)',
  snapToGrid: false,

  showGuides: false,
  guides: [],
  snapToGuides: true,
  guideSnapDistance: 5,

  showRulers: false,
  rulerUnit: 'px',

  showSmartGuides: true,
  smartGuideColor: '#6366f1',

  showSafeArea: false,
  safeAreaMargin: 50,

  canvasZoom: 1,
  canvasPanX: 0,
  canvasPanY: 0,
  minZoom: 0.1,
  maxZoom: 5,

  snapToElements: true,
  elementSnapDistance: 5
}

export const useCanvasStore = create<CanvasSettings & CanvasActions>((set, get) => ({
  ...DEFAULT_SETTINGS,

  // ── Grid ───────────────────────────────────────────────────────────────────
  setShowGrid: (show) => set({ showGrid: show }),
  setGridSize: (size) => set({ gridSize: Math.max(5, size) }),
  setSnapToGrid: (snap) => set({ snapToGrid: snap }),

  // ── Guides ─────────────────────────────────────────────────────────────────
  setShowGuides: (show) => set({ showGuides: show }),
  
  addGuide: (type, position) => set(state => ({
    guides: [...state.guides, {
      type,
      position,
      id: `guide-${Date.now()}-${Math.random()}`
    }]
  })),

  removeGuide: (id) => set(state => ({
    guides: state.guides.filter(g => g.id !== id)
  })),

  moveGuide: (id, position) => set(state => ({
    guides: state.guides.map(g => g.id === id ? { ...g, position } : g)
  })),

  clearGuides: () => set({ guides: [] }),
  
  setSnapToGuides: (snap) => set({ snapToGuides: snap }),

  // ── Rulers ─────────────────────────────────────────────────────────────────
  setShowRulers: (show) => set({ showRulers: show }),
  setRulerUnit: (unit) => set({ rulerUnit: unit }),

  // ── Smart Guides ───────────────────────────────────────────────────────────
  setShowSmartGuides: (show) => set({ showSmartGuides: show }),

  // ── Safe Area ──────────────────────────────────────────────────────────────
  setShowSafeArea: (show) => set({ showSafeArea: show }),
  setSafeAreaMargin: (margin) => set({ safeAreaMargin: Math.max(0, margin) }),

  // ── Canvas Zoom & Pan ──────────────────────────────────────────────────────
  setCanvasZoom: (zoom) => set(state => ({
    canvasZoom: Math.max(state.minZoom, Math.min(state.maxZoom, zoom))
  })),

  zoomIn: () => set(state => ({
    canvasZoom: Math.min(state.maxZoom, state.canvasZoom * 1.2)
  })),

  zoomOut: () => set(state => ({
    canvasZoom: Math.max(state.minZoom, state.canvasZoom / 1.2)
  })),

  resetZoom: () => set({ canvasZoom: 1 }),

  setCanvasPan: (x, y) => set({ canvasPanX: x, canvasPanY: y }),
  
  resetPan: () => set({ canvasPanX: 0, canvasPanY: 0 }),

  // ── Element Snapping ───────────────────────────────────────────────────────
  setSnapToElements: (snap) => set({ snapToElements: snap }),

  // ── Reset ──────────────────────────────────────────────────────────────────
  resetCanvasSettings: () => set(DEFAULT_SETTINGS)
}))
