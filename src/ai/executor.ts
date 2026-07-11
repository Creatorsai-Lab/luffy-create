import { v4 as uuid } from 'uuid'
import type { AssetMeta, EditorElement, MoveDirection, Scene, ShapeType } from '../types/editor'
import { makeImage, makeScene, makeShape, makeText, makeVideo } from '../utils/defaults'
import { computeMoveDelta, durationFromMove } from '../utils/moveAnimation'
import { useEditorStore } from '../store/editorStore'
import type { AiCommandResult, AiEditorCommand, AiElementRef, AiPlan, AiSceneRef } from './types'

const SHAPE_TYPES: Set<ShapeType> = new Set([
  'rect', 'circle', 'triangle', 'star', 'pentagon', 'hexagon', 'octagon', 'diamond',
  'oval', 'speechBubble', 'roundedSpeech', 'cone', 'cube', 'rect-hand',
  'circle-hand', 'square-hand', 'heart', 'rect-sketch',
])

const BASE_PATCH_KEYS = new Set([
  'x', 'y', 'width', 'height', 'rotation', 'opacity', 'name', 'visible', 'locked',
])

const TYPE_PATCH_KEYS: Record<string, Set<string>> = {
  text: new Set(['content', 'fontSize', 'fontFamily', 'fontWeight', 'italic', 'color', 'align', 'lineHeight', 'letterSpacing', 'underline']),
  shape: new Set(['shapeType', 'fill', 'stroke', 'strokeWidth', 'cornerRadius', 'depth', 'faceColor']),
  image: new Set(['cornerRadius', 'brightness', 'contrast', 'saturation', 'blur', 'crop']),
  video: new Set(['cornerRadius', 'volume', 'playbackRate', 'muted', 'loop', 'startTime', 'duration', 'timelineX', 'crop']),
  icon: new Set(['iconName', 'color', 'strokeWidth']),
}

export function executeAiPlan(plan: AiPlan): AiCommandResult[] {
  const store = useEditorStore.getState()
  if (plan.commands.length > 0 && store.project) {
    store.saveHistory(`AI: ${plan.summary.slice(0, 80)}`)
  }

  const results: AiCommandResult[] = []
  const sceneAliases: Record<string, string> = {}
  for (const command of plan.commands) {
    try {
      const resolvedCommand = resolveSceneAlias(command, sceneAliases)
      const result = executeAiCommand(resolvedCommand)
      if (command.type === 'addScene' && command.alias && result.sceneIds?.[0]) {
        sceneAliases[command.alias] = result.sceneIds[0]
      }
      results.push(result)
    } catch (error) {
      results.push({ ok: false, message: error instanceof Error ? error.message : 'Command failed.' })
    }
  }
  return results
}

function executeAiCommand(command: AiEditorCommand): AiCommandResult {
  switch (command.type) {
    case 'addText':
      return addText(command)
    case 'addShape':
      return addShape(command)
    case 'addImageFromAsset':
      return addImageFromAsset(command)
    case 'addVideoFromAsset':
      return addVideoFromAsset(command)
    case 'setBackground':
      return setBackground(command)
    case 'updateElement':
    case 'styleElement':
      return patchElement(command)
    case 'applyMove':
      return applyMove(command)
    case 'addScene':
      return addScene(command)
    case 'setTransition':
      return setTransition(command)
    case 'generateStoryboard':
      return generateStoryboard(command)
  }
}

function addText(command: Extract<AiEditorCommand, { type: 'addText' }>): AiCommandResult {
  const scene = requireScene(command)
  const el = makeText(0, 0)
  const width = command.width ?? el.width
  const height = command.height ?? el.height
  Object.assign(el, {
    name: command.name ?? el.name,
    content: command.text,
    width,
    height,
    x: command.x ?? centerX(scene, width),
    y: command.y ?? centerY(scene, height),
    fontSize: command.fontSize ?? el.fontSize,
    color: command.color ?? el.color,
    align: command.align ?? el.align,
  })
  addToScene(scene, el, 'text')
  return { ok: true, message: `Added text to ${scene.name}.`, elementIds: [el.id], sceneIds: [scene.id] }
}

