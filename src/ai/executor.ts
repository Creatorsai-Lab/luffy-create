import { v4 as uuid } from 'uuid'
import { getCaptionPreset } from '../subtitle/presets'
import { makeSubtitleTrack, normalizeSubtitleStyle, normalizeSubtitleTrack } from '../subtitle/types'
import { applyMediaLayout, applyPlacement } from '../utils/arrangeMedia'
import type { AssetMeta, EditorElement, ImageElement, MoveDirection, Scene, SceneTransition, ShapeType, VideoElement } from '../types/editor'
import { makeAnimation, makeAudio, makeImage, makeScene, makeShape, makeText, makeVideo } from '../utils/defaults'
import { clampAudioDuration, finitePositiveDuration, remainingTimelineDuration } from '../utils/audioMetadata'
import { computeMoveDelta, durationFromMove } from '../utils/moveAnimation'
import { getBlock } from '../blocks/registry'
import { useEditorStore } from '../store/editorStore'
import { clampAudioVolume } from '../utils/audioEffects'
import { animationsEnd, buildSequence, isLoopType, rowTolerance } from '../utils/stagger'
import { connectionPairs, makeConnector } from '../utils/connectors'
import { normalizeKeying } from '../utils/keying'
import { transitionDef, withDefaults } from '../engine/transitions/catalog'
import { fxDef } from '../engine/fx/catalog'
import { effectStack, makeFx, stackPatch } from '../engine/fx/stack'
import { presetCurve } from '../utils/speedCurve'
import { retimeClip } from '../utils/retime'
import type { AiCommandResult, AiEditorCommand, AiElementRef, AiPlan, AiSceneRef, AiTransitionSpec } from './types'

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
  image: new Set(['cornerRadius', 'brightness', 'contrast', 'saturation', 'blur', 'crop', 'borderColor', 'borderWidth', 'keying']),
  video: new Set(['cornerRadius', 'volume', 'playbackRate', 'muted', 'loop', 'startTime', 'duration', 'timelineX', 'crop', 'borderColor', 'borderWidth', 'punchIn', 'keying']),
  audio: new Set(['volume', 'speed', 'fadeIn', 'fadeOut', 'startTime', 'duration', 'loop']),
  icon: new Set(['iconName', 'color', 'strokeWidth']),
}

export function executeAiPlan(plan: AiPlan, opts: { recordHistory?: boolean } = {}): AiCommandResult[] {
  const store = useEditorStore.getState()
  if (plan.commands.length > 0 && store.project && opts.recordHistory !== false) {
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
    case 'setEndTransition':
      return setEndTransition(command)
    case 'addEffect':
      return addEffect(command)
    case 'removeEffects':
      return removeEffects(command)
    case 'setSpeedCurve':
      return setSpeedCurve(command)
    case 'freezeFrame':
      return freezeFrame(command)
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
    case 'animateSequence':
      return animateSequence(command)
    case 'connectElements':
      return connectElements(command)
    case 'groupElements':
    case 'ungroupElements':
      return groupOrUngroup(command)
    case 'insertBlock':
      return insertBlock(command)
    case 'updateBlock':
      return updateBlock(command)
    case 'setVolumeKeys':
      return setVolumeKeys(command)
    case 'arrangeMedia':
      return arrangeMedia(command)
    case 'placeMedia':
      return placeMedia(command)
    case 'setCropTrack':
      return setCropTrack(command)
    case 'setCaptionStyle':
      return setCaptionStyle(command)
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

/** The transition with its type's defaults under whatever the command set. */
function fullTransition(spec: AiTransitionSpec, previous?: SceneTransition): SceneTransition {
  if (spec.type === 'none') return { type: 'none', duration: spec.duration ?? 0 }
  const set = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined)) as Partial<SceneTransition>
  return { ...withDefaults(spec.type, previous), ...set } as SceneTransition
}

function setTransition(command: Extract<AiEditorCommand, { type: 'setTransition' }>): AiCommandResult {
  const { setTransition } = useEditorStore.getState()
  const scene = requireScene(command)
  setTransition(scene.id, fullTransition(command.transition, scene.transition))
  return { ok: true, message: `Set ${transitionDef(command.transition.type).label} transition on ${scene.name}.`, sceneIds: [scene.id] }
}

