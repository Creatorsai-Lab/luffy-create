# Luffy AI Editing — Plan

Goal: type an edit in plain English ("split scene 2 at 3s and fade in the title")
and get a correct, reviewable edit — **without an LLM API**. Everything runs
locally: deterministic parsing first, media analysis second, tiny local models
only where rules fail.

All AI code lives in `src/ai/`.

## Principles

1. **Commands are the contract.** The AI never touches UI or store state
   directly. It produces `AiEditorCommand`s (`types.ts`), which are validated
   (`prepare.ts`), shown to the user, and applied (`executor.ts`) as **one undo
   step**. Any future planner (rules, tiny model or LLM) plugs in by producing
   the same commands.
2. **Deterministic and testable.** The same prompt and project always give the same
   plan. Every supported phrasing is pinned by a golden test.
3. **Refer to things by id, not position.** The parser resolves "scene 3" and
   "the red circle" to ids from the project context, so a plan stays correct
   even when an earlier command adds, removes or reorders scenes.
4. **Say what was not understood.** Unparsed parts of a prompt are reported,
   never silently dropped.
5. **Lightweight.** No new runtime dependencies in Phase 1–2. Phase 3 models are
   optional one-time downloads (same mechanism as the Python runtime).

## Current state (before Phase 1)

| Piece | File | State then |
|---|---|---|
| Command types | `types.ts` | 12 commands, creation-focused |
| Validation | `prepare.ts` | Good: clamps, drops unresolvable commands |
| Executor | `executor.ts` | Good: one undo step, allow-listed patch keys |
| Planner | `planner.ts` | Model branch was dead (`window.api.ai` is never provided). Local planner was one regex if-chain |

Known local-planner bugs: colour words match inside words ("centered" → red);
the first "add" match returns early, dropping other requests in the same prompt;
"make the selected text larger" (from the user guide) produces nothing;
numbers attach to the wrong field; only 9 colours.

## Phase 1 — Deterministic prompt parser + video-editing commands

### Parser (`src/ai/parser/`)

| File | Job |
|---|---|
| `text.ts` | Split a prompt into clauses; mask quoted text; read numbers, times (`3s`, `500ms`, `0:12`, `1m 30s`), percents, factors (`2x`, `twice`, `half`), ordinals |
| `colors.ts` | Colour lexicon (common CSS names + `dark`/`light` variants + hex), nearest-colour naming (shared with `prepare.ts`) |
| `refs.ts` | Resolve scene references (`scene 3`, `scenes 2-4`, `all scenes`, `last scene`, `this scene`, `the new scene`) and element references (`selected`, `it`, `the title`, `the red circle`, `the video`, `the music`, `all text`, element names, quoted text) to ids |
| `intents.ts` | One small handler per intent; turns a clause into commands |
| `index.ts` | `parsePrompt(prompt, context)` → plan + issues; carries state across clauses (`it` = what the previous clause created or targeted) |

**Clause splitting.** Newlines, `;`, sentence ends, `then`, and `and`/`,` **only
when followed by an action verb** — so "black and white" and "fade in and out"
stay intact.

**Intents (Phase 1)**

| Intent | Example prompts |
|---|---|
| Add scene | "add a new scene", "add 3 scenes", "add a 5 second scene after scene 2 with title 'Intro'" |
| Add element | "add title 'Hello' at the top", "add a red circle 200x200 in the bottom right", "add @clip.mp4 to scene 2" |
| Remove | "delete scene 3", "remove scenes 2-4", "delete the selected item", "remove all transitions", "remove animations from the title" |
| Duplicate | "duplicate scene 2", "copy the logo" |
| Split | "split scene 2 at 3s", "split at 0:12", "split here", "split scene 1 in half" |
| Scene duration | "make scene 2 5 seconds", "make all scenes 3s long", "extend scene 1 by 2s", "shorten the last scene by 1s" |
| Reorder | "move scene 3 to the start", "move scene 4 before scene 2", "swap scene 1 and 3" |
| Transition | "add a fade transition to scene 3", "use wipe transitions between all scenes", "zoom transition 1s on scene 2" |
| Background | "make the background dark blue", "set scene 2 background to #222", "transparent background" |
| Animate | "fade in the title", "make it spin", "add typewriter to the text", "slide in the image from the left over 1s" |
| Move animation | "move the selected item to the right with speed 400 and delay 1.2s" |
| Position | "move the logo to the top right", "center the title", "center it horizontally" |
| Resize | "make the title bigger", "make it 2x larger", "scale the image to 50%", "resize the video to 800x450", "make the image fill the screen", "font size 72" |
| Style | "make the title red", "change the circle's border to white", "make the text bold", "use Poppins font", "set opacity to 50%", "rename the circle to Badge", "change the title text to 'Hi'" |
| Layer order | "bring the logo to the front", "send it to the back" |
| Media | "mute the video", "set the music volume to 30%", "make the voiceover louder", "speed up the video 2x", "fade in the music over 2s", "trim the first 2 seconds of the video", "trim the video to 5s", "loop the music" |

