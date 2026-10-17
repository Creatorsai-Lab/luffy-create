/**
 * Split screens from plain language: "split screen", "put the videos side by
 * side", "stack the clips", "the images in a grid". Putting one clip in a
 * particular area ("full screen", "bottom right at 400x300") is place.ts.
 */
import type { MediaLayout } from '../../utils/mediaLayout'
import type { AiPlanStep } from '../types'
import { escapeRe, readScenes, warn, type ParseState } from './refs'
import type { Clause } from './text'

const VIDEO_WORDS = /\b(?:videos?|clips?|footage|webcams?|cameras?|recordings?)\b/
const IMAGE_WORDS = /\b(?:images?|photos?|pictures?|pics?|screenshots?)\b/
const MEDIA_WORDS = new RegExp(`${VIDEO_WORDS.source}|${IMAGE_WORDS.source}|\\bmedia\\b`)

function readLayout(text: string): MediaLayout | null {
  const sideBySide = /\bside[\s-]by[\s-]side\b|\bnext to each other\b|\bleft and right\b/.test(text)
  const stacked = /\bstack(?:ed|s)?\b|\btop and bottom\b|\bone (?:above|on top of) the other\b|\bon top of each other\b/.test(text)
  if (/\bsplit[\s-]?screen\b/.test(text)) return sideBySide ? 'sideBySide' : stacked ? 'stacked' : 'split'
  if (sideBySide && MEDIA_WORDS.test(text)) return 'sideBySide'
  if (stacked && MEDIA_WORDS.test(text)) return 'stacked'
  if (/\bgrid\b/.test(text) && MEDIA_WORDS.test(text)) return 'grid'
  return null
}

export function layoutHandler(clause: Clause, state: ParseState): AiPlanStep[] | null {
  const text = clause.text
  const layout = readLayout(text)
  if (!layout) return null

  const sceneTarget = readScenes(text, state)?.[0]
  const scene = sceneTarget
    ? state.context.scenes.find(sc => sc.id === sceneTarget.sceneId)
    : state.context.scenes.find(sc => sc.index === state.context.currentSceneIndex)
  if (!scene) return null
  const media = scene.elements.filter(el => el.type === 'video' || el.type === 'image')
  if (!media.length) {
    warn(state, `There is no video or image on ${scene.name} to arrange.`)
    return []
  }

  // Which items: named ones, else the selected ones, else every video (or image) the text talks about.
  const quotes = clause.quotes.map(q => q.trim().toLowerCase())
  const named = media.filter(el => {
    const name = el.name.toLowerCase()
    return quotes.includes(name) || (name.length >= 3 && !MEDIA_WORDS.test(name) &&
      new RegExp(`(?<![\\w])${escapeRe(name)}(?![\\w])`).test(text))
  })
  const selected = media.filter(el => state.context.selectedIds.includes(el.id))
  const wantVideo = VIDEO_WORDS.test(text)
  const wantImage = IMAGE_WORDS.test(text)
  const mentioned = media.filter(el => (!wantVideo && !wantImage) || (wantVideo && el.type === 'video') || (wantImage && el.type === 'image'))

  const targets = named.length ? named : selected.length >= 2 ? selected : mentioned.length ? mentioned : media
  if (targets.length < 2) {
    warn(state, 'A split screen needs at least two videos or images on the scene.')
    return []
  }

  const gap = text.match(/\b(\d+)\s*(?:px|pixels?)\s+(?:gap|apart|spacing|between)\b|\bgap\s+of\s+(\d+)/)
  const refs = targets.map(el => ({ elementId: el.id, sceneId: scene.id, targetLabel: el.name }))
  state.lastElements = targets.map(el => ({ ref: { elementId: el.id, targetLabel: el.name }, type: el.type, summary: el, sceneId: scene.id, label: el.name }))
  return [{
    type: 'arrangeMedia',
    targets: refs,
    layout,
    ...(gap ? { gap: Number(gap[1] ?? gap[2]) } : /\bwith (?:a )?gap\b/.test(text) ? { gap: 16 } : {}),
  }]
}
