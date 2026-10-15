import { v4 as uuid } from 'uuid'
import type { AssetMeta, EditorElement, MoveDirection, Scene, ShapeType } from '../types/editor'
import { makeAnimation, makeAudio, makeImage, makeScene, makeShape, makeText, makeVideo } from '../utils/defaults'
import { clampAudioDuration, finitePositiveDuration, remainingTimelineDuration } from '../utils/audioMetadata'
import { computeMoveDelta, durationFromMove } from '../utils/moveAnimation'
import { useEditorStore } from '../store/editorStore'
import { clampAudioVolume } from '../utils/audioEffects'
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
  shape: new Set(['shapeType', 'fill', 'stroke', 'strokeWidth', 'cornerRadius', 'rotateX', 'rotateY', 'rotateZ']),
  image: new Set(['cornerRadius', 'brightness', 'contrast', 'saturation', 'blur', 'crop', 'borderColor', 'borderWidth']),
  video: new Set(['cornerRadius', 'volume', 'playbackRate', 'muted', 'loop', 'startTime', 'duration', 'timelineX', 'crop', 'borderColor', 'borderWidth']),
  audio: new Set(['volume', 'speed', 'fadeIn', 'fadeOut', 'startTime', 'duration', 'loop']),
  icon: new Set(['iconName', 'color', 'strokeWidth']),
}

