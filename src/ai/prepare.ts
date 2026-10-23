import { FONT_FAMILIES } from '../types/editor'
import { getCaptionPreset } from '../subtitle/presets'
import { normalizeVolumeKeys } from '../utils/volumeKeys'
import { normalizeKeying } from '../utils/keying'
import { isTransitionType, TRANSITION_DURATION } from '../engine/transitions/catalog'
import { getBlock } from '../blocks/registry'
import type { AnimationType, Background, EasingType, ShapeType } from '../types/editor'
import type { AiAnimationSpec, AiEditorCommand, AiElementRef, AiPlan, AiPlanIssue, AiPreparedPlan, AiProjectContext, AiSceneRef, AiTransitionSpec } from './types'
import { normalizeColorValue as normalizeColor } from './parser/colors'

const SHAPE_TYPES = new Set<ShapeType>([
  'rect', 'circle', 'triangle', 'star', 'pentagon', 'hexagon', 'octagon', 'diamond',
  'oval', 'speechBubble', 'roundedSpeech', 'cone', 'cube', 'rect-hand',
  'circle-hand', 'square-hand', 'heart', 'rect-sketch',
])

const DIRECTIONS = new Set(['left', 'right', 'up', 'down'])
const EASINGS = new Set(['smooth', 'linear', 'snappy'])

/** A transition with known type and settings in range, or null for an unknown type. */
function normalizeTransition(tr: AiTransitionSpec): AiTransitionSpec | null {
  if (!isTransitionType(tr.type)) return null
  return {
    type: tr.type,
    duration: tr.type === 'none' ? clampOptional(tr.duration, 0, TRANSITION_DURATION.max) : clampOptional(tr.duration, TRANSITION_DURATION.min, TRANSITION_DURATION.max),
    direction: tr.direction && DIRECTIONS.has(tr.direction) ? tr.direction : undefined,
    speed: clampOptional(tr.speed, 0.25, 3),
    hardness: clampOptional(tr.hardness, 0, 100),
    intensity: clampOptional(tr.intensity, 0, 1),
    softness: clampOptional(tr.softness, 0, 1),
    color: tr.color ? normalizeColor(tr.color) : undefined,
    easing: tr.easing && EASINGS.has(tr.easing) ? tr.easing : undefined,
  }
}
const ANIMATION_TYPES = new Set<AnimationType>([
  'fadeIn', 'fadeOut', 'slideIn', 'slideOut', 'scaleIn', 'scaleOut', 'wipeIn', 'wipeOut', 'zoomIn', 'zoomOut',
  'typewriter', 'typewriterChars', 'typewriterWords', 'textBounceIn', 'textFade',
  'pulse', 'bounceLoop', 'rotateLoop', 'fadeLoop', 'colorPulse',
])
const MOVE_DIRECTIONS = new Set(['left', 'right', 'top', 'bottom', 'topLeft', 'topRight', 'bottomRight', 'bottomLeft'])

/** Aliases defined by earlier commands in the plan ("it" = the element a previous command added). */
interface Aliases {
  scenes: Set<string>
  elements: Set<string>
}

export function prepareAiPlan(plan: AiPlan, context: AiProjectContext): AiPreparedPlan {
  const issues: AiPlanIssue[] = []
  const commands: AiEditorCommand[] = []
  const aliases: Aliases = { scenes: new Set(), elements: new Set() }

  plan.commands.forEach((command, index) => {
    const prepared = prepareCommand(command, context, index, issues, aliases)
    if (!prepared) return
    commands.push(prepared)
    if ('alias' in prepared && prepared.alias) {
      const isScene = prepared.type === 'addScene' || prepared.type === 'duplicateScene' || prepared.type === 'splitScene'
      if (isScene) aliases.scenes.add(prepared.alias)
      else aliases.elements.add(prepared.alias)
    }
  })

  return {
    plan: {
      ...plan,
      commands,
      needsConfirmation: true,
    },
    issues,
  }
}