**New commands** (each maps onto an existing store action):
`removeScene`, `duplicateScene`, `splitScene`, `moveScene`, `setSceneDuration`,
`removeElement`, `duplicateElement`, `arrangeElement`, `alignElement`,
`addAnimation`, `removeAnimations`. `addScene` gains `afterSceneId`. Add commands
take an `alias` so later clauses can say "it". Media properties (volume, mute,
speed, fades, trim, loop) use the existing `updateElement`, with audio keys added
to the executor allow-list.

**Cleanup.** Remove the dead model branch and the "Local planner used…" warning
shown on every request; keep `AI_PLAN_JSON_SCHEMA`/`validateAiPlan` as the
contract for a future model. Command descriptions move to `describe.ts` (used for
the plan summary and the sidebar).

**Tests** (`src/ai/tests/`, part of `npm test`):
- `parser.test.ts`: golden table of prompts → expected commands, plus
  regression cases for the known bugs.
- `executor.test.ts`: run plans against the real store (multi-step plans,
  aliases, removing several scenes, swap, split).

**Done when:** every example in the table above parses correctly, the user
guide examples work, all tests pass, and unknown clauses are reported.

**Status: done.** 107 golden prompts (`tests/parser.test.ts`) and 12 end-to-end
plans (`tests/executor.test.ts`) pass; checked in the running app.

## Phase 2 — Smart edits from media analysis (no models)

The parser emits *smart steps*; the planner analyses the media and expands each
into ordinary commands (`splitScene`, `removeScene`, `setSceneDuration`), so
review and one-step undo work the same way. Code: `src/ai/smart/`.

| Feature | How | Status |
|---|---|---|
| Remove silences / tighten pauses | `speech.ts`: adaptive loudness threshold → speech regions → silent gaps (with 0.15 s padding) cut out of each scene's video | Done |
| Remove filler words | Local Whisper, one segment per word, with a filler-style prompt (plain Whisper drops "um"/"uh"); cut edges snapped to the quietest moment within ±0.12 s | Done, approximate — tiny-model word timings can be 0.2–0.4 s off, so a filler that runs into the next word can be missed. Better: whisper.cpp DTW timestamps (not produced by the current build) or the base model |
| Cut to the beat | `beats.ts`: onset envelope → autocorrelation tempo (70–180 BPM) → beat phase → scene ends snapped to beats under the music | Done (±20 ms on a test track) |
| Split video into shots | `media.ts`/`shots.ts`: colour histograms every 0.25 s, adaptive threshold, cut refined to ~1/30 s | Done (within one frame on a test video) |
| Duck music under voice | Needs volume automation in the audio engine (or many split, faded music clips) | Not started |
| Edit video by deleting transcript text | Builds on the word-level transcript | Not started |

Tests: `tests/smart.test.ts` (synthetic speech, click tracks, frame differences,
and whole prompts with fake media).

## Phase 3 — Tiny local models (optional downloads)

| Model | Size | Use |
|---|---|---|
| Sentence embeddings (MiniLM, quantised) | ~23 MB | Fallback when the grammar finds no intent: match the clause to the nearest example phrase ("jazz up the intro" → animate) |
| Face detection (BlazeFace) | ~200 KB | Auto-reframe 16:9 → 9:16 keeping the speaker in frame |

Whisper is already available for speech.

## Later

An LLM planner can be added behind the same command contract (`schema.ts`); the
deterministic parser stays as the offline/fast path.
