import type { Background, ShapeType, TransitionType } from '../types/editor'
import type { AiEditorCommand, AiPlan, AiPlanIssue, AiPreparedPlan, AiProjectContext } from './types'

const SHAPE_TYPES = new Set<ShapeType>([
  'rect', 'circle', 'triangle', 'star', 'pentagon', 'hexagon', 'octagon', 'diamond',
  'oval', 'speechBubble', 'roundedSpeech', 'cone', 'cube', 'rect-hand',
  'circle-hand', 'square-hand', 'heart', 'rect-sketch',
])

const TRANSITION_TYPES = new Set<TransitionType>(['none', 'fade', 'slide', 'zoom', 'wipe', 'push', 'morph'])
const MOVE_DIRECTIONS = new Set(['left', 'right', 'top', 'bottom', 'topLeft', 'topRight', 'bottomRight', 'bottomLeft'])
const COLOR_NAMES: Record<string, string> = {
  black: '#111111',
  white: '#ffffff',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#f59e0b',
  purple: '#8b5cf6',
  pink: '#ec4899',
  orange: '#f97316',
}

export function prepareAiPlan(plan: AiPlan, context: AiProjectContext): AiPreparedPlan {
  const issues: AiPlanIssue[] = []
  const commands: AiEditorCommand[] = []

  plan.commands.forEach((command, index) => {
    const prepared = prepareCommand(command, context, index, issues)
    if (prepared) commands.push(prepared)
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
  issues: AiPlanIssue[]
): AiEditorCommand | null {
  switch (command.type) {
    case 'addText':
      return {
        ...command,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        x: clampOptional(command.x, 0, context.project.width),
        y: clampOptional(command.y, 0, context.project.height),
        width: clampOptional(command.width, 20, context.project.width),
        height: clampOptional(command.height, 20, context.project.height),
        fontSize: clampOptional(command.fontSize, 8, 260),
        color: normalizeColor(command.color),
        text: command.text.slice(0, 2000),
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
        x: clampOptional(command.x, 0, context.project.width),
        y: clampOptional(command.y, 0, context.project.height),
        width: clampOptional(command.width, 20, context.project.width),
        height: clampOptional(command.height, 20, context.project.height),
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
        x: clampOptional(command.x, 0, context.project.width),
        y: clampOptional(command.y, 0, context.project.height),
        width: clampOptional(command.width, 20, context.project.width),
        height: clampOptional(command.height, 20, context.project.height),
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
        x: clampOptional(command.x, 0, context.project.width),
        y: clampOptional(command.y, 0, context.project.height),
        width: clampOptional(command.width, 20, context.project.width),
        height: clampOptional(command.height, 20, context.project.height),
        duration: clampOptional(command.duration, 0.1, 120),
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
      if (!canResolveElement(command, context)) {
        issues.push({ level: 'error', commandIndex: index, message: `${command.type} removed because no target element could be resolved.` })
        return null
      }
      return {
        ...command,
        sceneIndex: normalizeSceneIndex(command.sceneIndex, context, index, issues),
        patch: normalizePatch(command.patch, context),
      }

    case 'applyMove':
      if (!canResolveElement(command, context)) {
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
        },
      }
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

function canResolveElement(command: { elementId?: string; elementName?: string; selected?: boolean; sceneIndex?: number; sceneId?: string }, context: AiProjectContext) {
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

function normalizeColor(value?: string) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(trimmed)) return trimmed
  return COLOR_NAMES[trimmed.toLowerCase()]
}

function clampOptional(value: number | undefined, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : undefined
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