function requireMedia(ref: AiElementRef, kinds: Array<'video' | 'image'> = ['video', 'image']) {
  const el = requireElement(ref)
  if (!kinds.includes(el.type as 'video')) throw new Error(`${el.name} is not a ${kinds.join(' or ')}.`)
  return el as VideoElement | ImageElement
}

function addEffect(command: Extract<AiEditorCommand, { type: 'addEffect' }>): AiCommandResult {
  const el = requireMedia(command)
  const fx = makeFx(command.effect, {
    ...(command.intensity != null && { intensity: command.intensity }),
    ...(command.beatSync != null && { beatSync: command.beatSync }),
    ...(command.start != null && { start: command.start }),
    ...(command.end != null && { end: command.end }),
    params: command.params ?? {},
  })
  const current = effectStack(el)
  const next = command.effect === 'look' ? [...current.filter(f => f.type !== 'look'), fx] : [...current, fx]
  useEditorStore.getState().updateElement(el.id, stackPatch(el, next) as Partial<EditorElement>)
  return { ok: true, message: `Added ${fxDef(command.effect).label} to ${el.name}.`, elementIds: [el.id] }
}

function removeEffects(command: Extract<AiEditorCommand, { type: 'removeEffects' }>): AiCommandResult {
  const el = requireMedia(command)
  const current = effectStack(el)
  const next = command.effect ? current.filter(f => f.type !== command.effect) : []
  if (next.length === current.length) throw new Error(`${el.name} has no ${command.effect ? fxDef(command.effect).label + ' ' : ''}effect to remove.`)
  useEditorStore.getState().updateElement(el.id, stackPatch(el, next) as Partial<EditorElement>)
  const removed = current.length - next.length
  return { ok: true, message: `Removed ${removed} effect${removed === 1 ? '' : 's'} from ${el.name}.`, elementIds: [el.id] }
}

function setSpeedCurve(command: Extract<AiEditorCommand, { type: 'setSpeedCurve' }>): AiCommandResult {
  const el = requireMedia(command, ['video']) as VideoElement
  const scene = useEditorStore.getState().project?.scenes.find(sc => sc.elements.some(e => e.id === el.id))
  retimeClip(el, scene, { speedCurve: command.preset === 'none' ? null : presetCurve(command.preset) })
  return { ok: true, message: command.preset === 'none' ? `${el.name} plays at constant speed.` : `Speed ramp on ${el.name}.`, elementIds: [el.id] }
}

function freezeFrame(command: Extract<AiEditorCommand, { type: 'freezeFrame' }>): AiCommandResult {
  const el = requireMedia(command, ['video']) as VideoElement
  const scene = useEditorStore.getState().project?.scenes.find(sc => sc.elements.some(e => e.id === el.id))
  if (command.hold > 0 && command.at > (el.duration ?? 0)) throw new Error(`${el.name} is only ${(el.duration ?? 0).toFixed(1)}s long.`)
  retimeClip(el, scene, { freeze: command.hold > 0 ? { at: command.at, hold: command.hold } : null })
  return { ok: true, message: command.hold > 0 ? `Freeze frame on ${el.name}.` : `Removed the freeze frame from ${el.name}.`, elementIds: [el.id] }
}

