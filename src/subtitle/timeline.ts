import type { Project, SubtitleCue, SubtitleTrack } from '../types/editor'

export function getActiveSubtitleCue(project: Project | null, time: number): { track: SubtitleTrack; cue: SubtitleCue } | null {
  if (!project) return null
  const tracks = project.subtitleTracks ?? []
  for (const track of tracks) {
    if (!track.enabled) continue
    const cue = track.cues.find(c => time >= c.start && time < c.end && c.text.trim())
    if (cue) return { track, cue }
  }
  return null
}

export function getSceneGlobalStart(project: Project, sceneId: string): number {
  let elapsed = 0
  for (const scene of project.scenes) {
    if (scene.id === sceneId) return elapsed
    elapsed += scene.duration
  }
  return 0
}

function addWordOverlap(groups: string[]): string[] {
  return groups.map((group, index) => {
    if (index === 0 || !group) return group
    const previousWord = groups[index - 1].trim().split(/\s+/).at(-1)?.replace(/[.,!?;:।]+$/u, '')
    return previousWord ? `${previousWord} ${group}` : group
  })
}

function splitWordsEvenly(text: string, count: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return Array.from({ length: count }, (_, index) =>
    words.slice(Math.floor(index * words.length / count), Math.floor((index + 1) * words.length / count)).join(' '))
}

export function splitLongSubtitleCues(cues: SubtitleCue[], maxDuration = 4): SubtitleCue[] {
  const split = cues.flatMap(cue => {
    const duration = cue.end - cue.start
    const count = Math.max(1, Math.ceil(duration / maxDuration))
    if (count === 1) return [cue]
    const texts = splitWordsEvenly(cue.text, count)
    return texts.map((text, index) => ({
      ...cue,
      id: index === 0 ? cue.id : `${cue.id}-${index}`,
      start: cue.start + duration * index / count,
      end: cue.start + duration * (index + 1) / count,
      text,
    }))
  })
  const texts = addWordOverlap(split.map(cue => cue.text))
  return split.map((cue, index) => ({ ...cue, text: texts[index] }))
}

export function splitScriptIntoCueTexts(script: string, cueCount: number): string[] {
  const clean = script.replace(/\s+/g, ' ').trim()
  if (!clean || cueCount <= 0) return []

  const sentenceParts = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)

  if (sentenceParts.length >= cueCount) {
    const groups = Array.from({ length: cueCount }, () => '')
    sentenceParts.forEach((sentence, index) => {
      const target = Math.min(cueCount - 1, Math.floor(index * cueCount / sentenceParts.length))
      groups[target] = groups[target] ? `${groups[target]} ${sentence}` : sentence
    })
    return addWordOverlap(groups)
  }

  return addWordOverlap(splitWordsEvenly(clean, cueCount))
}
