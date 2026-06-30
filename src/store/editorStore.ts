import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import type {
  Project, Scene, EditorElement, ElementAnimation,
  Background, SceneTransition, AssetMeta,
  ActiveTool, ActivePanel, TimeMarker, VideoElement
} from '../types/editor'
import { makeScene, makeProject } from '../utils/defaults'
import { useHistoryStore } from './historyStore'

interface EditorState {
  project:           Project | null
  currentProjectId:  string | null
  currentSceneId:    string | null
  selectedIds:       string[]
  playhead:          number
  isPlaying:         boolean
  zoom:              number
  activeTool:        ActiveTool
  activePanel:       ActivePanel
  pendingChartType:  'bar' | 'line' | 'pie' | 'doughnut' | 'area' | 'points'
  isDirty:           boolean
  codeModalOpen:     boolean
  codeModalElemId:   string | null
  cropElementId:     string | null
  previewOpen:       boolean
  exportOpen:        boolean
  userGuideOpen:     boolean
  subtitleOpen:      boolean
  exportProgress:    number
  timelineZoom:      number
  snapEnabled:       boolean
}

interface EditorActions {
  // Project
  loadProject:      (project: Project) => void
  closeProject:     () => void
  setProjectName:   (name: string) => void
  setCanvasSize:    (w: number, h: number) => void

  // Scenes
  addScene:         () => void
  duplicateScene:   (id: string) => void
  removeScene:      (id: string) => void
  reorderScenes:    (from: number, to: number) => void
  setCurrentScene:  (id: string) => void
  updateScene:      (id: string, patch: Partial<Pick<Scene, 'name' | 'duration'>>) => void
  setBackground:    (id: string, bg: Background) => void
  setTransition:    (id: string, tr: SceneTransition) => void

  // Elements
  addElement:         (el: EditorElement) => void
  addElementToScene:  (sceneId: string, el: EditorElement) => void
  updateElement:      (id: string, patch: Partial<EditorElement>) => void
  removeElement:      (id: string) => void
  duplicateElement: (id: string) => void
  bringForward:     (id: string) => void
  sendBackward:     (id: string) => void
  bringToFront:     (id: string) => void
  sendToBack:       (id: string) => void

  // Selection
  selectElement:    (id: string, multi?: boolean) => void
  deselectAll:      () => void

  // Animations
  addAnimation:     (elId: string, anim: ElementAnimation) => void
  updateAnimation:  (elId: string, animId: string, patch: Partial<ElementAnimation>) => void
  removeAnimation:  (elId: string, animId: string) => void
  clearSceneAnimations: (sceneId: string) => void
  setGroupId:       (ids: string[], groupId: string | null) => void

  // Playback
  setPlayhead:      (t: number) => void
  play:             () => void
  pause:            () => void
  stop:             () => void

  // UI
  setZoom:          (z: number) => void
  setActiveTool:    (t: ActiveTool) => void
  setActivePanel:   (p: ActivePanel) => void
  setPendingChartType: (ct: 'bar' | 'line' | 'pie' | 'doughnut' | 'area' | 'points') => void
  openCodeModal:    (elemId?: string) => void
  closeCodeModal:   () => void
  setCropElement:   (id: string | null) => void
  setPreviewOpen:   (v: boolean) => void
  setExportOpen:    (v: boolean) => void
  setUserGuideOpen: (v: boolean) => void
  setSubtitleOpen:  (v: boolean) => void
  setExportProgress:(v: number) => void
  setTimelineZoom:  (z: number) => void

  // Assets
  addAsset:         (a: AssetMeta) => void
  removeAsset:      (id: string) => void
  markDirty:        () => void
  markClean:        () => void

  // Time markers
  addTimeMarker:    (time: number) => void
  removeTimeMarker: (id: string) => void

  // Audio markers (stored relative to clip, move with clip, deleted with clip)
  addAudioMarker:    (audioId: string, offset: number) => void
  removeAudioMarker: (audioId: string, markerId: string) => void