function setEndTransition(command: Extract<AiEditorCommand, { type: 'setEndTransition' }>): AiCommandResult {
  const { project, setEndTransition } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  if (command.transition.type === 'none') {
    setEndTransition(undefined)
    return { ok: true, message: 'The video now just stops at the end.' }
  }
  setEndTransition(fullTransition(command.transition, project.endTransition ?? { type: 'fade', duration: 1 }))
  return { ok: true, message: `The video ends with ${transitionDef(command.transition.type).label} to black.` }
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

function groupOrUngroup(command: Extract<AiEditorCommand, { type: 'groupElements' | 'ungroupElements' }>): AiCommandResult {
  const elements = command.targets.map(requireElement)
  const store = useEditorStore.getState()
  const scene = store.project?.scenes.find(sc => sc.elements.some(el => el.id === elements[0].id))
  if (!scene) throw new Error('Could not find the items.')
  if (store.currentSceneId !== scene.id) store.setCurrentScene(scene.id)
  const ids = elements.map(el => el.id)
  if (command.type === 'ungroupElements') {
    useEditorStore.getState().ungroupElements(ids)
    return { ok: true, message: 'Ungrouped.', elementIds: ids }
  }
  const groupId = useEditorStore.getState().groupElements(ids, command.name)
  if (!groupId) throw new Error('A group needs at least two items.')
  const name = useEditorStore.getState().project?.scenes.find(sc => sc.id === scene.id)?.groups?.[groupId]?.name
  return { ok: true, message: `Grouped ${ids.length} items as "${name}".`, elementIds: ids }
}

function insertBlock(command: Extract<AiEditorCommand, { type: 'insertBlock' }>): AiCommandResult {
  const scene = requireScene(command)
  const store = useEditorStore.getState()
  if (store.currentSceneId !== scene.id) store.setCurrentScene(scene.id)
  const groupId = useEditorStore.getState().insertBlock(command.blockId, command.params)
  if (!groupId) throw new Error(`Could not build "${command.blockId}".`)
  const ids = useEditorStore.getState().project?.scenes.find(sc => sc.id === scene.id)?.elements.filter(el => el.groupId === groupId).map(el => el.id) ?? []
  return { ok: true, message: `Added the ${getBlock(command.blockId)?.title ?? command.blockId} add-on (${ids.length} items) to ${scene.name}.`, elementIds: ids, groupId }
}

function updateBlock(command: Extract<AiEditorCommand, { type: 'updateBlock' }>): AiCommandResult {
  const store = useEditorStore.getState()
  const scene = store.project?.scenes.find(sc => sc.groups?.[command.groupId]?.smart)
  if (!scene) throw new Error('Could not find that block.')
  if (store.currentSceneId !== scene.id) store.setCurrentScene(scene.id)
  useEditorStore.getState().rebuildBlock(command.groupId, command.params)
  return { ok: true, message: `Updated ${scene.groups![command.groupId].name}.` }
}

function setCaptionStyle(command: Extract<AiEditorCommand, { type: 'setCaptionStyle' }>): AiCommandResult {
  const project = useEditorStore.getState().project
  if (!project) throw new Error('No project is open.')
  const track = normalizeSubtitleTrack(project.subtitleTracks?.[0] ?? makeSubtitleTrack())
  const preset = command.preset ? getCaptionPreset(command.preset) : undefined
  const style = normalizeSubtitleStyle({
    ...track.style,
    ...preset?.style({ width: project.width, height: project.height }),
    ...command.style,
  })
  useEditorStore.getState().upsertSubtitleTrack({ ...track, style, enabled: command.enabled ?? track.enabled })
  const what = preset ? `the ${preset.label} caption style` : 'the caption style'
  return {
    ok: true,
    message: command.enabled === false ? 'Captions hidden.' : track.cues.length ? `Applied ${what}.` : `Saved ${what}; it is used when you generate captions.`,
  }
}

function arrangeMedia(command: Extract<AiEditorCommand, { type: 'arrangeMedia' }>): AiCommandResult {
  const elements = command.targets.map(requireElement)
  const ids = applyMediaLayout(elements.map(el => el.id), command.layout, { gap: command.gap })
  if (!ids.length) throw new Error('Only unlocked videos and images can be arranged.')
  return { ok: true, message: `Arranged ${ids.length} item${ids.length === 1 ? '' : 's'}.`, elementIds: ids }
}

function setCropTrack(command: Extract<AiEditorCommand, { type: 'setCropTrack' }>): AiCommandResult {
  const el = requireElement(command)
  if (el.type !== 'video') throw new Error(`${el.name} is not a video.`)
  if (el.locked) throw new Error(`${el.name} is locked — unlock it first.`)
  const store = useEditorStore.getState()
  const scene = store.project?.scenes.find(sc => sc.elements.some(e => e.id === el.id))
  if (scene && store.currentSceneId !== scene.id) store.setCurrentScene(scene.id)
  useEditorStore.getState().updateElement(el.id, {
    ...(command.box ? { ...command.box, rotation: 0 } : {}),
    ...(command.crop ? { crop: command.crop } : {}),
    cropKeys: command.keys.length ? command.keys : undefined,
  } as Partial<EditorElement>)
  const project = useEditorStore.getState().project
  if (command.box && project && command.box.x <= 0 && command.box.y <= 0 && command.box.width >= project.width && command.box.height >= project.height) {
    useEditorStore.getState().sendToBack(el.id) // a clip that fills the frame is the backdrop
  }
  return { ok: true, message: command.keys.length ? `Reframed ${el.name} to follow the face.` : `${el.name} no longer follows the face.`, elementIds: [el.id] }
}

function placeMedia(command: Extract<AiEditorCommand, { type: 'placeMedia' }>): AiCommandResult {
  const el = requireElement(command)
  if (el.type !== 'video' && el.type !== 'image') throw new Error(`${el.name} is not a video or image.`)
  const result = applyPlacement(el.id, command)
  if (!result) throw new Error(`${el.name} is locked — unlock it first.`)
  const cropped = result.crop ? ', cropped to fit' : ''
  return { ok: true, message: `Placed ${el.name} at ${Math.round(result.x)}, ${Math.round(result.y)} — ${Math.round(result.width)}×${Math.round(result.height)}${cropped}.`, elementIds: [el.id] }
}

function setVolumeKeys(command: Extract<AiEditorCommand, { type: 'setVolumeKeys' }>): AiCommandResult {
  const el = requireElement(command)
  if (el.type !== 'audio') throw new Error(`${el.name} is not an audio clip.`)
  useEditorStore.getState().updateElement(el.id, { volumeKeys: command.keys.length ? command.keys : undefined } as Partial<EditorElement>)
  return {
    ok: true,
    message: command.keys.length ? `Automated the volume of ${el.name}.` : `Removed volume automation from ${el.name}.`,
    elementIds: [el.id],
  }
}

function connectElements(command: Extract<AiEditorCommand, { type: 'connectElements' }>): AiCommandResult {
  const store = useEditorStore.getState()
  const visual = (el: EditorElement) => el.type !== 'arrow' && el.type !== 'audio'
  const from = command.from.map(requireElement).filter(visual)
  const to = command.to?.map(requireElement).filter(visual)
  const scene = store.project?.scenes.find(sc => sc.elements.some(el => el.id === from[0]?.id))
  if (!scene) throw new Error('Could not find the items to connect.')
  // Chains run left to right (then top to bottom) unless the order was given (the selection order).
  const ordered = command.mode === 'chain' && !command.keepOrder
    ? from.slice().sort((a, b) => a.x - b.x || a.y - b.y)
    : from
  const byId = new Map([...from, ...(to ?? [])].map(el => [el.id, el]))
  const pairs = to
    ? from.flatMap(a => to.filter(b => b.id !== a.id).map(b => [a.id, b.id] as [string, string]))
    : connectionPairs(ordered, command.mode ?? 'chain')
  if (!pairs.length) throw new Error('Nothing to connect.')

  const color = command.color ?? '#9ca3af'
  const width = command.width ?? 2
  const arrows = pairs.map(([a, b]) => makeConnector(byId.get(a)!, byId.get(b)!, {
    stroke: color, arrowHeadColor: color, strokeWidth: width, arrowHead: command.heads === false ? 'none' : 'end',
    pointerLength: Math.max(6, width * 4), pointerWidth: Math.max(6, width * 4),
  }))
  if (store.currentSceneId !== scene.id) store.setCurrentScene(scene.id)
  useEditorStore.getState().addElements(arrows, { behind: command.behind ?? true })
  return { ok: true, message: `Added ${arrows.length} connector${arrows.length === 1 ? '' : 's'}.`, elementIds: arrows.map(a => a.id) }
}

function animateSequence(command: Extract<AiEditorCommand, { type: 'animateSequence' }>): AiCommandResult {
  const { project, updateElement, addAnimation } = useEditorStore.getState()
  if (!project) throw new Error('No project is open.')
  const waves = command.waves.map(wave => ({ wave, elements: wave.targets.map(requireElement).filter(el => el.type !== 'audio') }))
    .filter(w => w.elements.length)
  if (!waves.length) throw new Error('None of the items to animate could be found.')

  const scene = project.scenes.find(sc => sc.elements.some(el => el.id === waves[0].elements[0].id))
  const start = command.start === 'afterLast' ? animationsEnd(scene?.elements ?? []) : command.start ?? 0
  const result = buildSequence(waves.map(({ wave, elements }) => {
    const items = elements.map(el => ({ id: el.id, x: el.x, y: el.y, width: el.width, height: el.height }))
    const type = wave.animation.type
    return {
      items,
      animation: {
        type,
        duration: wave.animation.duration ?? (isLoopType(type) ? 0.4 : 0.5),
        timing: wave.animation.timing === 'onExit' ? 'onExit' as const : undefined,
        easing: wave.animation.easing,
        params: type === 'colorPulse'
          ? { pulseColor: wave.animation.color ?? '#ffd400', pulseCount: 1 }
          : wave.animation.direction ? { direction: wave.animation.direction } : undefined,
      },
      timing: { order: wave.order ?? 'leftToRight', step: wave.step ?? 0.15, together: wave.together ? rowTolerance(items) : 0 },
      gapBefore: wave.gapBefore,
    }
  }), { start, repeat: command.repeat, repeatGap: command.repeatGap })

  // Running it again replaces the earlier animation of the same type instead of stacking another.
  const replaced = new Map<string, Set<string>>()
  for (const { elementId, animation } of result.animations) {
    if (!replaced.has(elementId)) replaced.set(elementId, new Set())
    replaced.get(elementId)!.add(animation.type)
  }
  for (const [elementId, types] of replaced) {
    const el = findElement(useEditorStore.getState().project?.scenes ?? [], elementId)
    if (el?.animations.some(a => types.has(a.type))) {
      updateElement(elementId, { animations: el.animations.filter(a => !types.has(a.type)) } as Partial<EditorElement>)
    }
  }
  for (const { elementId, animation } of result.animations) addAnimation(elementId, animation)

  const count = replaced.size
  return {
    ok: true,
    message: `Animated ${count} item${count === 1 ? '' : 's'} in ${waves.length} wave${waves.length === 1 ? '' : 's'}${result.period ? `, repeating every ${result.period}s` : ''}.`,
    elementIds: [...replaced.keys()],
  }
}

function allElementIds() {
  return useEditorStore.getState().project?.scenes.flatMap(scene => scene.elements.map(el => el.id)) ?? []
}

function resolveElementAlias(command: AiEditorCommand, aliases: Record<string, string>): AiEditorCommand {
  if (command.type === 'groupElements' || command.type === 'ungroupElements' || command.type === 'arrangeMedia') {
    return { ...command, targets: command.targets.map(t => (t.elementAlias && aliases[t.elementAlias] ? { ...t, elementId: aliases[t.elementAlias], elementAlias: undefined } : t)) }
  }
  if (command.type === 'connectElements') {
    const map = (refs: AiElementRef[]) => refs.map(t => (t.elementAlias && aliases[t.elementAlias] ? { ...t, elementId: aliases[t.elementAlias], elementAlias: undefined } : t))
    return { ...command, from: map(command.from), to: command.to && map(command.to) }
  }
  if (command.type === 'animateSequence') {
    return {
      ...command,
      waves: command.waves.map(wave => ({
        ...wave,
        targets: wave.targets.map(t => (t.elementAlias && aliases[t.elementAlias] ? { ...t, elementId: aliases[t.elementAlias], elementAlias: undefined } : t)),
      })),
    }
  }
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
    // null removes the green screen / cut-out.
    else if (key === 'keying') out[key] = value && typeof value === 'object' ? normalizeKeying(value as Record<string, unknown>) : undefined
  }
  if (typeof out.punchIn === 'number') out.punchIn = Math.max(1, Math.min(1.5, out.punchIn))
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
