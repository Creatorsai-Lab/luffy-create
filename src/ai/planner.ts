import type { AiEditorCommand, AiPlan, AiPlanResult, AiProjectContext, AiSceneRef } from './types'
import { AI_PLAN_JSON_SCHEMA, validateAiPlan } from './schema'

const SYSTEM_PROMPT = [
  'You are an editor command planner for a scene-based video editor.',
  'Return only commands that can be safely applied to the current project.',
  'Return a JSON object that matches the provided schema. Do not return prose outside JSON.',
  'Use 1-based sceneIndex when the user says slide/scene 1, 2, etc.',
  'If the user does not name a scene, use currentSceneIndex from context.',
  'Prefer selected:true when the user says this/selected/current item.',
  'Do not invent asset IDs. Use available asset IDs from context.',
  'Keep positions, sizes, timing, and colors within the project context.',
  'For broad requests, produce a short plan with concrete editor commands rather than vague advice.',
].join('\n')

export async function planAiEdit(prompt: string, context: AiProjectContext): Promise<AiPlanResult> {
  const trimmed = prompt.trim()
  if (!trimmed) throw new Error('Enter a request first.')

  if (window.api.ai?.plan) {
    try {
      const raw = await window.api.ai.plan({
        prompt: trimmed,
        context,
        systemPrompt: SYSTEM_PROMPT,
        schema: AI_PLAN_JSON_SCHEMA,
      })
      return { plan: validateAiPlan(raw), source: 'model' }
    } catch (error) {
      const plan = planLocally(trimmed, context)
      return {
        plan,
        source: 'local',
        warning: error instanceof Error ? error.message : 'Model planner unavailable; used local planner.',
      }
    }
  }

  return { plan: planLocally(trimmed, context), source: 'local' }
}

function planLocally(prompt: string, context: AiProjectContext): AiPlan {
  const lower = prompt.toLowerCase()
  const sceneIndex = readSceneIndex(lower) ?? context.currentSceneIndex
  const wantsAdd = /\b(add|create|insert)\b/.test(lower)
  const size = readSize(lower)
  const commands: AiEditorCommand[] = []
  const createsScene = wantsAdd && /\b(?:new\s+)?(?:scene|slide)\b/.test(lower)
  const targetScene: AiSceneRef = createsScene ? { sceneAlias: 'newScene' } : { sceneIndex }

  if (createsScene) {
    commands.push({
      type: 'addScene',
      alias: 'newScene',
      duration: readNumberAfter(lower, 'duration') ?? undefined,
    })
  }

  if (/\b(square|rectangle|rect)\b/.test(lower) && (wantsAdd || createsScene)) {
    const isSquare = lower.includes('square')
    const width = size?.width ?? (isSquare ? 300 : 420)
    const height = size?.height ?? (isSquare ? width : 260)
    commands.push({
      type: 'addShape',
      ...targetScene,
      shapeType: 'rect',
      width,
      height,
      fill: readColor(prompt) ?? '#6366f1',
    })
  }

  const quotedText = prompt.match(/"([^"]+)"/)?.[1] ?? prompt.match(/'([^']+)'/)?.[1]
  if (/\b(text|title|heading|written)\b/.test(lower) && (wantsAdd || createsScene || quotedText)) {
    commands.push({
      type: 'addText',
      ...targetScene,
      text: quotedText ?? 'New text',
      fontSize: readNumberAfter(lower, 'font size') ?? undefined,
      color: readColor(prompt) ?? undefined,
    })
  }

  const videoAssetName = readAssetName(prompt, context, 'video')
  if ((/\b(video|mp4|webm|mov|avi|mkv|gif)\b/.test(lower) || videoAssetName) && (wantsAdd || createsScene)) {
    commands.push({
      type: 'addVideoFromAsset',
      ...targetScene,
      assetName: videoAssetName ?? undefined,
      width: size?.width,
      height: size?.height,
    })
  }

  const imageAssetName = readAssetName(prompt, context, 'image')
  if ((/\b(image|photo|picture|png|jpe?g|webp)\b/.test(lower) || imageAssetName) && (wantsAdd || createsScene)) {
    commands.push({
      type: 'addImageFromAsset',
      ...targetScene,
      assetName: imageAssetName ?? undefined,
      width: size?.width,
      height: size?.height,
    })
  }

  if (/\b(background|bg)\b/.test(lower)) {
    commands.push({
      type: 'setBackground',
      ...targetScene,
      background: { type: 'solid', color: readColor(prompt) ?? '#111111' },
    })
  }

  if (commands.length > 0) {
    return {
      summary: summarizeLocalCommands(commands, sceneIndex),
      commands,
      needsConfirmation: true,
    }
  }

  if (/\btransition\b/.test(lower)) {
    const type = lower.includes('morph') ? 'morph'
      : lower.includes('fade') ? 'fade'
      : lower.includes('wipe') ? 'wipe'
      : lower.includes('zoom') ? 'zoom'
      : lower.includes('push') ? 'push'
      : 'fade'
    return {
      summary: `Set ${type} transition on Scene ${sceneIndex}.`,
      commands: [{
        type: 'setTransition',
        sceneIndex,
        transition: { type, duration: readNumberAfter(lower, 'duration') ?? 0.8 },
      }],
      needsConfirmation: true,
    }
  }

  if (/\bmove\b/.test(lower)) {
    return {
      summary: 'Apply movement to the selected element.',
      commands: [{
        type: 'applyMove',
        selected: true,
        direction: readMoveDirection(lower),
        speed: readNumberAfter(lower, 'speed') ?? 120,
        delay: readNumberAfter(lower, 'delay') ?? 0,
      }],
      needsConfirmation: true,
    }
  }

  return {
    summary: 'I can turn this into editor commands after the model planner is configured.',
    commands: [],
    needsConfirmation: true,
  }
}

