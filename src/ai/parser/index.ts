import type { AiPlanIssue, AiPlanStep, AiProjectContext } from '../types'
import { HANDLERS } from './intents'
import type { ParseState } from './refs'
import { splitClauses } from './text'

export interface ParsedPrompt {
  /** Editor commands, plus smart steps that the planner expands after analysing media. */
  steps: AiPlanStep[]
  issues: AiPlanIssue[]
}

/**
 * Deterministic prompt → plan steps. The prompt is split into clauses; each
 * clause goes to the first intent handler that claims it. State carries across
 * clauses so "add a title and make it red" edits the new title.
 */
export function parsePrompt(prompt: string, context: AiProjectContext): ParsedPrompt {
  const state: ParseState = { context, issues: [], lastElements: null, lastScenes: null, aliasCount: 0 }
  const steps: AiPlanStep[] = []

  for (const clause of splitClauses(prompt)) {
    let produced: AiPlanStep[] | null = null
    for (const handler of HANDLERS) {
      produced = handler(clause, state)
      if (produced) break
    }
    if (produced) steps.push(...produced)
    else state.issues.push({ level: 'warning', message: `Didn't understand "${clause.raw}".` })
  }

  const seen = new Set<string>()
  const issues = state.issues.filter(issue => !seen.has(issue.message) && seen.add(issue.message))
  return { steps, issues }
}
