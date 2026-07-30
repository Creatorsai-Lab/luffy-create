import type { AiAnimationSpec, AiEditorCommand, AiPlan, AiPlanResult, AiProjectContext, AiSceneRef } from './types'
import { AI_PLAN_JSON_SCHEMA, validateAiPlan } from './schema'
import { FONT_FAMILIES } from '../types/editor'

const SYSTEM_PROMPT = [
  'You are an editor command planner for a scene-based video editor.',
  'Return only commands that can be safely applied to the current project.',
  'Return a JSON object that matches the provided schema. Do not return prose outside JSON.',
  'Use 1-based sceneIndex when the user says slide/scene 1, 2, etc.',
  'If the user does not name a scene, use currentSceneIndex from context.',
  'Only create a scene when the user explicitly asks for a new scene/slide.',
  'Treat @asset-name.ext mentions as references to available assets from context.',
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
  const steps = splitPromptSteps(prompt)
  const sceneIndex = readSceneIndex(lower) ?? context.currentSceneIndex
  const wantsAdd = /\b(add|create|insert)\b/.test(lower)
  const commands: AiEditorCommand[] = []
  const createsScene = wantsAdd && hasNewSceneIntent(lower)
  const targetScene: AiSceneRef = createsScene ? { sceneAlias: 'newScene' } : { sceneIndex }

  if (createsScene) {
    const sceneStep = findStep(steps, /\bnew\s+(?:scene|slide)\b/i) ?? prompt
    commands.push({
      type: 'addScene',
      alias: 'newScene',
      duration: readNumberAfter(sceneStep.toLowerCase(), 'duration') ?? undefined,
    })
  }

  if (/\b(square|rectangle|rect)\b/.test(lower) && (wantsAdd || createsScene)) {
    const shapeStep = findStep(steps, /\b(square|rectangle|rect)\b/i) ?? prompt
    const shapeSize = readSize(shapeStep)
    const isSquare = lower.includes('square')
    const width = shapeSize?.width ?? (isSquare ? 300 : 420)
    const height = shapeSize?.height ?? (isSquare ? width : 260)
    commands.push({
      type: 'addShape',
      ...targetScene,
      ...readPlacement(shapeStep, context, { width, height }),
      shapeType: 'rect',
      width,
      height,
      fill: readColor(shapeStep) ?? '#6366f1',
    })
  }

  const textSteps = findTextSteps(steps, prompt)
  if (/\b(text|title|heading|written)\b/.test(lower) && (wantsAdd || createsScene || textSteps.length > 0)) {
    for (const textStep of textSteps.length > 0 ? textSteps : [prompt]) {
      commands.push({
        type: 'addText',
        ...targetScene,
        ...readPlacement(textStep, context, { width: 600, height: 60 }),
        text: readQuotedText(textStep) ?? 'New text',
        fontSize: readNumberAfter(textStep.toLowerCase(), 'font size') ?? undefined,
        fontFamily: readFontFamily(textStep) ?? undefined,
        color: readColor(textStep) ?? undefined,
        animation: readTextAnimation(textStep.toLowerCase()) ?? undefined,
      })
    }
  }

  const videoAssetName = readAssetName(prompt, context, 'video')
  if ((/\b(video|mp4|webm|mov|avi|mkv)\b/.test(lower) || videoAssetName) && (wantsAdd || createsScene)) {
    const videoStep = findAssetStep(steps, videoAssetName, /\b(video|mp4|webm|mov|avi|mkv)\b/i) ?? prompt
    const videoSize = readSize(videoStep)
    commands.push({
      type: 'addVideoFromAsset',
      ...targetScene,
      ...readPlacement(videoStep, context, videoSize ?? {}),
      assetName: videoAssetName ?? undefined,
      width: videoSize?.width,
      height: videoSize?.height,
    })
  }

  const imageAssetName = readAssetName(prompt, context, 'image')
  if ((/\b(image|photo|picture|png|jpe?g|webp|gif)\b/.test(lower) || imageAssetName) && (wantsAdd || createsScene)) {
    const imageStep = findAssetStep(steps, imageAssetName, /\b(image|photo|picture|png|jpe?g|webp|gif)\b/i) ?? prompt
    const imageSize = readSize(imageStep)
    commands.push({
      type: 'addImageFromAsset',
      ...targetScene,
      ...readPlacement(imageStep, context, imageSize ?? {}),
      assetName: imageAssetName ?? undefined,
      width: imageSize?.width,
      height: imageSize?.height,
    })
  }

  const audioAssetName = readAssetName(prompt, context, 'audio')
  if ((/\b(audio|sound|music|mp3|wav|m4a|ogg|aac)\b/.test(lower) || audioAssetName) && (wantsAdd || createsScene)) {
    const audioStep = findAssetStep(steps, audioAssetName, /\b(audio|sound|music|mp3|wav|m4a|ogg|aac)\b/i) ?? prompt
    commands.push({
      type: 'addAudioFromAsset',
      ...targetScene,
      assetName: audioAssetName ?? undefined,
      timelineX: readTimelineX(audioStep.toLowerCase()) ?? 0,
      duration: readNumberAfter(audioStep.toLowerCase(), 'audio duration') ?? undefined,
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
    const orderedCommands = orderLocalCommands(commands)
    return {
      summary: summarizeLocalCommands(orderedCommands, sceneIndex),
      commands: orderedCommands,
      needsConfirmation: true,
    }
  }

  if (/\btransition\b/.test(lower)) {
    const type = lower.includes('flicker shake') ? 'flickerShake'
      : lower.includes('flash blur') ? 'flashBlur'
      : lower.includes('morph') ? 'morph'
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
        transition: {
          type,
          duration: readNumberAfter(lower, 'duration') ?? 0.8,
          direction: readTransitionDirection(lower),
          speed: readNumberAfter(lower, 'speed') ?? undefined,
          hardness: readNumberAfter(lower, 'hardness') ?? undefined,
        },
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

function splitPromptSteps(prompt: string) {
  return prompt
    .split(/\r?\n+/)
    .map(line => line.trim().replace(/^\d+\s*[.)-]\s*/, ''))
    .filter(Boolean)
}

function orderLocalCommands(commands: AiEditorCommand[]) {
  const priority: Record<AiEditorCommand['type'], number> = {
    addScene: 0,
    setBackground: 1,
    addShape: 2,
    addImageFromAsset: 2,
    addVideoFromAsset: 2,
    addText: 3,
    addAudioFromAsset: 4,
    setTransition: 5,
    applyMove: 5,
    updateElement: 5,
    styleElement: 5,
    generateStoryboard: 5,
  }
  return commands
    .map((command, index) => ({ command, index }))
    .sort((a, b) => priority[a.command.type] - priority[b.command.type] || a.index - b.index)
    .map(item => item.command)
}

function findStep(steps: string[], pattern: RegExp) {
  return steps.find(step => pattern.test(step))
}

function findTextSteps(steps: string[], prompt: string) {
  const matches = steps.filter(step =>
    Boolean(readQuotedText(step)) ||
    /\b(text|title|heading|written)\b/i.test(step) ||
    /\bcontent\s*["':]/i.test(step)
  )
  if (matches.length > 0) return matches
  return readQuotedText(prompt) ? [prompt] : []
}

function readQuotedText(text: string) {
  return text.match(/"([^"]+)"/)?.[1] ?? text.match(/'([^']+)'/)?.[1] ?? null
}

function findAssetStep(steps: string[], assetName: string | null, fallback: RegExp) {
  if (assetName) {
    const wanted = assetName.toLowerCase()
    const exact = steps.find(step => step.toLowerCase().includes(wanted) || step.toLowerCase().includes(`@${wanted}`))
    if (exact) return exact
  }
  return findStep(steps, fallback)
}

function readPlacement(
  text: string,
  context: AiProjectContext,
  size: { width?: number; height?: number }
): { x?: number; y?: number } {
  const lower = text.toLowerCase()
  const margin = 80
  const out: { x?: number; y?: number } = {}
  const hasHorizontalSize = typeof size.width === 'number'
  const hasVerticalSize = typeof size.height === 'number'

  if (/\b(?:top|upper)\b/.test(lower)) out.y = margin
  else if (/\b(?:bottom|lower)\b/.test(lower)) out.y = hasVerticalSize ? context.project.height - size.height! : undefined
  else if (/\b(?:middle|center|centre)\b/.test(lower) && hasVerticalSize) out.y = Math.round((context.project.height - size.height!) / 2)

  if (/\bleft\b/.test(lower)) out.x = margin
  else if (/\bright\b/.test(lower)) out.x = hasHorizontalSize ? context.project.width - size.width! - margin : undefined
  else if (/\b(?:top|bottom|middle|center|centre)\b/.test(lower) && hasHorizontalSize) out.x = Math.round((context.project.width - size.width!) / 2)

  return out
}

function readSceneIndex(text: string): number | null {
  const match = text.match(/\b(?:on|in|to|for)?\s*(?:scene|slide)\s*(?:number|no\.?)?\s*(\d+)\b/)
  return match ? Math.max(1, Number(match[1])) : null
}

function hasNewSceneIntent(text: string) {
  return /\b(?:add|create|insert)\s+(?:a\s+)?new\s+(?:scene|slide)\b/.test(text) ||
    /\b(?:add|create|insert)\s+(?:a\s+)?(?:blank|empty)\s+(?:scene|slide)\b/.test(text) ||
    /\bnew\s+(?:scene|slide)\s+with\b/.test(text)
}

function readSize(text: string): { width?: number; height?: number } | null {
  const widthLabel = text.match(/\bwidth\s*(?:is|:|=)?\s*(\d{2,5})\s*(?:px)?\b/i)
  const heightLabel = text.match(/\bhei(?:ght|gh)?\s*(?:is|:|=)?\s*(\d{2,5})\s*(?:px)?\b/i)
  if (widthLabel || heightLabel) {
    return {
      width: widthLabel ? Number(widthLabel[1]) : undefined,
      height: heightLabel ? Number(heightLabel[1]) : undefined,
    }
  }

  const match = text.match(/(\d{2,5})\s*(?:px)?\s*(?:x|×|by)\s*(\d{2,5})\s*(?:px)?/)
  if (match) return { width: Number(match[1]), height: Number(match[2]) }

  const widthOnly = text.match(/\bwidth\s*(\d{2,5})\s*(?:px)?\b/i)
  if (widthOnly) return { width: Number(widthOnly[1]) }
  return null
}

function readTimelineX(text: string): number | null {
  if (/\b(?:start|beginning|below last scene|timeline below)\b/.test(text)) return 0
  return readNumberAfter(text, 'timeline')
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

function readFontFamily(text: string): string | null {
  const lower = text.toLowerCase()
  const labelled = lower.match(/\bfont\s*family\s*:?\s*([a-z][a-z\s-]{1,40})/i) ??
    lower.match(/\bfontfamily\s*:?\s*([a-z][a-z\s-]{1,40})/i)
  const search = labelled?.[1]?.replace(/\b(?:and|with|color|font|size|duration|seconds|animation|at|left|right|center|centre|top|bottom)\b.*$/i, '').trim()
  const exact = FONT_FAMILIES.find(font => search && font.toLowerCase() === search)
  if (exact) return exact
  return FONT_FAMILIES.find(font => lower.includes(font.toLowerCase())) ?? null
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

function readTransitionDirection(text: string): 'left' | 'right' | 'up' | 'down' {
  if (text.includes('right')) return 'right'
  if (text.includes('top') || text.includes('up')) return 'up'
  if (text.includes('bottom') || text.includes('down')) return 'down'
  return 'left'
}

function readTextAnimation(text: string): AiAnimationSpec | null {
  if (!/\banimation\b/.test(text)) return null
  const type = text.includes('fade') ? 'fadeIn'
    : text.includes('typewriter') ? 'typewriter'
    : text.includes('bounce') ? 'textBounceIn'
    : text.includes('scale') ? 'scaleIn'
    : null
  if (!type) return null
  return {
    type,
    duration: readNumberAfter(text, 'duration') ?? undefined,
  }
}

function readAssetName(prompt: string, context: AiProjectContext, type: 'image' | 'video' | 'audio'): string | null {
  const lower = prompt.toLowerCase()
  const asset = context.assets.find(item =>
    item.type === type &&
    (lower.includes(item.filename.toLowerCase()) || lower.includes(`@${item.filename.toLowerCase()}`) || lower.includes(item.name.toLowerCase()))
  )
  if (asset) return asset.filename

  const extensions = type === 'video'
    ? 'mp4|webm|mov|avi|mkv'
    : type === 'image'
      ? 'png|jpe?g|webp|gif|svg'
      : 'mp3|wav|m4a|ogg|aac'
  const mention = prompt.match(new RegExp('@([\\w._()\\-]+\\.(' + extensions + '))', 'i'))
  if (mention?.[1]) return mention[1].trim()
  const match = prompt.match(new RegExp('([\\w ._()\\-]+\\.(' + extensions + '))', 'i'))
  return cleanAssetMention(match?.[1])
}

function cleanAssetMention(value?: string) {
  return value?.trim().replace(/^[`'"]?@?/, '').replace(/[`'"]$/, '') ?? null
}

function summarizeLocalCommands(commands: AiEditorCommand[], sceneIndex: number) {
  const parts: string[] = []
  if (commands.some(command => command.type === 'addScene')) parts.push('add a new scene')
  if (commands.some(command => command.type === 'addText')) parts.push('add text')
  if (commands.some(command => command.type === 'addVideoFromAsset')) parts.push('add video')
  if (commands.some(command => command.type === 'addImageFromAsset')) parts.push('add image')
  if (commands.some(command => command.type === 'addAudioFromAsset')) parts.push('add audio')
  if (commands.some(command => command.type === 'addShape')) parts.push('add shape')
  if (commands.some(command => command.type === 'setBackground')) parts.push('set background')
  return `${capitalize(parts.join(', ') || 'prepare edits')} ${commands.some(command => command.type === 'addScene') ? 'in a new scene' : `on Scene ${sceneIndex}`}.`
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
