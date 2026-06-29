import type { AiEditorCommand, AiPlan } from './types'

const COMMAND_TYPES = new Set([
  'addText',
  'addShape',
  'addImageFromAsset',
  'setBackground',
  'updateElement',
  'styleElement',
  'applyMove',
  'addScene',
  'setTransition',
  'generateStoryboard',
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
  if (typeof value.type !== 'string' || !COMMAND_TYPES.has(value.type)) {
    throw new Error('Command type is not allowed.')
  }
  if (value.type === 'addText' && typeof value.text !== 'string') throw new Error('addText requires text.')
  if (value.type === 'addShape' && typeof value.shapeType !== 'string') throw new Error('addShape requires shapeType.')
  if (value.type === 'setBackground' && !isRecord(value.background)) throw new Error('setBackground requires background.')
  if ((value.type === 'updateElement' || value.type === 'styleElement') && !isRecord(value.patch)) {
    throw new Error(`${value.type} requires patch.`)
  }
  if (value.type === 'applyMove' && typeof value.direction !== 'string') throw new Error('applyMove requires direction.')
  if (value.type === 'setTransition' && !isRecord(value.transition)) throw new Error('setTransition requires transition.')
  if (value.type === 'generateStoryboard' && !Array.isArray(value.scenes)) {
    throw new Error('generateStoryboard requires scenes.')
  }
  return value as AiEditorCommand
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
