import { FONT_FAMILIES } from '../types/editor'
import type { AnimationType, Background, EasingType, ShapeType, TransitionType } from '../types/editor'
import type { AiAnimationSpec, AiEditorCommand, AiElementRef, AiPlan, AiPlanIssue, AiPreparedPlan, AiProjectContext, AiSceneRef } from './types'
import { normalizeColorValue as normalizeColor } from './parser/colors'

const SHAPE_TYPES = new Set<ShapeType>([
  'rect', 'circle', 'triangle', 'star', 'pentagon', 'hexagon', 'octagon', 'diamond',
  'oval', 'speechBubble', 'roundedSpeech', 'cone', 'cube', 'rect-hand',
  'circle-hand', 'square-hand', 'heart', 'rect-sketch',
])

const TRANSITION_TYPES = new Set<TransitionType>([
  'none', 'fade', 'slide', 'zoom', 'wipe', 'push', 'morph', 'flashBlur', 'flickerShake',
])
const ANIMATION_TYPES = new Set<AnimationType>([
  'fadeIn', 'fadeOut', 'slideIn', 'slideOut', 'scaleIn', 'scaleOut', 'wipeIn', 'wipeOut', 'zoomIn', 'zoomOut',
  'typewriter', 'typewriterChars', 'typewriterWords', 'textBounceIn', 'textFade',
  'pulse', 'bounceLoop', 'rotateLoop', 'fadeLoop',
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
      const type = TRANSITION_TYPES.has(command.transition.type) ? command.transition.type : 'fade'
      return {
        ...command,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        transition: {
          ...command.transition,
          type,
          duration: clampOptional(command.transition.duration, 0, 5),
          speed: clampOptional(command.transition.speed, 0.25, 3),
          hardness: clampOptional(command.transition.hardness, 0, 100),
        },
      }
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