  // History
  undo:             () => void
  redo:             () => void
  saveHistory:      (description: string) => void

  // Getters
  getCurrentScene:  () => Scene | null
  getSelectedEls:   () => EditorElement[]
  getTotalDuration: () => number
  getSceneAtTime:   (t: number) => { scene: Scene; localTime: number } | null
}

function reconcileUiAfterProjectRestore(s: EditorState, project: Project) {
  s.project = project
  s.isDirty = true

  const totalDur = project.scenes.reduce((sum, sc) => sum + sc.duration, 0)
  s.playhead = Math.min(Math.max(0, s.playhead), Math.max(0, totalDur))

  const sceneStillExists = project.scenes.some(sc => sc.id === s.currentSceneId)
  if (!sceneStillExists) {
    let elapsed = 0
    let resolvedId: string | null = null
    for (const sc of project.scenes) {
      if (s.playhead < elapsed + sc.duration) {
        resolvedId = sc.id
        break
      }
      elapsed += sc.duration
    }
    s.currentSceneId = resolvedId ?? project.scenes[0]?.id ?? null
  }

  if (s.currentSceneId) {
    const scene = project.scenes.find(sc => sc.id === s.currentSceneId)
    if (scene) {
      const validIds = new Set(scene.elements.map(el => el.id))
      s.selectedIds = s.selectedIds.filter(id => validIds.has(id))
    } else {
      s.selectedIds = []
      s.currentSceneId = project.scenes[0]?.id ?? null
    }
  } else {
    s.selectedIds = []
  }
}

function fitSceneToVideoContent(sc: Scene) {
  let maxEnd = 0
  for (const el of sc.elements) {
    if (el.type !== 'video') continue
    const v = el as VideoElement
    const end = (v.timelineX ?? 0) + (v.duration ?? v.sourceDuration ?? 0)
    if (end > maxEnd) maxEnd = end
  }
  if (maxEnd > 0) sc.duration = Math.max(sc.duration, maxEnd)
}