export function executeAiPlan(plan: AiPlan): AiCommandResult[] {
  const store = useEditorStore.getState()
  if (plan.commands.length > 0 && store.project) {
    store.saveHistory(`AI: ${plan.summary.slice(0, 80)}`)
  }

  const results: AiCommandResult[] = []
  const sceneAliases: Record<string, string> = {}
  const elementAliases: Record<string, string> = {}
  for (const command of plan.commands) {
    try {
      const resolvedCommand = resolveElementAlias(resolveSceneAlias(command, sceneAliases), elementAliases)
      const result = executeAiCommand(resolvedCommand)
      if ((command.type === 'addScene' || command.type === 'duplicateScene' || (command.type === 'splitScene' && command.alias)) && result.sceneIds?.[0]) {
        // duplicateScene and splitScene report [original, new part]; the alias names the new part.
        const createdSceneId = result.sceneIds[command.type === 'addScene' ? 0 : 1] ?? result.sceneIds[0]
        sceneAliases[command.alias ?? 'newScene'] = createdSceneId
        sceneAliases.newScene ??= createdSceneId
      } else if ('alias' in command && command.alias && result.elementIds?.[0]) {
        elementAliases[command.alias] = result.elementIds[result.elementIds.length - 1]
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
    case 'addAudioFromAsset':
      return addAudioFromAsset(command)
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
    case 'removeScene':
      return removeScene(command)
    case 'duplicateScene':
      return duplicateScene(command)
    case 'splitScene':
      return splitScene(command)
    case 'moveScene':
      return moveScene(command)
    case 'setSceneDuration':
      return setSceneDuration(command)
    case 'removeElement':
      return removeElement(command)
    case 'duplicateElement':
      return duplicateElement(command)
    case 'arrangeElement':
      return arrangeElement(command)
    case 'alignElement':
      return alignElement(command)
    case 'addAnimation':
      return addAnimation(command)
    case 'removeAnimations':
      return removeAnimations(command)
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
    fontFamily: command.fontFamily ?? el.fontFamily,
    fontWeight: command.fontWeight ?? el.fontWeight,
    color: command.color ?? el.color,
    align: command.align ?? el.align,
  })
  if (command.animation) {
    el.animations = [{
      id: uuid(),
      type: command.animation.type,
      timing: 'onEnter',
      startTime: 0,
      duration: Math.max(0.05, command.animation.duration ?? 0.8),
      delay: Math.max(0, command.animation.delay ?? 0),
      easing: command.animation.easing ?? 'easeOut',
    }]
  }
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

function addAudioFromAsset(command: Extract<AiEditorCommand, { type: 'addAudioFromAsset' }>): AiCommandResult {
  const { project } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  const scene = requireScene(command)
  const asset = findAsset(project.assets, command, 'audio')
  if (!asset) throw new Error('Could not find the requested audio asset.')

  const timelineX = Math.max(0, command.timelineX ?? 0)
  const duration = clampAudioDuration(
    command.duration ?? finitePositiveDuration(asset.duration) ?? 0.1,
    remainingTimelineDuration(totalProjectDuration(project), sceneStartTime(project, scene) + timelineX)
  )
  const el = makeAudio(asset.path, asset.id, duration)
  el.name = command.name ?? asset.name
  el.x = timelineX
  addToScene(scene, el, 'audio')
  return { ok: true, message: `Added audio to ${scene.name}.`, elementIds: [el.id], sceneIds: [scene.id] }
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
  // Changing speed keeps the same stretch of source media, like the Video/Audio panels do.
  if (el.type === 'video' && typeof patch.playbackRate === 'number' && patch.duration == null) {
    const rate = Math.max(0.25, Math.min(4, patch.playbackRate))
    patch.playbackRate = rate
    patch.duration = Math.max(0.1, ((el.duration ?? el.sourceDuration ?? 10) * (el.playbackRate || 1)) / rate)
  }
  if (el.type === 'audio' && typeof patch.speed === 'number' && patch.duration == null) {
    const speed = Math.max(0.25, Math.min(2, patch.speed))
    patch.speed = speed
    patch.duration = Math.max(0.1, (el.duration * (el.speed ?? 1)) / speed)
  }
  if (el.type === 'audio' && typeof patch.volume === 'number') patch.volume = clampAudioVolume(patch.volume)
  if (el.type === 'video' && typeof patch.volume === 'number') patch.volume = Math.max(0, Math.min(1, patch.volume))
  if ((el.type === 'video' || el.type === 'audio') && typeof patch.startTime === 'number') patch.startTime = Math.max(0, patch.startTime)
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
  setActivePanel('motion')
  return { ok: true, message: `Applied move animation to ${el.name}.`, elementIds: [el.id] }
}

function addScene(command: Extract<AiEditorCommand, { type: 'addScene' }>): AiCommandResult {
  const store = useEditorStore.getState()
  const before = store.project?.scenes.map(scene => scene.id) ?? []
  if (command.afterSceneId && before.includes(command.afterSceneId)) store.addSceneAfter(command.afterSceneId)
  else store.addScene()
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
    speed: tr.speed,
    hardness: tr.hardness,
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

function removeScene(command: Extract<AiEditorCommand, { type: 'removeScene' }>): AiCommandResult {
  const { project, removeScene } = useEditorStore.getState()
  const scene = requireScene(command)
  if ((project?.scenes.length ?? 0) <= 1) throw new Error('Cannot delete the last scene.')
  removeScene(scene.id)
  return { ok: true, message: `Deleted ${scene.name}.`, sceneIds: [scene.id] }
}

function duplicateScene(command: Extract<AiEditorCommand, { type: 'duplicateScene' }>): AiCommandResult {
  const scene = requireScene(command)
  const before = useEditorStore.getState().project?.scenes.map(s => s.id) ?? []
  useEditorStore.getState().duplicateScene(scene.id)
  const copy = useEditorStore.getState().project?.scenes.find(s => !before.includes(s.id))
  if (!copy) throw new Error(`Could not duplicate ${scene.name}.`)
  return { ok: true, message: `Duplicated ${scene.name}.`, sceneIds: [scene.id, copy.id] }
}

function splitScene(command: Extract<AiEditorCommand, { type: 'splitScene' }>): AiCommandResult {
  const scene = requireScene(command)
  if (command.at <= 0.1 || command.at >= scene.duration - 0.1) {
    throw new Error(`Cannot split ${scene.name} at ${command.at}s (it is ${scene.duration}s long).`)
  }
  const before = useEditorStore.getState().project?.scenes.map(s => s.id) ?? []
  useEditorStore.getState().splitScene(scene.id, command.at)
  const second = useEditorStore.getState().project?.scenes.find(s => !before.includes(s.id))
  if (!second) throw new Error(`Could not split ${scene.name}.`)
  return { ok: true, message: `Split ${scene.name} at ${command.at}s.`, sceneIds: [scene.id, second.id] }
}

function moveScene(command: Extract<AiEditorCommand, { type: 'moveScene' }>): AiCommandResult {
  const { project, reorderScenes } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  const scene = requireScene(command)
  const from = project.scenes.findIndex(s => s.id === scene.id)
  const to = Math.max(0, Math.min(project.scenes.length - 1, command.toIndex - 1))
  if (from !== to) reorderScenes(from, to)
  return { ok: true, message: `Moved ${scene.name} to position ${to + 1}.`, sceneIds: [scene.id] }
}

function setSceneDuration(command: Extract<AiEditorCommand, { type: 'setSceneDuration' }>): AiCommandResult {
  const scene = requireScene(command)
  useEditorStore.getState().updateScene(scene.id, { duration: Math.max(0.5, command.duration) })
  return { ok: true, message: `${scene.name} is now ${command.duration}s long.`, sceneIds: [scene.id] }
}

function removeElement(command: Extract<AiEditorCommand, { type: 'removeElement' }>): AiCommandResult {
  const el = requireElement(command)
  const store = useEditorStore.getState()
  store.deselectAll()
  store.removeElement(el.id)
  return { ok: true, message: `Deleted ${el.name}.`, elementIds: [el.id] }
}

function duplicateElement(command: Extract<AiEditorCommand, { type: 'duplicateElement' }>): AiCommandResult {
  const el = requireElement(command)
  const before = new Set(allElementIds())
  useEditorStore.getState().duplicateElement(el.id)
  const copy = allElementIds().find(id => !before.has(id))
  if (!copy) throw new Error(`Could not duplicate ${el.name}.`)
  return { ok: true, message: `Duplicated ${el.name}.`, elementIds: [el.id, copy] }
}

function arrangeElement(command: Extract<AiEditorCommand, { type: 'arrangeElement' }>): AiCommandResult {
  const el = requireElement(command)
  const store = useEditorStore.getState()
  const action = { front: store.bringToFront, back: store.sendToBack, forward: store.bringForward, backward: store.sendBackward }[command.order]
  action(el.id)
  return { ok: true, message: `Moved ${el.name} ${command.order === 'front' || command.order === 'back' ? `to the ${command.order}` : command.order}.`, elementIds: [el.id] }
}

function alignElement(command: Extract<AiEditorCommand, { type: 'alignElement' }>): AiCommandResult {
  const { project, updateElement } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  const el = requireElement(command)
  if (el.type === 'audio') throw new Error(`${el.name} is audio and has no position.`)
  const margin = command.margin ?? 80
  const patch: { x?: number; y?: number } = {}
  if (command.horizontal === 'left') patch.x = margin
  else if (command.horizontal === 'center') patch.x = Math.round((project.width - el.width) / 2)
  else if (command.horizontal === 'right') patch.x = Math.round(project.width - el.width - margin)
  if (command.vertical === 'top') patch.y = margin
  else if (command.vertical === 'middle') patch.y = Math.round((project.height - el.height) / 2)
  else if (command.vertical === 'bottom') patch.y = Math.round(project.height - el.height - margin)
  updateElement(el.id, patch as Partial<EditorElement>)
  return { ok: true, message: `Placed ${el.name} at the ${[command.vertical, command.horizontal].filter(Boolean).join(' ')}.`, elementIds: [el.id] }
}

function addAnimation(command: Extract<AiEditorCommand, { type: 'addAnimation' }>): AiCommandResult {
  const store = useEditorStore.getState()
  const el = requireElement(command)
  const spec = command.animation
  const timing = spec.timing ?? 'onEnter'
  const isZoom = spec.type === 'zoomIn' || spec.type === 'zoomOut'
  store.addAnimation(el.id, {
    ...makeAnimation(),
    type: spec.type,
    timing,
    duration: Math.max(0.05, spec.duration ?? (timing === 'loop' ? 1 : isZoom ? 0.7 : 0.6)),
    delay: Math.max(0, spec.delay ?? 0),
    easing: spec.easing ?? (isZoom ? 'easeInOut' : 'easeOut'),
    params: isZoom
      ? { zoomPosition: 'center', zoomScale: spec.type === 'zoomIn' ? 1.5 : 1 }
      : spec.direction ? { direction: spec.direction } : undefined,
  })
  store.selectElement(el.id, false)
  store.setActivePanel(isZoom ? 'motion' : panelForElement(el.type))
  return { ok: true, message: `Added ${spec.type} to ${el.name}.`, elementIds: [el.id] }
}

function removeAnimations(command: Extract<AiEditorCommand, { type: 'removeAnimations' }>): AiCommandResult {
  const el = requireElement(command)
  useEditorStore.getState().updateElement(el.id, { animations: [] } as Partial<EditorElement>)
  return { ok: true, message: `Removed animations from ${el.name}.`, elementIds: [el.id] }
}

function allElementIds() {
  return useEditorStore.getState().project?.scenes.flatMap(scene => scene.elements.map(el => el.id)) ?? []
}

function resolveElementAlias(command: AiEditorCommand, aliases: Record<string, string>): AiEditorCommand {
  if (!('elementAlias' in command) || !command.elementAlias) return command
  const elementId = aliases[command.elementAlias]
  if (!elementId) throw new Error('Could not find the item created earlier in this plan.')
  return { ...command, elementId, elementAlias: undefined }
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
  const sceneId = sceneAliases[command.sceneAlias] ??
    (command.sceneAlias === 'newScene' ? useEditorStore.getState().currentSceneId ?? undefined : undefined)
  if (!sceneId) throw new Error(`Could not resolve scene alias "${command.sceneAlias}".`)
  return { ...command, sceneId, sceneIndex: undefined, sceneAlias: undefined }
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
    if (key === 'fontWeight' && value !== 'normal' && value !== 'bold' && value !== 'thin' && value !== 'semibold') continue
    if (key === 'align' && value !== 'left' && value !== 'center' && value !== 'right') continue
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

function totalProjectDuration(project: { scenes: Scene[] }) {
  return project.scenes.reduce((sum, item) => sum + item.duration, 0)
}

function sceneStartTime(project: { scenes: Scene[] }, scene: Scene) {
  let elapsed = 0
  for (const item of project.scenes) {
    if (item.id === scene.id) return elapsed
    elapsed += item.duration
  }
  return 0
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