function prepareCommand(
  command: AiEditorCommand,
  context: AiProjectContext,
  index: number,
  issues: AiPlanIssue[],
  aliases: Aliases
): AiEditorCommand | null {
  if (!sceneResolvable(command as AiSceneRef, context, aliases)) {
    return drop(issues, index, `${command.type} removed because its scene could not be found.`)
  }
  switch (command.type) {
    case 'addText':
      return {
        ...command,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        x: clampOptionalPosition(command.x, context.project.width),
        y: clampOptionalPosition(command.y, context.project.height),
        width: clampOptionalDimension(command.width, context.project.width),
        height: clampOptionalDimension(command.height, context.project.height),
        fontSize: clampOptional(command.fontSize, 8, 260),
        fontFamily: normalizeFontFamily(command.fontFamily),
        color: normalizeColor(command.color),
        text: command.text.slice(0, 2000),
        animation: normalizeAnimation(command.animation),
      }

    case 'addShape': {
      const shapeType = SHAPE_TYPES.has(command.shapeType) ? command.shapeType : 'rect'
      if (shapeType !== command.shapeType) {
        issues.push({ level: 'warning', commandIndex: index, message: `Unsupported shape changed to rectangle.` })
      }
      return {
        ...command,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        shapeType,
        x: clampOptionalPosition(command.x, context.project.width),
        y: clampOptionalPosition(command.y, context.project.height),
        width: clampOptionalDimension(command.width, context.project.width),
        height: clampOptionalDimension(command.height, context.project.height),
        fill: normalizeColor(command.fill),
        stroke: normalizeColor(command.stroke),
        strokeWidth: clampOptional(command.strokeWidth, 0, 80),
      }
    }

    case 'addImageFromAsset': {
      const asset = findAsset(context, command, 'image')
      if (!asset) {
        issues.push({ level: 'error', commandIndex: index, message: 'Image command removed because the referenced asset was not found.' })
        return null
      }
      return {
        ...command,
        assetId: asset.id,
        assetName: asset.name,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        x: clampOptionalPosition(command.x, context.project.width),
        y: clampOptionalPosition(command.y, context.project.height),
        width: clampOptionalDimension(command.width, context.project.width),
        height: clampOptionalDimension(command.height, context.project.height),
      }
    }

    case 'addVideoFromAsset': {
      const asset = findAsset(context, command, 'video')
      if (!asset) {
        issues.push({ level: 'error', commandIndex: index, message: 'Video command removed because the referenced asset was not found.' })
        return null
      }
      return {
        ...command,
        assetId: asset.id,
        assetName: asset.name,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        x: clampOptionalPosition(command.x, context.project.width),
        y: clampOptionalPosition(command.y, context.project.height),
        width: clampOptionalDimension(command.width, context.project.width),
        height: clampOptionalDimension(command.height, context.project.height),
        duration: clampOptional(command.duration, 0.1, 120),
      }
    }

    case 'addAudioFromAsset': {
      const asset = findAsset(context, command, 'audio')
      if (!asset) {
        issues.push({ level: 'error', commandIndex: index, message: 'Audio command removed because the referenced asset was not found.' })
        return null
      }
      return {
        ...command,
        assetId: asset.id,
        assetName: asset.name,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        duration: clampOptional(command.duration, 0.1, 3600),
        timelineX: clampOptional(command.timelineX, 0, context.project.totalDuration),
      }
    }

    case 'setBackground':
      return {
        ...command,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        background: normalizeBackground(command.background),
      }

    case 'updateElement':
    case 'styleElement':
      if (!canResolveElement(command, context, aliases)) {
        issues.push({ level: 'error', commandIndex: index, message: `${command.type} removed because no target element could be resolved.` })
        return null
      }
      return {
        ...command,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        patch: normalizePatch(command.patch, context),
      }

    case 'applyMove':
      if (!canResolveElement(command, context, aliases)) {
        issues.push({ level: 'error', commandIndex: index, message: 'Move command removed because no target element could be resolved.' })
        return null
      }
      return {
        ...command,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        direction: MOVE_DIRECTIONS.has(command.direction) ? command.direction : 'left',
        speed: clampOptional(command.speed, 10, 5000),
        delay: clampOptional(command.delay, 0, 60),
        moveOutside: Boolean(command.moveOutside),
      }

    case 'addScene':
      return {
        ...command,
        name: command.name?.slice(0, 80),
        duration: clampOptional(command.duration, 0.5, 120),
        afterSceneId: command.afterSceneId && context.scenes.some(s => s.id === command.afterSceneId) ? command.afterSceneId : undefined,
      }

    case 'setTransition': {
      const transition = normalizeTransition(command.transition)
      if (!transition) return drop(issues, index, `"${command.transition.type}" is not a transition the editor has.`)
      return { ...command, sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues), transition }
    }

    case 'setEndTransition': {
      const transition = normalizeTransition(command.transition)
      if (!transition) return drop(issues, index, `"${command.transition.type}" is not a transition the editor has.`)
      if (transition.type === 'morph') return drop(issues, index, 'Morph needs a next scene, so it cannot end the video.')
      return { ...command, transition }
    }

    case 'removeScene':
    case 'duplicateScene':
      return command

    case 'splitScene':
      return Number.isFinite(command.at) && command.at > 0
        ? { ...command, at: clamp(command.at, 0.1, 3600) }
        : drop(issues, index, 'Split removed because the time is invalid.')

    case 'moveScene':
      return Number.isFinite(command.toIndex)
        ? { ...command, toIndex: clamp(Math.round(command.toIndex), 1, context.project.sceneCount + 20) }
        : drop(issues, index, 'Move removed because the position is invalid.')

    case 'setSceneDuration':
      return Number.isFinite(command.duration)
        ? { ...command, duration: clamp(command.duration, 0.5, 600) }
        : drop(issues, index, 'Duration change removed because the value is invalid.')

    case 'removeElement':
    case 'duplicateElement':
    case 'arrangeElement':
    case 'alignElement':
    case 'removeAnimations':
      return canResolveElement(command, context, aliases)
        ? command
        : drop(issues, index, `${command.type} removed because no target element could be resolved.`)

    case 'groupElements':
    case 'ungroupElements': {
      const targets = command.targets.filter(t => canResolveElement(t, context, aliases))
      if (command.type === 'groupElements' && targets.length < 2) return drop(issues, index, 'Group removed: a group needs at least two items.')
      if (!targets.length) return drop(issues, index, 'Ungroup removed: nothing to ungroup.')
      return { ...command, targets, ...(command.type === 'groupElements' ? { name: command.name?.slice(0, 60) } : {}) }
    }

    case 'setCaptionStyle': {
      if (command.preset && !getCaptionPreset(command.preset)) return drop(issues, index, `There is no "${command.preset}" caption style.`)
      const style = command.style ? { ...command.style } : undefined
      if (style) {
        for (const key of ['color', 'strokeColor', 'activeColor', 'boxColor'] as const) {
          if (style[key] !== undefined) style[key] = normalizeColor(style[key])
        }
        if (style.fontSize !== undefined) style.fontSize = clamp(style.fontSize, 12, 200)
        if (style.strokeWidth !== undefined) style.strokeWidth = clamp(style.strokeWidth, 0, 30)
        if (style.boxOpacity !== undefined) style.boxOpacity = clamp(style.boxOpacity, 0, 1)
        if (style.positionY !== undefined) style.positionY = clamp(style.positionY, 0, 100)
      }
      if (!command.preset && !style && command.enabled === undefined) return drop(issues, index, 'Caption change removed: nothing to change.')
      if (!context.captions?.cues) issues.push({ level: 'warning', commandIndex: index, message: 'There are no captions yet — the style is saved and used when you generate them (Captions).' })
      return { ...command, style }
    }

    case 'arrangeMedia': {
      const targets = command.targets.filter(t => canResolveElement(t, context, aliases))
      if (!targets.length) return drop(issues, index, 'Layout removed: no video or image could be found.')
      if (!['split', 'sideBySide', 'stacked', 'grid'].includes(command.layout)) return drop(issues, index, `There is no "${command.layout}" layout.`)
      return { ...command, targets, gap: clampOptional(command.gap, 0, 200) }
    }

    case 'setCropTrack': {
      if (!canResolveElement(command, context, aliases)) return drop(issues, index, 'Reframe removed: the video could not be found.')
      const unit = (v: number) => clamp(Number.isFinite(v) ? v : 0.5, 0, 1)
      const keys = command.keys
        .filter(k => Number.isFinite(k.t))
        .map(k => ({ t: Math.max(0, k.t), cx: unit(k.cx), cy: unit(k.cy) }))
        .sort((a, b) => a.t - b.t)
        .slice(0, 5000)
      const c = command.crop
      const crop = c && [c.x, c.y, c.w, c.h].every(Number.isFinite)
        ? { w: clamp(c.w, 0.01, 1), h: clamp(c.h, 0.01, 1), x: clamp(c.x, 0, 1 - clamp(c.w, 0.01, 1)), y: clamp(c.y, 0, 1 - clamp(c.h, 0.01, 1)) }
        : undefined
      return { ...command, keys, crop }
    }

    case 'placeMedia': {
      if (!canResolveElement(command, context, aliases)) return drop(issues, index, 'Placement removed: the video or image could not be found.')
      const r = command.region
      const W = context.project.width
      const H = context.project.height
      if (![r?.x, r?.y, r?.width, r?.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) return drop(issues, index, 'Placement removed: the area is invalid.')
      return {
        ...command,
        region: { x: clamp(r.x, -W, W * 2), y: clamp(r.y, -H, H * 2), width: clamp(r.width, 1, W * 3), height: clamp(r.height, 1, H * 3) },
        width: clampOptional(command.width, 1, W * 3),
        height: clampOptional(command.height, 1, H * 3),
        fit: command.fit === 'contain' || command.fit === 'stretch' ? command.fit : 'cover',
      }
    }

    case 'setVolumeKeys': {
      if (!canResolveElement(command, context, aliases)) return drop(issues, index, 'Volume change removed because the audio clip could not be found.')
      const keys = normalizeVolumeKeys(command.keys).slice(0, 4000)
      return { ...command, keys }
    }

    case 'insertBlock':
      return getBlock(command.blockId) ? command : drop(issues, index, `There is no "${command.blockId}" add-on.`)

    case 'updateBlock': {
      const known = context.scenes.some(scene => scene.groups?.some(g => g.id === command.groupId && g.blockId))
      return known ? command : drop(issues, index, 'That group is not an add-on, so it has no settings to change.')
    }

    case 'connectElements': {
      const from = command.from.filter(t => canResolveElement(t, context, aliases))
      const to = command.to?.filter(t => canResolveElement(t, context, aliases))
      if (!from.length || (command.to && !to?.length) || (!command.to && from.length < 2)) {
        return drop(issues, index, 'Connection removed because there was nothing to connect.')
      }
      return { ...command, from, to, color: normalizeColor(command.color), width: clampOptional(command.width, 1, 40) }
    }

    case 'animateSequence': {
      const waves = command.waves.flatMap(wave => {
        const targets = wave.targets.filter(t => canResolveElement(t, context, aliases))
        const animation = normalizeAnimation(wave.animation)
        if (!targets.length || !animation) {
          issues.push({ level: 'warning', commandIndex: index, message: `A ${wave.animation.type} wave was skipped: ${animation ? 'none of its items could be found' : 'that animation is not supported'}.` })
          return []
        }
        return [{
          ...wave,
          targets,
          animation: { ...animation, color: normalizeColor(wave.animation.color) },
          step: clampOptional(wave.step, 0, 10),
          gapBefore: clampOptional(wave.gapBefore, 0, 30),
        }]
      })
      if (!waves.length) return drop(issues, index, 'Sequence removed because none of its items could be found.')
      return {
        ...command,
        waves,
        start: command.start === 'afterLast' ? 'afterLast' : clampOptional(command.start, 0, 600),
        repeat: typeof command.repeat === 'number' ? clamp(command.repeat, 0.1, 600) : Boolean(command.repeat),
        repeatGap: clampOptional(command.repeatGap, 0, 30),
      }
    }

    case 'addAnimation': {
      if (!canResolveElement(command, context, aliases)) return drop(issues, index, 'Animation removed because no target element could be resolved.')
      const animation = normalizeAnimation(command.animation)
      return animation ? { ...command, animation } : drop(issues, index, `Animation "${command.animation.type}" is not supported.`)
    }

    case 'generateStoryboard':
      return {
        ...command,
        scenes: command.scenes.slice(0, 12).map(scene => ({
          ...scene,
          name: scene.name?.slice(0, 80),
          title: scene.title?.slice(0, 200),
          subtitle: scene.subtitle?.slice(0, 300),
          duration: clampOptional(scene.duration, 0.5, 60),
          backgroundColor: normalizeColor(scene.backgroundColor),
        })),
      }
  }
}

