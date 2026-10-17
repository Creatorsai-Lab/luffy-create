/** Built-in smart blocks. Add a block here and it appears in the Blocks panel and to the AI. */
import type { SmartBlock } from './registry'
import { hook } from './ugc/hook'
import { lowerThird } from './ugc/lowerThird'
import { titleCard } from './ugc/titleCard'

export const BUILT_IN_BLOCKS = [titleCard, lowerThird, hook] as unknown as SmartBlock[]
