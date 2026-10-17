# Luffy AI Editing — Plan

**Goal:** describe a video in plain language and get a finished, *fully editable*
Luffy project. The editor does the heavy lifting; an AI only decides **what to
build and with which settings**.

All AI code lives in `src/ai/`. Editor features the AI relies on (connectors,
sequencing, groups) live in the editor itself, because people use them by hand too.

---

## 1. Why this wins

Tools that make video with an LLM writing code (HTML, Remotion, Manim) make the
model the renderer. Every video costs a large amount of tokens, and every change
("make the title blue", "add one more layer") means generating it again.

In Luffy the **editor is the renderer**:

| | Code-generated video | Luffy |
|---|---|---|
| Making a video | Model writes every frame's code | Model picks blocks + settings (a few hundred tokens) |
| Small change | Regenerate (full cost again) | Click in the panel — **free** |
| Bigger change | Regenerate | One targeted AI edit — small cost |
| Result | A rendered file | An editable project |

## 2. Principles

1. **The quality comes from the editor, not the LLM.** Layout, timing, colour
   and motion rules live in deterministic **smart blocks**. The LLM never places
   neurons or computes delays one by one — that would burn the same tokens as
   code generation and look worse.
2. **Blocks are flexible, not fixed templates.** Every block is described by
   parameters (counts, labels, colours, timing, style) with sensible defaults.
   "A network with 7 layers" or "12 neurons in layer 2" just changes a value;
   the block re-lays itself out to fit. Limits are soft (warn, adapt), never hard
   failures.
3. **Everything stays editable.** A block becomes a *smart group* that remembers
   its parameters: change a value (by hand or by AI) and only that group
   rebuilds. "Detach" turns it into plain shapes for free-hand tweaking.
4. **Cheap path first.** The local parser handles direct edits instantly and
   for free. The LLM is only used for open, creative requests.
5. **Commands are the contract.** Every planner — parser or LLM — produces the
   same validated commands, shown as a plan and applied as **one undo step**.
6. **Tested.** Every block, every command and every supported phrasing has a test.

## 3. Who we build for

UGC and cinematic creators are the larger market, so their needs come first;
technical explainers (our own videos) come right after and share the same
foundations.

| Priority | Creators | Typical content | What eats their time |
|---|---|---|---|
| 1 | Short-form talking-head (Reels, Shorts, TikTok) | Vlogs, tips, opinions, reactions | Cutting pauses/fillers, captions, reframing to 9:16, keeping the face in frame, B-roll, hooks |
| 2 | Podcast & interview clippers | Clips from long recordings | Finding the good moments, two-speaker layouts, captions |
| 3 | UGC ads / brand creators | Product reviews, unboxing, testimonials | Hook → product → CTA structure, product shots, text callouts, music |
| 4 | Cinematic / montage | Travel, events, weddings, lifestyle | Beat-synced cuts, transitions, titles, speed and colour |
| 5 | Tutorials & screen recordings | Software walkthroughs, courses | Zooms, callouts, step titles |
| 6 | Technical explainers (ML, engineering, agents) | Research breakdowns, system design, code walkthroughs | Diagrams, neural networks, flowcharts, equations, step-by-step animation |

## 4. Architecture

```text
 prompt ──► Planner ──────────────► Plan (commands + block calls) ──► review ──► Apply (1 undo)
            │ local parser (free)                                          │
            │ LLM, tool use (BYOK / Pro)                                   ▼
            └──── compact project summary ◄──────────────────────  Editor
                                                                     ├─ Smart blocks (generators)
                                                                     ├─ Sequencing (stagger / sequence)
                                                                     ├─ Connectors, groups, locking
                                                                     └─ Media analysis (speech, beats, shots, faces)
```

- **Editor foundations** — features the blocks need (section 5).
- **Smart blocks** — deterministic generators with a parameter schema (section 6).
- **Planner** — local parser for direct edits; LLM with tool use for open
  requests (section 7). Both emit the same plan format.

## 5. Editor foundations (build first)