function normalizeSceneIndex(sceneIndex: number | undefined, context: AiProjectContext, commandIndex: number, issues: AiPlanIssue[]) {
  if (sceneIndex == null) return undefined
  const next = Math.max(1, Math.min(context.project.sceneCount, Math.round(sceneIndex)))
  if (next !== sceneIndex) {
    issues.push({ level: 'warning', commandIndex, message: `Scene ${sceneIndex} was clamped to Scene ${next}.` })
  }
  return next
}

function findAsset(
  context: AiProjectContext,
  command: { assetId?: string; assetName?: string },
  type: 'image' | 'video' | 'audio'
) {
  const wantedName = cleanAssetName(command.assetName)
  return context.assets.find(item =>
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

function drop(issues: AiPlanIssue[], commandIndex: number, message: string): null {
  issues.push({ level: 'error', commandIndex, message })
  return null
}

function sceneResolvable(ref: AiSceneRef, context: AiProjectContext, aliases: Aliases) {
  if (ref.sceneAlias) return aliases.scenes.has(ref.sceneAlias) || ref.sceneAlias === 'newScene'
  if (ref.sceneId) return context.scenes.some(scene => scene.id === ref.sceneId)
  return true
}

function canResolveElement(command: AiElementRef, context: AiProjectContext, aliases: Aliases) {
  if (command.elementAlias) return aliases.elements.has(command.elementAlias)
  if (command.selected && context.selectedIds.length > 0) return true
  if (command.elementId && context.scenes.some(scene => scene.elements.some(el => el.id === command.elementId))) return true
  if (!command.elementName) return false
  // A scene made earlier in the plan (e.g. a part left by a cut) holds copies that are found by name.
  if (command.sceneAlias) return aliases.scenes.has(command.sceneAlias)

  const scene = command.sceneIndex
    ? context.scenes[Math.max(0, command.sceneIndex - 1)]
    : context.scenes.find(item => item.id === command.sceneId) ?? context.scenes[context.currentSceneIndex - 1]
  return Boolean(scene?.elements.some(el => el.name.toLowerCase() === command.elementName?.toLowerCase()))
}

function normalizePatch(patch: Record<string, unknown>, context: AiProjectContext) {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'number') {
      if (key === 'x') out[key] = clamp(value, 0, context.project.width)
      else if (key === 'y') out[key] = clamp(value, 0, context.project.height)
      else if (key === 'width') out[key] = clamp(value, 20, context.project.width)
      else if (key === 'height') out[key] = clamp(value, 20, context.project.height)
      else if (key === 'opacity') out[key] = clamp(value, 0, 1)
      else if (key === 'fontSize') out[key] = clamp(value, 8, 260)
      else if (key === 'strokeWidth') out[key] = clamp(value, 0, 80)
      else out[key] = Number.isFinite(value) ? value : undefined
    } else if (typeof value === 'string') {
      out[key] = key.toLowerCase().includes('color') || key === 'fill' || key === 'stroke'
        ? normalizeColor(value)
        : value.slice(0, 2000)
    } else if (typeof value === 'boolean') {
      out[key] = value
    } else if (key === 'crop' && isRecord(value)) {
      out[key] = value
    } else if (key === 'keying') {
      out[key] = isRecord(value) ? normalizeKeying(value) : null
    }
  }
  return out
}