function addShape(command: Extract<AiEditorCommand, { type: 'addShape' }>): AiCommandResult {
  const scene = requireScene(command)
  const shapeType = SHAPE_TYPES.has(command.shapeType) ? command.shapeType : 'rect'
  const el = makeShape(shapeType, 0, 0)
  const width = command.width ?? el.width
  const height = command.height ?? el.height
  Object.assign(el, {
    name: command.name ?? el.name,
    width,
    height,
    x: command.x ?? centerX(scene, width),
    y: command.y ?? centerY(scene, height),
    fill: command.fill ?? el.fill,
    stroke: command.stroke ?? el.stroke,
    strokeWidth: command.strokeWidth ?? el.strokeWidth,
  })
  addToScene(scene, el, 'shapes')
  return { ok: true, message: `Added ${shapeType} to ${scene.name}.`, elementIds: [el.id], sceneIds: [scene.id] }
}

function addImageFromAsset(command: Extract<AiEditorCommand, { type: 'addImageFromAsset' }>): AiCommandResult {
  const { project } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  const scene = requireScene(command)
  const asset = findAsset(project.assets, command, 'image')
  if (!asset) throw new Error('Could not find the requested image asset.')

  const width = command.width ?? 480
  const height = command.height ?? 270
  const el = makeImage(command.x ?? centerX(scene, width), command.y ?? centerY(scene, height), asset.path, asset.id, width, height)
  el.name = command.name ?? asset.name
  addToScene(scene, el, 'upload')
  return { ok: true, message: `Added image to ${scene.name}.`, elementIds: [el.id], sceneIds: [scene.id] }
}

function addVideoFromAsset(command: Extract<AiEditorCommand, { type: 'addVideoFromAsset' }>): AiCommandResult {
  const { project } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  const scene = requireScene(command)
  const asset = findAsset(project.assets, command, 'video')
  if (!asset) throw new Error('Could not find the requested video asset.')

  const width = command.width ?? 640
  const height = command.height ?? 360
  const duration = Math.max(0.1, command.duration ?? asset.duration ?? 10)
  const el = makeVideo(command.x ?? centerX(scene, width), command.y ?? centerY(scene, height), asset.path, asset.id, width, height, duration)
  el.name = command.name ?? asset.name
  addToScene(scene, el, 'video')
  return { ok: true, message: `Added video to ${scene.name}.`, elementIds: [el.id], sceneIds: [scene.id] }
}

function setBackground(command: Extract<AiEditorCommand, { type: 'setBackground' }>): AiCommandResult {
  const { project, setBackground } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  const scene = requireScene(command)
  const bg = { ...command.background } as Record<string, unknown>
  if (bg.type === 'image' && !bg.src && typeof bg.assetId === 'string') {
    const asset = project.assets.find(item => item.id === bg.assetId && item.type === 'image')
    if (!asset) throw new Error('Could not find the requested background image asset.')
    bg.src = asset.path
  }
  setBackground(scene.id, bg as unknown as Parameters<typeof setBackground>[1])
  return { ok: true, message: `Updated background for ${scene.name}.`, sceneIds: [scene.id] }
}

function patchElement(command: Extract<AiEditorCommand, { type: 'updateElement' | 'styleElement' }>): AiCommandResult {
  const { updateElement, selectElement, setActivePanel } = useEditorStore.getState()
  const el = requireElement(command)
  const patch = sanitizePatch(el, command.patch)
  if (Object.keys(patch).length === 0) throw new Error('No supported properties were provided.')
  updateElement(el.id, patch as Partial<EditorElement>)
  selectElement(el.id, false)
  setActivePanel(panelForElement(el.type))
  return { ok: true, message: `Updated ${el.name}.`, elementIds: [el.id] }
}