### 5.1 Animation sequencing (replaces the "start" field)
- The per-animation `startTime` field is redundant: the animator only ever adds
  it to `delay`. **Remove it from the UI**; on project load, fold any existing
  `startTime` into `delay` so old projects play exactly the same.
- **Stagger:** apply one animation to many elements with a step
  ("pulse each neuron, 0.1 s apart"), in a chosen order (left→right, top→bottom,
  layer by layer, reverse, random-but-seeded).
- **Sequence:** run groups of animations one after another ("forward pass,
  then backward pass in red"), with optional gaps and repeats.
- Usable from the Motion panel by hand, and as one command for the AI.

### 5.2 Connectors (arrows that can attach)
- An arrow keeps working as free points, **or** either end can attach to an
  element (with an anchor: auto / top / right / bottom / left / centre).
- Attached ends follow the element when it moves, resizes or is re-laid out.
- Needed for every diagram block (networks, flowcharts, pipelines).

### 5.3 Groups and locking
- Group / ungroup, select and move as one, lock (position, or everything).
- **Smart groups**: a group that stores `{ blockId, params, version }` so it can
  be rebuilt from new parameters; "Detach" converts it to a plain group.

### 5.4 Media building blocks for UGC
- **Face tracking → reframe**: a tiny face detector (BlazeFace, ~200 KB,
  optional download) gives per-shot face positions; crop/position follows the
  face for 16:9 → 9:16.
- **Volume automation** (keyframes), for ducking music under speech.
- **Layouts**: split-screen (side by side / top-bottom) and picture-in-picture
  as real element arrangements.

## 6. Smart blocks

### 6.1 Block contract

```ts
interface SmartBlock<P> {
  id: string                       // 'neuralNetwork'
  title: string                    // shown in the UI and to the LLM
  description: string              // one paragraph for the LLM: when to use it
  params: ParamSchema<P>           // types, defaults, soft ranges, descriptions
  build(params: P, frame: Frame): BlockOutput   // elements + animations + connectors
}
```

- `build` is pure and deterministic → snapshot-testable.
- The same `params` schema drives three things: the block's settings panel, the
  LLM tool definition, and validation (clamp + warn, never crash).
- Layout always adapts to the parameters and the frame (16:9, 9:16, 1:1).

### 6.2 Catalogue

**UGC / cinematic (first)**

| Block | Parameters (examples) |
|---|---|
| Title card / chapter break | text, subtitle, style, duration, transition in/out |
| Lower third / name tag | name, role, side, accent colour, animation |
| Hook / CTA overlay | text, emphasis words, position, timing |
| Captions style | preset (bold pop, karaoke, minimal), position, words per line |
| Split-screen / PiP | layout, which clips, border, radius, swap at time |
| B-roll insert | clip, at time / at spoken keyword, duration, cut or overlay |
| Montage | clips, cut on beat every N beats, transition, speed |

**Technical explainers**

| Block | Parameters (examples) |
|---|---|
| Neural network | layers (any count), neurons per layer, layer style (flat / perspective panels), connections (full / sparse), labels, forward/backward pass (colours, stagger, repeats) |
| Flowchart / pipeline | nodes (labels, shapes), edges, direction (LR / TB), auto layout, step-by-step reveal |
| Agent / sequence diagram | actors, messages (tool calls, responses), timing |
| Transformer / attention | tokens, heads, attention weights (heat map), highlight path |
| Matrix / tensor operation | sizes, values or random, operation (multiply, add, conv), cell-by-cell animation |
| Equation reveal | LaTeX, steps, highlight terms |
| Code walkthrough | code, line ranges per step, highlight / zoom (uses the code block) |
| Chart / graph | data, type, axes, draw-on animation (uses existing charts) |

### 6.3 What "flexible" means (example)
"Three-layer network, then make it seven layers with 12 neurons in the middle"
→ the AI changes `layers` from `[3, 4, 2]` to `[3, 6, 8, 12, 8, 6, 2]`. The block
recomputes spacing and neuron size to fit the frame; with very large counts it
switches to a compact style (smaller neurons, "⋮" ellipsis node) and tells the
user, instead of refusing.

## 7. Planner

### 7.1 Local parser (done, keeps growing)
Direct edits, free and instant (see "Done so far"). It will also learn to call
blocks: "add a 3-4-2 neural network with a forward pass", "add a title card
'Chapter 2'".

### 7.2 LLM planner
- **Free plan: bring your own API key** (stored locally, encrypted with the OS
  keychain via Electron `safeStorage`).
- **Pro plan (later):** our backend provides the model; same protocol.
- **Tool use**: the tools are generated from the block catalogue and the command
  list, so adding a block automatically teaches the LLM about it.
- **Small context**: the LLM gets a compact project summary (scenes, elements,
  smart-group params), never the raw project file.
- **Prompt caching**: the editor manual and tool definitions are a cached
  system prompt, so each request pays only for the user's words and the plan.
- **Routing**: try the local parser first; use the LLM when the request is open
  ("make an explainer of backprop") or the parser cannot understand it.
- **Later**: render a few key frames and let the model check its own result.

## 8. Roadmap

| Phase | Work | Status |
|---|---|---|
| 1 | Deterministic prompt parser + video-editing commands | **Done** |
| 2 | Smart edits from media analysis (silences, fillers, beats, shots) | **Done** (fillers approximate) |
| 3 | Foundations: sequencing (stagger/sequence, remove `startTime`), connectors, groups + locking, smart groups | **Done** |
| 4 | UGC blocks v1: title card, lower third, hook/CTA, split-screen/PiP, captions styles; face reframe; volume automation + ducking | **Done** (4a blocks; 4b ducking, placement, caption presets; 4c face reframe) |
| 5 | Technical blocks v1: neural network, flowchart/pipeline, equation reveal, code walkthrough | **Done** |
| 6 | LLM planner (BYOK): tools from the block catalogue, compact context, caching, routing | |
| 7 | More blocks (agents, attention, matrix, montage, B-roll); Pro backend; self-check on rendered frames | |

**How we measure success**
- Time to build our 3-layer network with forward/backward pass: about an hour by
  hand today → under 2 minutes, then fully editable.
- A talking-head clip → captioned, reframed, pause-free 9:16 video in one request.
- Tokens per created video in the low thousands; most edits use no tokens at all.

---

## Done so far

### /history, /undo and the Planner
- `/history` and `/undo #id` in the AI prompt (`PROMPT_COMMANDS` in
  `src/ai/promptTokens.ts`); after "/undo " the suggestion list shows the
  project's AI edits. Commands are amber, add-ons violet, media sky blue.
- Planner (app-wide notes, not in projects): `electron/main/planner.ts` keeps
  `userData/planner/planner.json` (atomic writes, last good version as
  `planner.bak.json`, ordered save queue, input clean-up); renderer store
  `src/planner/plannerStore.ts` (autosave 0.5 s after typing, flush on close);
  `PlannerModal` (cards → full editor) opened from the title bar.

### Add-on perspective, undo by edit number, plan preview
- Whole groups / add-ons in perspective as one plane: `SceneGroup.perspective`
  (corners as fractions of the group box, so it survives moves, rebuilds and
  copies). `GroupPerspective` renders members into a hidden source and warps
  the capture (canvas, Preview window and export); the same Perspective panel
  and handles (`QuadHandles`) drive it when a whole group is selected.
- AI edits numbered per project (`src/ai/editLog.ts`); `undo #N` is a selective
  revert (`src/ai/revert.ts`): scenes/elements/settings the edit changed go back
  only where they still match the edit's result; the rest is kept and listed.
- Plan preview (`src/ai/preview.ts`): the plan is tried with history off, each
  changed scene captured before/after from the live stage, then everything
  (project, scene, playhead, selection, unsaved flag) is put back.

### Add-ons in prompts (between Phase 5 and 6)
- "Blocks" are called **Add-ons** in the UI (menu, panel, plan preview,
  guide); code keeps the `blocks` names.
- Slash commands (`SmartBlock.command`, `findAddon`: exact, unique start, or a
  one-letter slip) name an add-on exactly; "to/in/of /flowchart" points at the
  one on the scene. "with N seconds delay" / "after Ns" set its start.
- Composer: one list for `/` add-ons and `@` media (6 rows, ↑/↓, Enter/Tab,
  Esc); commands and mentions in colour (a mirrored layer under a transparent
  textarea, same font so the caret stays aligned; monospace in sent messages
  and the list); a copy button under each sent prompt. `src/ai/promptTokens.ts`.
- Arrow head styles: triangle, open, dot, ring, diamond, square, bar
  (`ArrowElement.headStyle`, `src/engine/arrowHeads.ts`).

### Phase 5 — Technical blocks v1
- Engine: `list` fields (numbers or texts, split on what people type; LaTeX
  splits on new lines only), multi-line `keepLines` text (code), a per-block
  `parse` hook for block-specific phrasing, and `refers` ("the network") so
  "add a step to the flowchart" edits while "add a flowchart" inserts.
  `LatexElement.fitContent` draws equations at natural size inside their box.
  Code geometry shared in `src/utils/codeLayout.ts` (renderer + highlights).
- `neuralNetwork`: any layers (≤12) of any size; neurons shown as fit (≤16 per
  layer, else first/last + "⋮" and the size in the label); full/sparse/no
  connections (attached arrows); forward / forward+backward pulse pass
  (repeating); layer-by-layer entrance; portrait runs top → bottom.
  Phrasing: architectures, inputs/hidden/outputs, "N layers with M in the
  middle" (rise-and-fall shape), add/remove a layer, set one layer.
- `flowchart`: steps + chain + extra links ("4>2 retry"); levels (branches side
  by side), snake wrap for long chains, decisions as diamonds, loops as dashed
  arcs with labels at the apex, step-by-step reveal, flow pulse. Keys follow
  step names, so edits keep the other steps' ids. Phrasing: arrows lists,
  quotes, add/remove/rename steps (links follow), connect back with a label.
- `equationReveal`: stacked or replacing steps, newest step marked (MathJax's
  bundled `\color` did not colour reliably in a hidden-window check, so terms
  aren't coloured inside an equation).
- `codeWalkthrough`: code sized to fit, highlights per line range handing
  over step to step, notes beside (16:9) or below (9:16), optional typing.
- Checked: every block fits 16:9 and 9:16 under stress (784-wide 8-layer
  network, 14 long steps, 8 equation steps, 40 code lines); rebuilds keep
  neuron ids and attachments; geometry previews rendered and inspected.

### Phase 4c — Auto reframe (follow the face)
- Moving crop: `VideoElement.cropKeys` (crop centre over source time; size from
  `crop`) and `src/utils/cropKeys.ts`; VideoKonva reads the crop at the frame
  on screen, so editor, preview and export match. A hand-made crop clears it.
- Faces: `src/ai/smart/faces.ts` — MediaPipe Tasks Vision 1.0.1 (BlazeFace
  short range, Apache-2.0), fully offline: WASM served from node_modules by a
  small Vite plugin (`/mediapipe/`, SIMD build only, ~12 MB), model in
  `public/models/` (230 KB). Frames are checked whole and in three square
  tiles — in a wide frame the whole-frame pass missed a small face that the
  tiles found (checked in a hidden Electron window).
- Framing: `src/ai/smart/reframe.ts` — main-face tracking (biggest face,
  followed while near), gap filling, shot cuts, steady-per-shot vs dead-zone
  follow with smoothing, head room, key simplification.
- Smart step `reframe` → `setCropTrack`; "fill" puts the clip over the whole
  frame first. Video panel "Auto reframe" (Fill frame / In place; Steady /
  Auto / Follow; Stop following).
- Tests: synthetic face tracks (still, walking, cut, lost, crowd, head room),
  a whole prompt on a 9:16 project, parser phrases.

### Phase 4b — Ducking, media layout, caption presets
- Volume automation: `AudioElement.volumeKeys` (gain at source seconds, so
  trims/splits/speed never misalign it). `src/utils/volumeKeys.ts` drives the
  preview gain, a flat (non-nested) FFmpeg `volume` expression for export
  (checked with real FFmpeg) and the curve drawn on timeline clips.
- Ducking: `src/ai/smart/duck.ts` (speech ranges → keys; holds through short
  pauses). Smart step `duckMusic` listens to unmuted video and voiceover clips
  (existing speech detection) and emits `setVolumeKeys` per music clip.
  "Duck under voice" in the audio panel uses the same path (`planSmartSteps`).
- Media layout: `src/utils/mediaLayout.ts` — `layoutMedia` (side by side,
  stacked, grid; "split" = stacked in portrait) and `placeInRegion` (one clip in
  an area: cover / contain / stretch; a single size follows the clip's shape).
  Commands `arrangeMedia` and `placeMedia` (exact region in scene px).
  Group Effects → Layout for split screens. PiP/fill buttons were dropped in
  favour of direct placement by the agent: `parser/place.ts` reads areas
  (full screen, halves, thirds, quarters, corners with size and margin,
  "top 60%", "at x 100 y 200") against the scene size and pairs them with the
  clips named ("video 1", "video_id_2", "this video" × n, "one … the other").
- Captions: style fields `uppercase`, `strokeColor/Width`, `activeColor`
  (spoken word), `boxColor/Opacity`; karaoke spreads over the cue. Presets in
  `src/subtitle/presets.ts` (Bold, Karaoke, Boxed, Minimal, Pop; frame-relative
  sizes). Command `setCaptionStyle`; preset chips in the Captions window.
- Parser: `parser/layout.ts`, `parser/captions.ts` ("…, and move them to the
  bottom" keeps meaning the captions), ducking phrases in the smart handler.
- Tests: `scripts/mediaLayout.test.ts`; ducking keys + FFmpeg filter + whole
  prompt with synthetic speech in `smart.test.ts`; parser and executor cases.
- Next: face-tracked reframe (needs a local face model), then Phase 5.

### Phase 4a — First UGC blocks
- Block engine: fields schema (`src/blocks/fields.ts`: text, number, colour,
  select, toggle, each with the words people use for it) drives three things
  at once — `normalizeFields` (clamps and repairs any input), the generated
  Blocks panel form, and the AI parser. A new block needs no UI or parser code.
- Layout helpers (`src/blocks/layout.ts`): frame unit, portrait check, text
  measuring, word wrap — blocks fit 16:9 and 9:16 with long text.
- Blocks: `titleCard` (centered / left bar / boxed, dim or solid background,
  rise / fade / pop, hold time), `lowerThird` (left/right, bar / pill /
  minimal, show at / hide after), `hook` (one element per word, highlighted
  words, pill / outline / plain, word-by-word pop with a step, start time).
- UI: Blocks menu (catalogue + settings form, debounced text, Detach, Delete);
  selecting a whole smart group opens it; rebuilding keeps the selection.
- AI: `src/ai/parser/blocks.ts` — "add a lower third for 'A' 'B' on the right",
  "make the lower third red", "…, and put it on the left" (`lastBlock`),
  "delete / fade the hook" (block phrases refer to the smart group).
- Tests: `scripts/blocks.test.ts` (fit in both frames, bad input, keys,
  timing, rebuild keeps ids), parser and executor cases.
- Next in Phase 4: split-screen / PiP, caption style presets, face-tracked
  reframe, volume automation + music ducking.

### Phase 3c — Groups, locking, smart groups
- Groups: members share `groupId`; `Scene.groups` keeps name (and smart-block
  info). Click a member → whole group; Alt-click / Layers → one member;
  Shift-click toggles the group. Ctrl+G / Ctrl+Shift+G and right-click Group,
  Ungroup, Select whole group, Lock/Unlock (a group locks as a whole). Copies
  (paste, Ctrl+D, menu Duplicate — one `insertCopies` path) become new groups;
  groups prune themselves below two members. Canvas name tag + Layers chips.
- Smart blocks: `src/blocks/registry.ts` (`SmartBlock`: defaults, normalize,
  build with `blockKey` per part). Store `insertBlock`, `rebuildBlock` (same
  ids for the same parts, keeps the user's move, same layer position, outside
  connectors survive), `detachBlock`.
- AI: `groupElements`, `ungroupElements`, generic `insertBlock` /
  `updateBlock`; groups referenced by name or "the group"; context carries
  groups and block settings.
- Tests: `scripts/groups.test.ts` (incl. a test block), parser + executor cases.

### Phase 3b — Connectors
- `src/utils/connectors.ts`: an arrow end can attach to an element (anchor auto
  / top / right / bottom / left / centre; auto faces the other end). The store
  re-syncs attached ends whenever an element moves or resizes, releases ends whose
  element is deleted or that are dragged by hand, and remaps them on scene split
  and duplicate. Live follow while dragging.
- `connectionPairs` (chain / columns / hub) + `makeConnector`; store
  `addElements(els, { behind })` adds many at once under everything.
- UI: Group Effects → Connect; per-arrow Connections in the Arrow panel.
- AI: `connectElements` ("connect A to B", "connect all circles in a chain",
  "fully connect … layer by layer", new items in the same request).
- Tests: `scripts/connectors.test.ts`, parser + executor cases.

### Phase 3a — Sequencing
- `src/utils/stagger.ts`: `staggerGroups` (order + rows/columns together),
  `buildSequence` (waves one after another, shared repeat period),
  `animationsEnd` ("after last"). Pure and tested (`scripts/stagger.test.ts`).
- Animations: `startTime` removed (it was always added to `delay`); old projects
  are migrated on load (`src/store/migrateProject.ts`). New `repeatEvery` on
  loops: play once per period, rest in between — the building block of a
  repeating forward/backward pass.
- Colour Pulse ("flash") now works on shapes (fill) and arrows (line), not only text.
- UI: Stagger card in the Motion panel when 2+ items are selected.
- AI: `animateSequence` command; "one by one", "0.2s apart", "layer by layer",
  "left to right", "…, then flash them red right to left and repeat" (consecutive
  wave clauses merge and mirror the previous wave's timing).

### Phase 1 — Deterministic prompt parser + commands
`src/ai/parser/`: clause splitting (`text.ts`), colours (`colors.ts`), scene and
element references by number, range, kind, colour, name, quoted text, "it"
(`refs.ts`), one handler per intent (`intents.ts`).

Supported: add/delete/duplicate/split/reorder/resize scenes, scene duration,
transitions, backgrounds, adding text/shapes/assets, animations, move
animations, position, resize, style, layer order, audio/video volume, speed,
fades, trim and loop. Commands use ids, so multi-step plans stay correct; unknown
parts of a prompt are reported. Tests: 107 golden prompts
(`tests/parser.test.ts`), 12 end-to-end plans (`tests/executor.test.ts`).

### Phase 2 — Smart edits from media analysis
The parser emits *smart steps*; `src/ai/smart/` analyses the media and expands
them into normal commands.

| Feature | How | Status |
|---|---|---|
| Remove silences | Adaptive loudness threshold → speech regions → gaps cut (0.15 s padding) | Done |
| Remove filler words | Local Whisper with word segments and a filler-style prompt; cut edges snapped to quiet points | Done, approximate (tiny-model word timings can be 0.2–0.4 s off) |
| Cut to the beat | Onset envelope → tempo → beat phase → scene ends snapped to beats | Done (±20 ms) |
| Split into shots | Colour histograms every 0.25 s, cut refined to ~1/30 s | Done (within one frame) |
| Duck music under voice | Speech detection → volume automation on the music | **Done** (Phase 4b) |
| Edit by deleting transcript text | Builds on word-level transcript | Not started |

Tests: `tests/smart.test.ts`.
