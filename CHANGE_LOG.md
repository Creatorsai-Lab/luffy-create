# Changelog

All notable changes to Luffy Create. Download installers from [GitHub Releases](https://github.com/Creatorsai-Lab/luffy-create/releases).

## 1.5.0

Type the edit: an AI Agent that edits from plain words, plus cinematic transitions, 43 effects, speed ramps, precise background removal, jump cuts and add-ons. All on your computer, fast on low-end PCs. Full notes: [docs/releases/v1.5.0.md](docs/releases/v1.5.0.md).

### New

- **AI Agent** — plain-language edits with a plan preview, `/history` and `/undo #N`, `@` media and `/` add-ons; smart edits that remove silences, filler words and retakes, cut to the beat, split into shots and duck music.
- **Jump-cut studio and edit by transcript** — cut pauses, fillers and retakes (with punch-in zooms), or delete words in the transcript; local Whisper.
- **Auto reframe** — landscape to 9:16 following the speaker's face; split-screen layouts and caption presets.
- **22 GPU transitions** (whip pan, zoom blur, light leak, film burn, glitch, cube…), intro from black and an ending fade; the outgoing scene keeps playing and the sound crossfades.
- **43 effects in 9 groups** — neon outline and aura on a person, VHS, 8mm, glitch, warp, light leaks, phonk, rain, snow and 12 colour looks; timed, stackable, on the beat.
- **Speed ramps and freeze frames** — 7 presets or a custom curve; sound follows the speed with its pitch kept.
- **Edit BG and precise background removal** — remove, blur or colour the background in one click; a one-time 44 MB precise cut-out for people, cars, products and groups; click to keep or remove a person or object (45 MB, once), followed through video.
- **Add-ons** — neural network, flowchart, code walkthrough, equation reveal, title card, lower third, hook/CTA; editable by prompt and in perspective.
- **Connectors, Group Effects, groups and locking** — attached arrows, wave animations, Ctrl+G.
- **Content Planner**, Settings with About and feedback.

### Improved

- Export asks where to save first and keeps full speed when minimised; faster timeline rendering and fewer re-renders.
- Old projects' grading, grain, vignette and media effects open in the new effects system.

### Fixed

- 9:16 projects exported at 608×1080 instead of 1080×1920.
- Sound of speed-ramped clips drifted ahead of the picture in export.
- Transitions now match between editor, Preview and export (push, wipe direction, zoom).

## 1.4.0

The biggest update since launch: new media effects and transitions, bilingual offline captions, a real Morph transition, perspective on every element, and a much more reliable timeline.

### New

- **Morph transition** — objects that appear in both scenes now glide, resize and change color into their new place, like PowerPoint Morph. Duplicate a scene, move things, apply Morph.
- **Media effects for images and video** — stackable, timed effects: zoom in/out (with focus position), grain, vignette, light flicker, god rays, light sweep, glitch, rain, snow and more.
- **Flash Blur and Flicker Shake transitions** — directional transitions with speed and hardness controls.
- **Bilingual subtitles, fully offline** — Hindi transcription with the built-in captions engine, optional offline translation packs, a stacked second-language caption line, and bilingual subtitle file export.
- **Outline reveal text animation** and code typing animations.
- **Perspective on every element** — text, LaTeX, code, tables, charts, counters and drawings, in addition to shapes, images, video and icons.
- **Draw Arrow** mode — drag on the canvas to draw an arrow, alongside one-click "+ Add Arrow".
- Computer Modern Roman font, arrow curve control, zoom motion effect.

### Improved

- **One-click inserts** — Text, Arrow and Table are added to the scene immediately when clicked in the menu, with their properties open.
- **Audio waveform** shows true peaks across all channels, so quiet speech no longer looks like silence and trims line up with what you hear.
- **Audio stays put** — splitting, resizing, reordering, duplicating or deleting scenes no longer moves or cuts your audio clips. Use the clip's own Split to cut audio.
- **Smooth cuts on split video** — split or trimmed video continues without the brief jump back to the first frame, in the editor, Preview and export.
- **Perspective** is now true perspective: no diagonal seam lines, circles stay round, and text keeps all its styling.
- Rotate handle redesigned; menu tools are alphabetical with Free Cursor first.
- Layers panel ordering and labels, copy/paste keeps positions across scenes, layer ordering shortcuts, undo history auto-save, toast feedback.

### Fixed

- Flash Blur and Flicker Shake did not play in the timeline or Preview.
- Text with perspective was squashed into an unreadable line.
- Pitch-shifted audio drifted out of sync during editor and Preview playback.
- GIF animation timing, local Whisper build issues, and packaging of the Python sandbox and captions engine.
- Active scene highlight color in the timeline.

## 1.3.4 and earlier

See [GitHub Releases](https://github.com/Creatorsai-Lab/luffy-create/releases).
