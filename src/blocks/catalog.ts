/** Built-in smart blocks. Add a block here and it appears in the Blocks panel and to the AI. */
import type { SmartBlock } from './registry'
import { codeWalkthrough } from './technical/codeWalkthrough'
import { equationReveal } from './technical/equation'
import { flowchart } from './technical/flowchart'
import { neuralNetwork } from './technical/neuralNetwork'
import { hook } from './ugc/hook'
import { lowerThird } from './ugc/lowerThird'
import { titleCard } from './ugc/titleCard'

export const BUILT_IN_BLOCKS = [
  titleCard, lowerThird, hook,
  neuralNetwork, flowchart, equationReveal, codeWalkthrough,
] as unknown as SmartBlock[]