function readSceneIndex(text: string): number | null {
  const match = text.match(/\b(?:scene|slide)\s*(?:number|no\.?)?\s*(\d+)\b/)
  return match ? Math.max(1, Number(match[1])) : null
}

function readSize(text: string): { width: number; height: number } | null {
  const labelled = text.match(/\bwidth\s*(\d{2,5})\b[\s\S]{0,24}?\bhei(?:ght|gh)?\s*(\d{2,5})\b/i)
  if (labelled) return { width: Number(labelled[1]), height: Number(labelled[2]) }

  const match = text.match(/(\d{2,5})\s*(?:px)?\s*(?:x|×|by)\s*(\d{2,5})\s*(?:px)?/)
  if (!match) return null
  return { width: Number(match[1]), height: Number(match[2]) }
}

function readNumberAfter(text: string, label: string): number | null {
  const idx = text.indexOf(label)
  if (idx < 0) return null
  const match = text.slice(idx + label.length).match(/[-+]?\d*\.?\d+/)
  return match ? Number(match[0]) : null
}

function readColor(text: string): string | null {
  const hex = text.match(/#[0-9a-f]{3,8}\b/i)?.[0]
  if (hex) return hex
  const lower = text.toLowerCase()
  const colors: Record<string, string> = {
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
  return Object.entries(colors).find(([name]) => lower.includes(name))?.[1] ?? null
}

function readMoveDirection(text: string): 'left' | 'right' | 'top' | 'bottom' | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft' {
  if (text.includes('top left')) return 'topLeft'
  if (text.includes('top right')) return 'topRight'
  if (text.includes('bottom right')) return 'bottomRight'
  if (text.includes('bottom left')) return 'bottomLeft'
  if (text.includes('right')) return 'right'
  if (text.includes('top') || text.includes('up')) return 'top'
  if (text.includes('bottom') || text.includes('down')) return 'bottom'
  return 'left'
}

function readAssetName(prompt: string, context: AiProjectContext, type: 'image' | 'video' | 'audio'): string | null {
  const lower = prompt.toLowerCase()
  const asset = context.assets.find(item =>
    item.type === type &&
    (lower.includes(item.filename.toLowerCase()) || lower.includes(item.name.toLowerCase()))
  )
  if (asset) return asset.filename

  const extensions = type === 'video'
    ? 'mp4|webm|mov|avi|mkv|gif'
    : type === 'image'
      ? 'png|jpe?g|webp|gif|svg'
      : 'mp3|wav|m4a|ogg'
  const match = prompt.match(new RegExp('([\\w ._()\\-]+\\.(' + extensions + '))', 'i'))
  return match?.[1]?.trim().replace(/^[`'"]|[`'"]$/g, '') ?? null
}

function summarizeLocalCommands(commands: AiEditorCommand[], sceneIndex: number) {
  const parts: string[] = []
  if (commands.some(command => command.type === 'addScene')) parts.push('add a new scene')
  if (commands.some(command => command.type === 'addText')) parts.push('add text')
  if (commands.some(command => command.type === 'addVideoFromAsset')) parts.push('add video')
  if (commands.some(command => command.type === 'addImageFromAsset')) parts.push('add image')
  if (commands.some(command => command.type === 'addShape')) parts.push('add shape')
  if (commands.some(command => command.type === 'setBackground')) parts.push('set background')
  return `${capitalize(parts.join(', ') || 'prepare edits')} ${commands.some(command => command.type === 'addScene') ? 'in a new scene' : `on Scene ${sceneIndex}`}.`
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