export const useEditorStore = create<EditorState & EditorActions>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // ── State ──────────────────────────────────────────────────────────────
      project:          null,
      currentProjectId: null,
      currentSceneId:   null,
      selectedIds:      [],
      playhead:         0,
      isPlaying:        false,
      zoom:             1,
      activeTool:       'select',
      activePanel:      null,
      pendingChartType: 'bar',
      isDirty:          false,
      codeModalOpen:    false,
      codeModalElemId:  null,
      cropElementId:    null,
      previewOpen:      false,
      exportOpen:       false,
      userGuideOpen:    false,
      subtitleOpen:     false,
      exportProgress:   0,
      timelineZoom:     1,
      snapEnabled:      true,

      // ── Project ────────────────────────────────────────────────────────────
      loadProject: (project) => set(s => {
        s.project          = project
        s.currentProjectId = project.id
        s.currentSceneId   = project.scenes[0]?.id ?? null
        s.selectedIds      = []
        s.playhead         = 0
        s.isPlaying        = false
        s.isDirty          = false
      }),

      closeProject: () => set(s => {
        s.project          = null
        s.currentProjectId = null
        s.currentSceneId   = null
        s.selectedIds      = []
        s.playhead         = 0
        s.isPlaying        = false
        s.isDirty          = false
      }),

      setProjectName: (name) => set(s => {
        if (s.project) { s.project.name = name; s.isDirty = true }
      }),

      setCanvasSize: (w, h) => set(s => {
        if (s.project) { s.project.width = w; s.project.height = h; s.isDirty = true }
      }),

      // ── Scenes ─────────────────────────────────────────────────────────────
      addScene: () => set(s => {
        if (!s.project) return
        const scene = makeScene(s.project.scenes.length + 1)
        s.project.scenes.push(scene)
        s.currentSceneId = scene.id
        s.isDirty = true
      }),

      duplicateScene: (id) => set(s => {
        if (!s.project) return
        const idx = s.project.scenes.findIndex(sc => sc.id === id)
        if (idx < 0) return
        const clone: Scene = JSON.parse(JSON.stringify(s.project.scenes[idx]))
        clone.id   = uuid()
        clone.name = clone.name + ' Copy'
        clone.elements = clone.elements.map(e => ({ ...e, id: uuid() }))
        s.project.scenes.splice(idx + 1, 0, clone)
        s.currentSceneId = clone.id
        s.isDirty = true
      }),

      removeScene: (id) => set(s => {
        if (!s.project || s.project.scenes.length <= 1) return
        const scenes = s.project.scenes
        const idx = scenes.findIndex(sc => sc.id === id)
        if (idx < 0) return

        // Preserve audio clips: move them to a neighbor scene so deleting a scene
        // never silently drops audio that visually overlaps an adjacent scene.
        const startOf = (i: number) => scenes.slice(0, i).reduce((a, sc) => a + sc.duration, 0)
        const removed = scenes[idx]
        const audios = removed.elements.filter(e => e.type === 'audio')
        if (audios.length > 0) {
          const targetIdx   = idx > 0 ? idx - 1 : idx + 1
          const target      = scenes[targetIdx]
          const removedStart = startOf(idx)
          const targetStart  = startOf(targetIdx)
          for (const a of audios) {
            const audio = a as { x?: number }
            const absStart = removedStart + (audio.x ?? 0)
            audio.x = Math.max(0, absStart - targetStart)
            target.elements.push(a)
          }
        }

        scenes.splice(idx, 1)
        if (s.currentSceneId === id) {
          s.currentSceneId = scenes[Math.max(0, idx - 1)].id
        }
        s.isDirty = true
      }),

      reorderScenes: (from, to) => set(s => {
        if (!s.project) return
        const [scene] = s.project.scenes.splice(from, 1)
        s.project.scenes.splice(to, 0, scene)
        s.isDirty = true
      }),

      setCurrentScene: (id) => set(s => {
        s.currentSceneId = id
        s.selectedIds    = []
      }),

      updateScene: (id, patch) => set(s => {
        if (!s.project) return
        const sc = s.project.scenes.find(x => x.id === id)
        if (sc) { Object.assign(sc, patch); s.isDirty = true }
      }),

      setBackground: (id, bg) => set(s => {
        if (!s.project) return
        const sc = s.project.scenes.find(x => x.id === id)
        if (sc) { sc.background = bg; s.isDirty = true }
      }),

      setTransition: (id, tr) => set(s => {
        if (!s.project) return
        const sc = s.project.scenes.find(x => x.id === id)
        if (sc) { sc.transition = tr; s.isDirty = true }
      }),

      // ── Elements ──────────────────────────────────────────────────────────
      addElement: (el) => set(s => {
        if (!s.project || !s.currentSceneId) return
        const sc = s.project.scenes.find(x => x.id === s.currentSceneId)
        if (!sc) return
        const elem = { ...el, zIndex: sc.elements.length } as EditorElement
        sc.elements.push(elem)
        if (el.type !== 'audio') s.selectedIds = [el.id]
        if (el.type === 'video') fitSceneToVideoContent(sc)
        s.isDirty = true
      }),

      addElementToScene: (sceneId, el) => set(s => {
        if (!s.project) return
        const sc = s.project.scenes.find(x => x.id === sceneId)
        if (!sc) return
        const elem = { ...el, zIndex: sc.elements.length } as EditorElement
        sc.elements.push(elem)
        if (el.type === 'video') fitSceneToVideoContent(sc)
        s.isDirty = true
      }),

      // Search all scenes so audio ops work regardless of which scene is active
      updateElement: (id, patch) => set(s => {
        if (!s.project) return
        for (const sc of s.project.scenes) {
          const el = sc.elements.find(e => e.id === id)
          if (el) { Object.assign(el, patch); s.isDirty = true; return }
        }
      }),

      removeElement: (id) => set(s => {
        if (!s.project) return
        for (const sc of s.project.scenes) {
          const idx = sc.elements.findIndex(e => e.id === id)
          if (idx >= 0) {
            sc.elements.splice(idx, 1)
            s.selectedIds = s.selectedIds.filter(x => x !== id)
            s.isDirty = true
            return
          }
        }
      }),

      duplicateElement: (id) => set(s => {
        if (!s.project || !s.currentSceneId) return
        const sc = s.project.scenes.find(x => x.id === s.currentSceneId)
        if (!sc) return
        const el = sc.elements.find(e => e.id === id)
        if (!el) return
        const clone = JSON.parse(JSON.stringify(el))
        clone.id = uuid()
        clone.x += 16; clone.y += 16
        // Arrows render from absolute endpoints — shift those too so the copy is visibly offset
        if (clone.type === 'arrow') {
          clone.x1 += 16; clone.y1 += 16; clone.x2 += 16; clone.y2 += 16
        }
        clone.zIndex = sc.elements.length
        sc.elements.push(clone)
        s.selectedIds = [clone.id]
        s.isDirty = true
      }),

      bringForward: (id) => set(s => {
        if (!s.project || !s.currentSceneId) return
        const sc = s.project.scenes.find(x => x.id === s.currentSceneId)
        if (!sc) return
        const el = sc.elements.find(e => e.id === id)
        if (!el) return
        const above = sc.elements.filter(e => e.zIndex === el.zIndex + 1)
        above.forEach(e => { e.zIndex -= 1 })
        el.zIndex += 1
        s.isDirty = true
      }),

      sendBackward: (id) => set(s => {
        if (!s.project || !s.currentSceneId) return
        const sc = s.project.scenes.find(x => x.id === s.currentSceneId)
        if (!sc) return
        const el = sc.elements.find(e => e.id === id)
        if (!el || el.zIndex === 0) return
        const below = sc.elements.filter(e => e.zIndex === el.zIndex - 1)
        below.forEach(e => { e.zIndex += 1 })
        el.zIndex -= 1
        s.isDirty = true
      }),

      bringToFront: (id) => set(s => {
        if (!s.project || !s.currentSceneId) return
        const sc = s.project.scenes.find(x => x.id === s.currentSceneId)
        if (!sc) return
        const sorted = [...sc.elements].sort((a, b) => a.zIndex - b.zIndex)
        const idx = sorted.findIndex(e => e.id === id)
        if (idx < 0) return
        sorted.push(sorted.splice(idx, 1)[0])
        sorted.forEach((e, i) => {
          const el = sc.elements.find(x => x.id === e.id)
          if (el) el.zIndex = i
        })
        s.isDirty = true
      }),

      sendToBack: (id) => set(s => {
        if (!s.project || !s.currentSceneId) return
        const sc = s.project.scenes.find(x => x.id === s.currentSceneId)
        if (!sc) return
        const sorted = [...sc.elements].sort((a, b) => a.zIndex - b.zIndex)
        const idx = sorted.findIndex(e => e.id === id)
        if (idx < 0) return
        sorted.unshift(sorted.splice(idx, 1)[0])
        sorted.forEach((e, i) => {
          const el = sc.elements.find(x => x.id === e.id)
          if (el) el.zIndex = i
        })
        s.isDirty = true
      }),

      // ── Selection ─────────────────────────────────────────────────────────
      selectElement: (id, multi) => set(s => {
        if (multi) {
          if (s.selectedIds.includes(id)) s.selectedIds = s.selectedIds.filter(x => x !== id)
          else s.selectedIds.push(id)
        } else {
          s.selectedIds = [id]
        }
      }),

      deselectAll: () => set(s => { s.selectedIds = [] }),

      // ── Animations ────────────────────────────────────────────────────────
      addAnimation: (elId, anim) => set(s => {
        if (!s.project || !s.currentSceneId) return
        const sc = s.project.scenes.find(x => x.id === s.currentSceneId)
        if (!sc) return
        const el = sc.elements.find(e => e.id === elId)
        if (el) { el.animations.push(anim as ElementAnimation); s.isDirty = true }
      }),

      updateAnimation: (elId, animId, patch) => set(s => {
        if (!s.project || !s.currentSceneId) return
        const sc = s.project.scenes.find(x => x.id === s.currentSceneId)
        if (!sc) return
        const el   = sc.elements.find(e => e.id === elId)
        if (!el) return
        const anim = el.animations.find(a => a.id === animId)
        if (anim) { Object.assign(anim, patch); s.isDirty = true }
      }),

      removeAnimation: (elId, animId) => set(s => {
        if (!s.project || !s.currentSceneId) return
        const sc = s.project.scenes.find(x => x.id === s.currentSceneId)
        if (!sc) return
        const el = sc.elements.find(e => e.id === elId)
        if (el) { el.animations = el.animations.filter(a => a.id !== animId); s.isDirty = true }
      }),

      // Clear every animation from all elements in one scene
      clearSceneAnimations: (sceneId) => set(s => {
        if (!s.project) return
        const sc = s.project.scenes.find(x => x.id === sceneId)
        if (!sc) return
        sc.elements.forEach(el => { el.animations = [] })
        s.isDirty = true
      }),

      // Assign (or clear) a shared groupId so elements move/lock together
      setGroupId: (ids, groupId) => set(s => {
        if (!s.project) return
        for (const sc of s.project.scenes) {
          sc.elements.forEach(el => {
            if (ids.includes(el.id)) (el as { groupId?: string | null }).groupId = groupId ?? undefined
          })
        }
        s.isDirty = true
      }),

      // ── Playback ──────────────────────────────────────────────────────────
      setPlayhead: (t) => set(s => { s.playhead = t }),
      play:        ()  => set(s => { s.isPlaying = true }),
      pause:       ()  => set(s => { s.isPlaying = false }),
      stop:        ()  => set(s => { s.isPlaying = false; s.playhead = 0 }),

      // ── UI ────────────────────────────────────────────────────────────────
      setZoom:          (z) => set(s => { s.zoom = z }),
      setActiveTool:    (t) => set(s => { s.activeTool = t }),
      setActivePanel:   (p) => set(s => { s.activePanel = p }),
      setPendingChartType: (ct) => set(s => { s.pendingChartType = ct }),
      openCodeModal:    (id) => set(s => { s.codeModalOpen = true; s.codeModalElemId = id ?? null }),
      closeCodeModal:   ()  => set(s => { s.codeModalOpen = false; s.codeModalElemId = null }),
      setCropElement:   (id) => set(s => { s.cropElementId = id }),
      setPreviewOpen:   (v) => set(s => { s.previewOpen = v }),
      setExportOpen:    (v) => set(s => { s.exportOpen = v }),
      setUserGuideOpen: (v) => set(s => { s.userGuideOpen = v }),
      setSubtitleOpen:  (v) => set(s => { s.subtitleOpen = v }),
      setExportProgress:(v) => set(s => { s.exportProgress = v }),
      setTimelineZoom:  (z) => set(s => { s.timelineZoom = Math.max(0.1, Math.min(5, z)) }),

      markDirty:        ()  => set(s => { s.isDirty = true }),
      markClean:        ()  => set(s => { s.isDirty = false }),

      // ── History ────────────────────────────────────────────────────────────
      saveHistory: (description) => {
        const { project } = get()
        if (project) {
          useHistoryStore.getState().pushHistory(project, description)
        }
      },

      undo: () => {
        const current = get().project
        const previousState = useHistoryStore.getState().undo(current)
        if (previousState) {
          isUndoRedo = true
          set(s => reconcileUiAfterProjectRestore(s, previousState))
          isUndoRedo = false
        }
      },

      redo: () => {
        const current = get().project
        const nextState = useHistoryStore.getState().redo(current)
        if (nextState) {
          isUndoRedo = true
          set(s => reconcileUiAfterProjectRestore(s, nextState))
          isUndoRedo = false
        }
      },

      // ── Assets ────────────────────────────────────────────────────────────
      addAsset: (a) => set(s => {
        if (!s.project) return
        s.project.assets.push(a)
        s.isDirty = true
      }),
      removeAsset: (id) => set(s => {
        if (!s.project) return
        s.project.assets = s.project.assets.filter(a => a.id !== id)
        s.isDirty = true
      }),

      // ── Time Markers ──────────────────────────────────────────────────────
      addTimeMarker: (time) => set(s => {
        if (!s.project) return
        if (!s.project.timeMarkers) s.project.timeMarkers = []
        s.project.timeMarkers.push({ id: uuid(), time })
        s.isDirty = true
      }),
      removeTimeMarker: (id) => set(s => {
        if (!s.project) return
        s.project.timeMarkers = (s.project.timeMarkers ?? []).filter(m => m.id !== id)
        s.isDirty = true
      }),

      addAudioMarker: (audioId, offset) => set(s => {
        if (!s.project) return
        for (const sc of s.project.scenes) {
          const el = sc.elements.find(e => e.id === audioId)
          if (el && el.type === 'audio') {
            const audio = el as import('../types/editor').AudioElement
            if (!audio.markers) audio.markers = []
            audio.markers.push({ id: uuid(), offset })
            break
          }
        }
        s.isDirty = true
      }),

      removeAudioMarker: (audioId, markerId) => set(s => {
        if (!s.project) return
        for (const sc of s.project.scenes) {
          const el = sc.elements.find(e => e.id === audioId)
          if (el && el.type === 'audio') {
            const audio = el as import('../types/editor').AudioElement
            audio.markers = (audio.markers ?? []).filter(m => m.id !== markerId)
            break
          }
        }
        s.isDirty = true
      }),

      // ── Getters ───────────────────────────────────────────────────────────
      getCurrentScene: () => {
        const { project, currentSceneId } = get()
        if (!project || !currentSceneId) return null
        return project.scenes.find(s => s.id === currentSceneId) ?? null
      },

      getSelectedEls: () => {
        const { project, currentSceneId, selectedIds } = get()
        if (!project || !currentSceneId) return []
        const sc = project.scenes.find(s => s.id === currentSceneId)
        if (!sc) return []
        return sc.elements.filter(e => selectedIds.includes(e.id))
      },

      getTotalDuration: () => {
        const { project } = get()
        if (!project) return 0
        return project.scenes.reduce((sum, s) => sum + s.duration, 0)
      },

      getSceneAtTime: (t) => {
        const { project } = get()
        if (!project || project.scenes.length === 0) return null
        let elapsed = 0
        for (const scene of project.scenes) {
          if (t < elapsed + scene.duration) {
            return { scene, localTime: t - elapsed }
          }
          elapsed += scene.duration
        }
        // Clamp to last scene's final frame (handles t === totalDuration exactly)
        const last = project.scenes[project.scenes.length - 1]
        return { scene: last, localTime: last.duration }
      }
    }))
  )
)

// ── Single history-save mechanism (debounced project subscriber) ──────────────
// isUndoRedo is set synchronously around undo()/redo() set() calls so the
// subscriber can skip pushing a new history entry for those changes.
let lastProject: Project | null = null
let saveTimeout: NodeJS.Timeout | null = null
let isUndoRedo = false

useEditorStore.subscribe(
  (state) => state.project,
  (project) => {
    if (isUndoRedo) {
      // Undo/redo change — cancel any pending save and update baseline
      if (saveTimeout) clearTimeout(saveTimeout)
      lastProject = project
      return
    }
    if (!project || !lastProject) {
      lastProject = project
      return
    }
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      if (!project || !lastProject) return
      const currentStr = JSON.stringify(project)
      if (currentStr !== JSON.stringify(lastProject)) {
        // Push the PRE-edit baseline so a single undo restores the previous state.
        useHistoryStore.getState().pushHistory(lastProject, 'Edit')
        lastProject = JSON.parse(currentStr)
      }
    }, 500)
  }
)
