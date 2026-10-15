import type { AiEditorCommand, AiElementRef, AiSceneRef } from './types'

/** One line per command for the plan preview, e.g. `Fade in "Hello" on Scene 2`. */
export function describeCommand(command: AiEditorCommand): string {
  switch (command.type) {
    case 'addText': return `Add text "${command.text}"${onScene(command)}`
    case 'addShape': return `Add ${command.shapeType}${size(command.width, command.height)}${onScene(command)}`
    case 'addImageFromAsset': return `Add image ${command.assetName ?? ''}${onScene(command)}`
    case 'addVideoFromAsset': return `Add video ${command.assetName ?? ''}${onScene(command)}`
    case 'addAudioFromAsset': return `Add audio ${command.assetName ?? ''}${onScene(command)}`
    case 'setBackground': return `Set ${command.background.type === 'solid' ? command.background.color : command.background.type} background${onScene(command)}`
    case 'updateElement':
    case 'styleElement': return `Change ${target(command)}: ${Object.entries(command.patch).map(([k, v]) => `${k} ${formatValue(v)}`).join(', ')}`
    case 'applyMove': return `Move ${target(command)} ${command.direction}`
    case 'addScene': return `Add scene${command.name ? ` "${command.name}"` : ''}${command.duration ? ` (${command.duration}s)` : ''}`
    case 'setTransition': return command.transition.type === 'none'
      ? `Remove transition${onScene(command)}`
      : `Set ${command.transition.type} transition${onScene(command)}`
    case 'generateStoryboard': return `Create ${command.scenes.length} storyboard scenes`
    case 'removeScene': return `Delete ${scene(command)}`
    case 'duplicateScene': return `Duplicate ${scene(command)}`
    case 'splitScene': return `Split ${scene(command)} at ${command.at}s`
    case 'moveScene': return `Move ${scene(command)} to position ${command.toIndex}`
    case 'setSceneDuration': return `Make ${scene(command)} ${command.duration}s long`
    case 'removeElement': return `Delete ${target(command)}`
    case 'duplicateElement': return `Duplicate ${target(command)}`
    case 'arrangeElement': return `${command.order === 'front' || command.order === 'forward' ? 'Bring' : 'Send'} ${target(command)} ${command.order === 'front' ? 'to front' : command.order === 'back' ? 'to back' : command.order}`
    case 'alignElement': return `Place ${target(command)} at ${[command.vertical, command.horizontal].filter(Boolean).join(' ') || 'center'}`
    case 'addAnimation': return `Animate ${target(command)}: ${command.animation.type}${command.animation.duration ? ` over ${command.animation.duration}s` : ''}`
    case 'removeAnimations': return `Remove animations from ${target(command)}`
  }
}

export function summarizeCommands(commands: AiEditorCommand[]): string {
  if (!commands.length) return 'No edits found in this request.'
  const first = describeCommand(commands[0])
  return commands.length === 1 ? `${first}.` : `${first}, and ${commands.length - 1} more edit${commands.length > 2 ? 's' : ''}.`
}

function onScene(ref: AiSceneRef) {
  return ref.sceneIndex ? ` on Scene ${ref.sceneIndex}` : ref.sceneAlias ? ' on the new scene' : ''
}

function scene(ref: AiSceneRef) {
  return ref.sceneIndex ? `Scene ${ref.sceneIndex}` : ref.sceneAlias ? 'the new scene' : 'the current scene'
}

function target(ref: AiElementRef) {
  return ref.targetLabel ?? ref.elementName ?? (ref.selected ? 'the selection' : ref.elementAlias ? 'the new item' : 'the item')
}

function size(width?: number, height?: number) {
  return width && height ? ` ${width}×${height}` : ''
}

function formatValue(value: unknown) {
  if (typeof value === 'string') return value.length > 30 ? `"${value.slice(0, 30)}…"` : value.startsWith('#') ? value : `"${value}"`
  if (typeof value === 'number') return String(Math.round(value * 100) / 100)
  return String(value)
}
