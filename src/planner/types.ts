/** The Planner's data (the same shape the main process stores, see electron/main/planner.ts). */
export interface Plan {
  id: string
  title: string
  body: string
  /** Accent colour of the card (a hex value), optional. */
  color?: string
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

export interface PlannerData {
  version: 1
  plans: Plan[]
}
