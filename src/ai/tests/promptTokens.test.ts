// "/" add-on commands and "@" media mentions in the AI prompt: which token the
// caret is in, what the list offers, and what gets highlighted.
import assert from 'node:assert/strict'
import { findAddon } from '../../blocks/registry'
import { addonChoices, editChoices, getActiveToken, mediaChoices, promptParts } from '../promptTokens'
import { readUndoRequest } from '../editLog'

// The token at the caret.
assert.deepEqual(getActiveToken('add /neu'), { kind: 'addon', start: 4, end: 8, query: 'neu' })
assert.deepEqual(getActiveToken('/'), { kind: 'addon', start: 0, end: 1, query: '' })
assert.deepEqual(getActiveToken('add @clip.mp'), { kind: 'media', start: 4, end: 12, query: 'clip.mp' })
assert.equal(getActiveToken('add /neural-network '), null, 'a finished token (space after it) closes the list')
assert.equal(getActiveToken('a/b'), null, 'a slash inside a word is not a command')
assert.equal(getActiveToken('3 / 4'), null)
assert.deepEqual(getActiveToken('add /flow then', 9)?.query, 'flow', 'the caret decides, not the end of the text')

// Choices: commands starting with the query first.
assert.deepEqual(addonChoices('').map(c => c.insert), ['/history', '/undo', '/title-card', '/lower-third', '/hook', '/neural-network', '/flowchart', '/equation', '/code-walkthrough'])
assert.deepEqual(addonChoices('neu').map(c => c.insert), ['/neural-network'])
assert.deepEqual(addonChoices('un').map(c => c.insert), ['/undo'])
assert.deepEqual(addonChoices('h').map(c => c.insert).slice(0, 2), ['/history', '/hook'], 'commands, then add-ons that start with it')

// After "/undo ": the AI edits, newest first, by the number typed.
assert.deepEqual(getActiveToken('/undo '), { kind: 'edit', start: 0, end: 6, query: '' })
assert.deepEqual(getActiveToken('please /undo #1'), { kind: 'edit', start: 7, end: 15, query: '1' })
const log = [{ id: 1, prompt: 'add a purple circle on scene 2', undone: false }, { id: 2, prompt: 'x', undone: true }, { id: 12, prompt: 'make scene 3 five seconds long and fade it in nicely', undone: false }]
assert.deepEqual(editChoices(log, '').map(c => c.insert), ['/undo #12', '/undo #1'])
assert.deepEqual(editChoices(log, '1').map(c => c.key), ['edit-12', 'edit-1'])
assert.equal(editChoices(log, '')[0].label, '#12  make scene 3 five seconds long an…')
assert.deepEqual(addonChoices('code').map(c => c.insert), ['/code-walkthrough'])
assert.equal(addonChoices('zzz').length, 0)
const assets = [
  { id: 'a', type: 'video' as const, name: 'Intro', filename: 'intro.mp4' },
  { id: 'b', type: 'audio' as const, name: 'Song', filename: 'song.mp3' },
]
assert.deepEqual(mediaChoices(assets, 'so').map(c => c.insert), ['@song.mp3'])
assert.equal(mediaChoices(assets, '').length, 2)

// Commands: exact, a unique start, or a one-letter slip.
assert.equal(findAddon('neural-network')?.id, 'neuralNetwork')
assert.equal(findAddon('/neural')?.id, 'neuralNetwork')
assert.equal(findAddon('neurall')?.id, 'neuralNetwork')
assert.equal(findAddon('flowchrt')?.id, 'flowchart')
assert.equal(findAddon('l'), undefined, 'too short to guess')
assert.equal(findAddon('nothing'), undefined)

// Highlighting: known commands and any @mention; other slashes stay plain.
assert.deepEqual(promptParts('add /neural-network in scene 4 with @intro.mp4, and 3/4 of it /nope'), [
  { text: 'add ' },
  { text: '/neural-network', kind: 'addon' },
  { text: ' in scene 4 with ' },
  { text: '@intro.mp4', kind: 'media' },
  { text: ', and 3/4 of it /nope' },
])

// Panel commands are highlighted as commands.
assert.deepEqual(promptParts('/undo #3'), [{ text: '/undo', kind: 'command' }, { text: ' #3' }])
assert.deepEqual(promptParts('/history').map(p => p.kind), ['command'])
assert.equal(readUndoRequest('/undo #3'), 3)
assert.equal(readUndoRequest('/undo 7'), 7)
assert.equal(readUndoRequest('/undo'), 'last')
assert.equal(readUndoRequest('/undo the title'), null)

console.log('ai prompt token tests passed')
