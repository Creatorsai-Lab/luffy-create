import type { AiPlanResult, AiProjectContext, AiSmartStep } from './types'
import { isSmartStep } from './types'
import { summarizeCommands } from './describe'
import { parsePrompt } from './parser'
import { browserMedia, expandSmartSteps } from './smart'
import type { SmartMedia } from './smart/expand'

const STRUCTURAL = new Set(['addScene', 'removeScene', 'duplicateScene', 'splitScene', 'moveScene', 'setSceneDuration'])

/**
 * Turns a prompt into a reviewable plan: the deterministic parser, then media
 * analysis for smart steps ("remove silences", "cut to the beat"). A model
 * planner can be added later by producing the same commands (see schema.ts).
 */
export async function planAiEdit(
  prompt: string,
  context: AiProjectContext,
  opts: { onProgress?: (message: string) => void; media?: SmartMedia } = {}
): Promise<AiPlanResult> {
  const trimmed = prompt.trim()
  if (!trimmed) throw new Error('Enter a request first.')
  const { steps, issues } = parsePrompt(trimmed, context)

  // Smart steps are planned against the project as it is now, so they don't
  // mix well with other steps that reshape scenes in the same request.
  if (steps.some(isSmartStep) && steps.some(step => !isSmartStep(step) && STRUCTURAL.has(step.type))) {
    issues.push({ level: 'warning', message: 'For reliable results, run smart edits (silences, beats, shots) as a separate request.' })
  }

  const { commands, notes } = await expandSmartSteps(steps, context, issues, opts.media ?? browserMedia, opts.onProgress)
  const summary = notes.length ? notes.join(' ') : summarizeCommands(commands)
  return { plan: { summary, commands, needsConfirmation: true }, issues, source: 'local' }
}

/** Plans smart steps picked in the UI (e.g. the audio panel's "Duck under voice") the same way as a prompt. */
export async function planSmartSteps(
  steps: AiSmartStep[],
  context: AiProjectContext,
  opts: { onProgress?: (message: string) => void; media?: SmartMedia } = {}
): Promise<AiPlanResult> {
  const issues: AiPlanResult['issues'] = []
  const { commands, notes } = await expandSmartSteps(steps, context, issues, opts.media ?? browserMedia, opts.onProgress)
  const summary = notes.length ? notes.join(' ') : summarizeCommands(commands)
  return { plan: { summary, commands }, issues, source: 'local' }
}
