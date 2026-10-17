import type { AiCommandType, AiEditorCommand, AiPlan } from './types'

/** Contract for any planner that is not the built-in parser (e.g. a future model). */
const COMMAND_TYPES = new Set<AiCommandType>([
  'addText',
  'addShape',
  'addImageFromAsset',
  'addVideoFromAsset',
  'addAudioFromAsset',
  'setBackground',
  'updateElement',
  'styleElement',
  'applyMove',
  'addScene',
  'setTransition',
  'generateStoryboard',
  'removeScene',
  'duplicateScene',
  'splitScene',
  'moveScene',
  'setSceneDuration',
  'removeElement',
  'duplicateElement',
  'arrangeElement',
  'alignElement',
  'addAnimation',
  'removeAnimations',
  'animateSequence',
  'connectElements',
  'groupElements',
  'ungroupElements',
  'insertBlock',
  'updateBlock',
  'setVolumeKeys',
  'arrangeMedia',
  'setCaptionStyle',
  'placeMedia',
])

export const AI_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'commands'],
  properties: {
    summary: { type: 'string' },
    needsConfirmation: { type: 'boolean' },
    commands: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['type'],
        properties: {
          type: { enum: Array.from(COMMAND_TYPES) },
        },
      },
    },
  },
} as const

export function validateAiPlan(value: unknown): AiPlan {
  if (!isRecord(value)) throw new Error('AI response must be an object.')
  if (typeof value.summary !== 'string' || value.summary.trim().length === 0) {
    throw new Error('AI response is missing a summary.')
  }
  if (!Array.isArray(value.commands)) throw new Error('AI response is missing commands.')
  if (value.commands.length > 20) throw new Error('AI returned too many commands.')

  const commands = value.commands.map(validateCommand)
  return {
    summary: value.summary.trim(),
    commands,
    needsConfirmation: typeof value.needsConfirmation === 'boolean' ? value.needsConfirmation : true,
  }
}

function validateCommand(value: unknown): AiEditorCommand {
  if (!isRecord(value)) throw new Error('Command must be an object.')
  if (typeof value.type !== 'string' || !COMMAND_TYPES.has(value.type as AiCommandType)) {
    throw new Error('Command type is not allowed.')
  }
  const need = (ok: boolean, message: string) => { if (!ok) throw new Error(message) }
  switch (value.type) {
    case 'addText': need(typeof value.text === 'string', 'addText requires text.'); break
    case 'addShape': need(typeof value.shapeType === 'string', 'addShape requires shapeType.'); break
    case 'setBackground': need(isRecord(value.background), 'setBackground requires background.'); break
    case 'updateElement':
    case 'styleElement': need(isRecord(value.patch), `${value.type} requires patch.`); break
    case 'applyMove': need(typeof value.direction === 'string', 'applyMove requires direction.'); break
    case 'setTransition': need(isRecord(value.transition), 'setTransition requires transition.'); break
    case 'generateStoryboard': need(Array.isArray(value.scenes), 'generateStoryboard requires scenes.'); break
    case 'splitScene': need(typeof value.at === 'number', 'splitScene requires at.'); break
    case 'moveScene': need(typeof value.toIndex === 'number', 'moveScene requires toIndex.'); break
    case 'setSceneDuration': need(typeof value.duration === 'number', 'setSceneDuration requires duration.'); break
    case 'arrangeElement': need(typeof value.order === 'string', 'arrangeElement requires order.'); break
    case 'addAnimation': need(isRecord(value.animation), 'addAnimation requires animation.'); break
    case 'groupElements':
    case 'ungroupElements': need(Array.isArray(value.targets) && value.targets.length > 0, `${value.type} requires targets.`); break
    case 'insertBlock': need(typeof value.blockId === 'string', 'insertBlock requires blockId.'); break
    case 'updateBlock': need(typeof value.groupId === 'string' && isRecord(value.params), 'updateBlock requires groupId and params.'); break
    case 'connectElements': need(Array.isArray(value.from) && value.from.length > 0, 'connectElements requires from.'); break
    case 'placeMedia': need(typeof value.region === 'object' && value.region !== null, 'placeMedia requires region.'); break
    case 'arrangeMedia': need(Array.isArray(value.targets) && value.targets.length > 0 && typeof value.layout === 'string', 'arrangeMedia requires targets and layout.'); break
    case 'setVolumeKeys': need(Array.isArray(value.keys), 'setVolumeKeys requires keys.'); break
    case 'animateSequence': need(Array.isArray(value.waves) && value.waves.length > 0, 'animateSequence requires waves.'); break
  }
  return value as AiEditorCommand
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