function applyMove(command: Extract<AiEditorCommand, { type: 'applyMove' }>): AiCommandResult {
  const { project, updateElement, selectElement, setActivePanel } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  const el = requireElement(command)
  const direction = command.direction as MoveDirection
  const speed = Math.max(1, command.speed ?? 420)
  const moveOutside = command.moveOutside ?? false
  const delta = computeMoveDelta(project, el, direction, moveOutside)
  const anim = {
    id: uuid(),
    type: 'move' as const,
    timing: 'onEnter' as const,
    startTime: 0,
    duration: durationFromMove(delta.deltaX, delta.deltaY, speed),
    delay: Math.max(0, command.delay ?? 0),
    easing: 'linear' as const,
    params: {
      moveDirection: direction,
      deltaX: delta.deltaX,
      deltaY: delta.deltaY,
      speed,
      moveOutside,
    },
  }
  updateElement(el.id, { animations: [...el.animations.filter(item => item.type !== 'move'), anim] } as Partial<EditorElement>)
  selectElement(el.id, false)
  setActivePanel('move')
  return { ok: true, message: `Applied move animation to ${el.name}.`, elementIds: [el.id] }
}

function addScene(command: Extract<AiEditorCommand, { type: 'addScene' }>): AiCommandResult {
  const store = useEditorStore.getState()
  const before = store.project?.scenes.map(scene => scene.id) ?? []
  store.addScene()
  const next = useEditorStore.getState()
  const scene = next.project?.scenes.find(item => !before.includes(item.id))
  if (!scene) throw new Error('Could not create scene.')
  next.updateScene(scene.id, {
    name: command.name ?? scene.name,
    duration: Math.max(0.5, command.duration ?? scene.duration),
  })
  return { ok: true, message: `Added ${command.name ?? scene.name}.`, sceneIds: [scene.id] }
}

function setTransition(command: Extract<AiEditorCommand, { type: 'setTransition' }>): AiCommandResult {
  const { setTransition } = useEditorStore.getState()
  const scene = requireScene(command)
  const tr = command.transition
  setTransition(scene.id, {
    type: tr.type,
    duration: Math.max(0, tr.duration ?? 0.8),
    direction: tr.direction,
  })
  return { ok: true, message: `Set ${tr.type} transition on ${scene.name}.`, sceneIds: [scene.id] }
}

function generateStoryboard(command: Extract<AiEditorCommand, { type: 'generateStoryboard' }>): AiCommandResult {
  if (!useEditorStore.getState().project) throw new Error('No project is open.')
  const created: string[] = []
  for (const item of command.scenes.slice(0, 12)) {
    const scene = makeScene((useEditorStore.getState().project?.scenes.length ?? 0) + 1)
    scene.name = item.name ?? scene.name
    scene.duration = Math.max(0.5, item.duration ?? scene.duration)
    if (item.backgroundColor) scene.background = { type: 'solid', color: item.backgroundColor }
    useEditorStore.setState(state => {
      if (!state.project) return
      state.project.scenes.push(scene)
      state.currentSceneId = scene.id
      state.isDirty = true
    })
    created.push(scene.id)
    if (item.title) {
      addText({ type: 'addText', sceneId: scene.id, text: item.title, fontSize: 64, y: 320 })
    }
    if (item.subtitle) {
      addText({ type: 'addText', sceneId: scene.id, text: item.subtitle, fontSize: 34, y: 430 })
    }
  }
  return { ok: true, message: `Created ${created.length} storyboard scenes.`, sceneIds: created }
}

function requireScene(ref: AiSceneRef): Scene {
  const { project, currentSceneId } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  if (ref.sceneAlias) throw new Error(`Could not resolve scene alias "${ref.sceneAlias}".`)
  const scene = ref.sceneId
    ? project.scenes.find(item => item.id === ref.sceneId)
    : ref.sceneIndex != null
      ? project.scenes[Math.max(0, ref.sceneIndex - 1)]
      : project.scenes.find(item => item.id === currentSceneId)
  if (!scene) throw new Error('Could not resolve the target scene.')
  return scene
}

