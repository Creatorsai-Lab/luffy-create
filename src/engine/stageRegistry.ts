import type Konva from 'konva'

// Module-level singleton — keeps the Konva stage out of Zustand/Immer
// so the ref object is never frozen.
let _stage: Konva.Stage | null = null

export function registerStage(stage: Konva.Stage | null) {
  _stage = stage
}

export function getStage(): Konva.Stage | null {
  return _stage
}

// The outgoing scene of a transition, drawn on its own hidden stage while the
// main stage shows the scene the playhead is in (see EditorCanvas).
let _outgoing: Konva.Stage | null = null

export function registerOutgoingStage(stage: Konva.Stage | null) {
  _outgoing = stage
}

export function getOutgoingStage(): Konva.Stage | null {
  return _outgoing
}
