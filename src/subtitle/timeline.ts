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
    return groups
  }

  const words = clean.split(' ')
  const perCue = Math.max(1, Math.ceil(words.length / cueCount))
  return Array.from({ length: cueCount }, (_, i) => words.slice(i * perCue, (i + 1) * perCue).join(' ').trim())
}