function resolveSceneAlias(command: AiEditorCommand, sceneAliases: Record<string, string>): AiEditorCommand {
  if (!('sceneAlias' in command) || !command.sceneAlias) return command
  const sceneId = sceneAliases[command.sceneAlias]
  if (!sceneId) throw new Error(`Could not resolve scene alias "${command.sceneAlias}".`)
  return { ...command, sceneId, sceneIndex: undefined }
}

function requireElement(ref: AiElementRef): EditorElement {
  const { project, currentSceneId, selectedIds } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  if (ref.selected) {
    const selected = findElement(project.scenes, selectedIds[0])
    if (selected) return selected
  }
  if (ref.elementId) {
    const found = findElement(project.scenes, ref.elementId)
    if (found) return found
  }
  if (ref.elementName) {
    const scene = requireScene({ sceneId: ref.sceneId, sceneIndex: ref.sceneIndex })
    const scoped = scene.elements.find(el => el.name.toLowerCase() === ref.elementName?.toLowerCase())
    if (scoped) return scoped
  }
  const current = project.scenes.find(scene => scene.id === currentSceneId)
  if (current && selectedIds[0]) {
    const selected = current.elements.find(el => el.id === selectedIds[0])
    if (selected) return selected
  }
  throw new Error('Could not resolve the target element.')
}

function addToScene(scene: Scene, el: EditorElement, panel: ReturnType<typeof panelForElement>) {
  const store = useEditorStore.getState()
  store.setCurrentScene(scene.id)
  useEditorStore.getState().addElement(el)
  useEditorStore.getState().selectElement(el.id, false)
  useEditorStore.getState().setActivePanel(panel)
}

function sanitizePatch(el: EditorElement, patch: Record<string, unknown>) {
  const allowed = new Set([...BASE_PATCH_KEYS, ...(TYPE_PATCH_KEYS[el.type] ?? [])])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue
    if (typeof value === 'number') out[key] = Number.isFinite(value) ? value : undefined
    else if (typeof value === 'string' || typeof value === 'boolean') out[key] = value
    else if (key === 'crop' && value && typeof value === 'object') out[key] = value
  }
  return out
}

function findElement(scenes: Scene[], id?: string) {
  if (!id) return null
  for (const scene of scenes) {
    const found = scene.elements.find(el => el.id === id)
    if (found) return found
  }
  return null
}

function findAsset(
  assets: AssetMeta[],
  command: { assetId?: string; assetName?: string },
  type: 'image' | 'video' | 'audio'
) {
  const wantedName = cleanAssetName(command.assetName)
  return assets.find(item =>
    item.type === type &&
    (
      item.id === command.assetId ||
      Boolean(wantedName && (
        item.name.toLowerCase() === wantedName ||
        item.filename.toLowerCase() === wantedName
      ))
    )
  )
}

function cleanAssetName(value?: string) {
  return value?.trim().replace(/^[`'"]?@?/, '').replace(/[`'"]$/, '').toLowerCase()
}

function centerX(scene: Scene, width: number) {
  const { project } = useEditorStore.getState()
  return Math.round(((project?.width ?? 1920) - width) / 2)
}

function centerY(_scene: Scene, height: number) {
  const { project } = useEditorStore.getState()
  return Math.round(((project?.height ?? 1080) - height) / 2)
}

function panelForElement(type: EditorElement['type']) {
  if (type === 'text') return 'text'
  if (type === 'shape') return 'shapes'
  if (type === 'image') return 'upload'
  if (type === 'video') return 'video'
  if (type === 'audio') return 'audio'
  if (type === 'icon') return 'icons'
  if (type === 'latex') return 'latex'
  if (type === 'counter') return 'counter'
  if (type === 'chart') return 'charts'
  if (type === 'table') return 'table'
  if (type === 'code') return 'code'
  return 'layers'
}
