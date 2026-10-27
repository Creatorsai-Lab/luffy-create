import { create } from 'zustand'

/** Picking a subject on the canvas for the AI cut-out: click to keep or remove a person/object. */
export interface PickMode {
  elementId: string
  keep: boolean
  /** Apply to every part of a clip that was cut into parts. */
  allParts: boolean
}

export const usePickMode = create<{ mode: PickMode | null; setMode: (mode: PickMode | null) => void }>(set => ({
  mode: null,
  setMode: mode => set({ mode }),
}))
