/**
 * Turns "remove these stretches of a scene" and "cut the scene at these
 * times" into splitScene/removeScene commands. Work happens from the end of
 * the scene backwards: splitScene keeps the original id on the first part, so
 * every earlier time stays valid while later parts are cut away.
 */
import type { AiEditorCommand, AiSceneRef } from '../types'
import type { TimeRange } from './speech'

export interface SceneInfo {
  id: string
  index: number
  duration: number
}

const EDGE = 0.1 // splitScene refuses cuts closer than this to either end

/** A part of a scene left after cutting: [from, to] in the scene's old time, and how to refer to it in later commands. */
export interface KeptPart {
  from: number
  to: number
  ref: AiSceneRef
}

/**
 * Ranges are in scene time. Returns the commands, how many seconds they remove
 * and the parts that stay. With `nameParts`, every kept part after a cut gets a
 * scene alias so later commands in the plan can change it (e.g. punch-in zooms).
 * Kept slivers shorter than `minKeep` are cut along with their neighbours.
 */
export function removeRanges(
  scene: SceneInfo,
  ranges: TimeRange[],
  nextAlias: () => string,
  opts: { canRemoveScene: boolean; minRange?: number; minKeep?: number; nameParts?: boolean }
) {
  const minRange = opts.minRange ?? 0.2
  const minKeep = opts.minKeep ?? 0
  let clean = mergeRanges(ranges.map(([a, b]): TimeRange => [Math.max(0, a), Math.min(scene.duration, b)]))
    .filter(([a, b]) => b - a >= minRange)
  if (minKeep > 0) {
    clean = mergeRanges(clean.map(([a, b], i): TimeRange => [
      a < minKeep ? 0 : a,
      // Close the gap to the next range (or the scene end) when what's left between is a sliver.
      Math.min(scene.duration, b + minKeep > (clean[i + 1]?.[0] ?? scene.duration) ? (clean[i + 1]?.[0] ?? scene.duration) : b),
    ]))
  }

  const ref = { sceneId: scene.id, sceneIndex: scene.index }
  const commands: AiEditorCommand[] = []
  const kept: KeptPart[] = []
  let removed = 0
  let keptUntil = scene.duration
  for (const [a, b] of clean.slice().reverse()) {
    const atStart = a <= EDGE
    const atEnd = b >= scene.duration - EDGE
    // The part after this range (up to the next range) stays.
    const keepAlias = !atEnd && opts.nameParts ? nextAlias() : undefined
    if (!atEnd) kept.unshift({ from: b, to: keptUntil, ref: keepAlias ? { sceneAlias: keepAlias } : {} })
    if (atStart && atEnd) {
      if (!opts.canRemoveScene) {
        kept.push({ from: 0, to: scene.duration, ref })
        continue
      }
      commands.push({ type: 'removeScene', ...ref })
    } else if (atStart) {
      // The scene becomes [0, b] and is removed; the rest lives on as the new part.
      commands.push({ type: 'splitScene', ...ref, at: round(b), ...(keepAlias && { alias: keepAlias }) }, { type: 'removeScene', ...ref })
    } else {
      const alias = nextAlias()
      if (!atEnd) commands.push({ type: 'splitScene', ...ref, at: round(b), ...(keepAlias && { alias: keepAlias }) })
      commands.push({ type: 'splitScene', ...ref, at: round(a), alias }, { type: 'removeScene', sceneAlias: alias })
    }
    removed += (atEnd ? scene.duration : b) - (atStart ? 0 : a)
    keptUntil = a
  }
  if (!clean.length || clean[0][0] > EDGE) kept.unshift({ from: 0, to: keptUntil, ref })
  return { commands, removed: round(removed), count: commands.filter(c => c.type === 'removeScene').length, kept }
}

/** Splits a scene at each time (scene time), skipping times too close to the ends. */
export function splitAt(scene: SceneInfo, times: number[]): AiEditorCommand[] {
  return [...new Set(times.map(round))]
    .filter(t => t > EDGE && t < scene.duration - EDGE)
    .sort((a, b) => b - a)
    .map(at => ({ type: 'splitScene', sceneId: scene.id, sceneIndex: scene.index, at }))
}

export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const out: TimeRange[] = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

function round(n: number) {
  return Math.round(n * 1000) / 1000
}