function normalizeBackground(background: Background): Background {
  if (background.type === 'solid') {
    return { ...background, color: normalizeColor(background.color) ?? '#111111' }
  }
  if (background.type === 'gradient') {
    return {
      ...background,
      from: normalizeColor(background.from) ?? background.from,
      to: normalizeColor(background.to) ?? background.to,
      via: background.via ? normalizeColor(background.via) ?? background.via : undefined,
    }
  }
  if (background.type === 'animated') {
    return {
      ...background,
      colors: background.colors.map(color => normalizeColor(color) ?? color).slice(0, 4),
    }
  }
  return background
}

function normalizeFontFamily(value?: string) {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  return FONT_FAMILIES.find(font => font.toLowerCase() === normalized)
}

function normalizeAnimation(animation?: AiAnimationSpec): AiAnimationSpec | undefined {
  if (!animation || !ANIMATION_TYPES.has(animation.type)) return undefined
  const easing: EasingType = animation.easing === 'linear' || animation.easing === 'easeIn' || animation.easing === 'easeInOut' || animation.easing === 'bounce'
    ? animation.easing
    : 'easeOut'
  return {
    type: animation.type,
    duration: clampOptional(animation.duration, 0.05, 60),
    delay: clampOptional(animation.delay, 0, 60),
    easing,
    timing: animation.timing === 'onExit' || animation.timing === 'loop' ? animation.timing : 'onEnter',
    direction: animation.direction,
  }
}

function clampOptional(value: number | undefined, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : undefined
}

function clampOptionalPosition(value: number | undefined, projectSize: number) {
  return clampOptional(value, -projectSize * 4, projectSize * 4)
}

function clampOptionalDimension(value: number | undefined, projectSize: number) {
  return clampOptional(value, 20, projectSize * 4)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
