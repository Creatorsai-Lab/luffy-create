# Local Bilingual Subtitle Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, offline English/Hindi subtitle translation with contextual quality safeguards, editable review state, a compact bilingual canvas stack, and source/translated/bilingual SRT export.

**Architecture:** Keep project data and rendering helpers in `src/subtitle`, expose a narrow translation API through Electron preload, and place model download, verification, and worker execution in a focused Electron main-process service. Translation uses separate AI4Bharat IndicTrans2 distilled 200M CTranslate2 INT8 packs selected by direction and platform; only the requested pack is downloaded, and all caption text remains local.

**Tech Stack:** React 18, TypeScript 5.5, Zustand, Electron 32 IPC, React-Konva/Konva, Node streams/crypto, bundled Python 3.12, CTranslate2 INT8, SentencePiece, AI4Bharat IndicTrans2 preprocessing.

**Spec:** `docs/superpowers/specs/2026-09-08-local-bilingual-subtitle-translation-design.md`

## Global Constraints

- No caption text leaves the computer.
- The base editor must not bundle translation models.
- Each optional direction pack must be 500 MB or smaller.
- Support English to Hindi and Hindi to English through separate on-demand packs.
- Preserve existing cue timing and IDs.
- Keep both language rows to one line each within 90% of the canvas width.
- English renders above Hindi regardless of source language.
- Translation runs only when the user clicks **Translate captions** or a cue's retranslate action.
- Machine translation is never considered reviewed automatically.
- Old projects without translation fields must continue to load unchanged.
- Do not introduce a cloud API, paid service, backend, or model weight into the base installer.

---

### Task 1: Establish the Test Harness and Translation Data Model

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/types/editor.ts:558-595`
- Modify: `src/subtitle/types.ts`
- Create: `scripts/run-subtitle-tests.mjs`
- Create: `scripts/subtitleTranslationTypes.test.ts`
- Modify: `scripts/subtitleStyle.test.ts`

**Interfaces:**
- Produces: `SubtitleLanguage`, `SubtitleTranslation`, `SubtitleGlossaryEntry`, `SubtitleTranslatedStyle`, and `SubtitleTranslationSettings`.
- Produces: `defaultSubtitleTranslationSettings(targetLanguage)` and backward-compatible `normalizeSubtitleTrack(track)`.
- Consumes: existing `SubtitleCue`, `SubtitleStyle`, `SubtitleTrack`, and `normalizeSubtitleStyle`.

- [ ] **Step 1: Add a locally installed TypeScript test runner and stable subtitle test command**

Run:

```powershell
npm install --save-dev tsx
```

Create `scripts/run-subtitle-tests.mjs` so Windows does not depend on shell glob expansion:

```js
import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const files = (await readdir('scripts'))
  .filter(name => /^subtitle.*\.test\.ts$/i.test(name))
  .sort()
for (const file of files) {
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--no-install', 'tsx', `scripts/${file}`], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
```

Add this script to `package.json`:

```json
"test:subtitle": "node scripts/run-subtitle-tests.mjs"
```

- [ ] **Step 2: Write the failing backward-compatibility and default-setting tests**

Create `scripts/subtitleTranslationTypes.test.ts` with assertions equivalent to:

```ts
import assert from 'node:assert/strict'
import { makeSubtitleTrack, normalizeSubtitleTrack } from '../src/subtitle/types'

const fresh = makeSubtitleTrack()
assert.equal(fresh.language, 'en')
assert.equal(fresh.translation?.targetLanguage, 'hi')
assert.equal(fresh.translation?.visible, true)
assert.deepEqual(fresh.translation?.glossary, [])
assert.equal(fresh.translation?.style.fontFamily, 'Poppins')
assert.equal(fresh.translation?.style.sizePct, 90)
assert.equal(fresh.translation?.style.rowGap, 8)

const legacy = normalizeSubtitleTrack({
  id: 'legacy', name: 'Legacy', language: 'hi', enabled: true, cues: [],
  style: { ...fresh.style, maxWidthPct: 120 },
})
assert.equal(legacy.style.maxWidthPct, 100)
assert.equal(legacy.translation?.targetLanguage, 'en')
assert.equal(legacy.translation?.style.fontFamily, undefined)
```

Update `scripts/subtitleStyle.test.ts` to assert the intended compact defaults that are already required by the accepted caption design:

```ts
assert.equal(defaults.maxWidthPct, 90)
assert.equal(defaults.positionX, 50)
assert.equal(defaults.positionY, 88)
```

- [ ] **Step 3: Run the new test to verify the model is missing**

Run:

```powershell
npx --no-install tsx scripts/subtitleTranslationTypes.test.ts
```

Expected: FAIL because the translation settings and `normalizeSubtitleTrack` do not exist.

- [ ] **Step 4: Add the persisted types and normalized defaults**

Add to `src/types/editor.ts`:

```ts
export type SubtitleLanguage = 'en' | 'hi'

export interface SubtitleTranslation {
  text: string
  reviewed?: boolean
  sourceHash: string
  warnings?: string[]
}

export interface SubtitleGlossaryEntry {
  id: string
  source: string
  target: string
}

export interface SubtitleTranslatedStyle {
  fontFamily?: string
  sizePct: number
  color?: string
  rowGap: number
}

export interface SubtitleTranslationSettings {
  targetLanguage: SubtitleLanguage
  visible: boolean
  glossary: SubtitleGlossaryEntry[]
  style: SubtitleTranslatedStyle
}
```

Extend the existing interfaces without changing stored cue timing:

```ts
export interface SubtitleCue {
  id: string
  start: number
  end: number
  text: string
  translations?: Partial<Record<SubtitleLanguage, SubtitleTranslation>>
}

export interface SubtitleTrack {
  id: string
  name: string
  language: SubtitleLanguage
  enabled: boolean
  cues: SubtitleCue[]
  sourceAudioIds?: string[]
  style: SubtitleStyle
  translation?: SubtitleTranslationSettings
}
```

In `src/subtitle/types.ts`, set `maxWidthPct: 90` and `positionY: 88`, then add:

```ts
export function defaultSubtitleTranslationSettings(targetLanguage: SubtitleLanguage): SubtitleTranslationSettings {
  return {
    targetLanguage,
    visible: true,
    glossary: [],
    style: {
      fontFamily: targetLanguage === 'hi' ? 'Poppins' : undefined,
      sizePct: 90,
      rowGap: 8,
    },
  }
}

export function normalizeSubtitleTrack(track: SubtitleTrack): SubtitleTrack {
  const language: SubtitleLanguage = track.language === 'hi' ? 'hi' : 'en'
  const targetLanguage: SubtitleLanguage = track.translation?.targetLanguage === language
    ? (language === 'en' ? 'hi' : 'en')
    : track.translation?.targetLanguage ?? (language === 'en' ? 'hi' : 'en')
  const defaults = defaultSubtitleTranslationSettings(targetLanguage)
  return {
    ...track,
    language,
    style: normalizeSubtitleStyle(track.style),
    translation: {
      ...defaults,
      ...track.translation,
      targetLanguage,
      glossary: track.translation?.glossary ?? [],
      style: { ...defaults.style, ...track.translation?.style },
    },
  }
}
```

Make `makeSubtitleTrack()` return `translation: defaultSubtitleTranslationSettings('hi')`.

- [ ] **Step 5: Run the focused tests and commit**

Run:

```powershell
npm run test:subtitle
```

Expected: every `subtitle*.test.ts` file present at this task boundary PASS.

Commit:

```powershell
git add package.json package-lock.json src/types/editor.ts src/subtitle/types.ts scripts/run-subtitle-tests.mjs scripts/subtitleStyle.test.ts scripts/subtitleTranslationTypes.test.ts
git commit -m "feat: add bilingual subtitle data model"
```

---

### Task 2: Add Source Hashing, Cue Invalidation, and Language Resolution

**Files:**
- Create: `src/subtitle/translation.ts`
- Modify: `scripts/subtitleTranslationTypes.test.ts`
- Modify: `src/subtitle/SubtitleModal.tsx:51-66,504-505`

**Interfaces:**
- Consumes: `SubtitleCue`, `SubtitleLanguage`, `SubtitleTrack`, `SubtitleTranslation` from Task 1.
- Produces: `sourceTextHash(text): string`, `getCueText(cue, sourceLanguage, requestedLanguage): string`, `updateCueSource(cue, text): SubtitleCue`, `mergeCueTranslation(cue, language, text, warnings): SubtitleCue`, and `setCueReviewed(cue, language, reviewed): SubtitleCue`.

- [ ] **Step 1: Add failing tests for stable hashing and edit behavior**

Append:

```ts
import {
  getCueText, mergeCueTranslation, setCueReviewed, sourceTextHash, updateCueSource,
} from '../src/subtitle/translation'

const cue = { id: 'c1', start: 1, end: 2, text: 'Energy = mc^2' }
const translated = mergeCueTranslation(cue, 'hi', 'ऊर्जा = mc^2', [])
assert.equal(getCueText(translated, 'en', 'hi'), 'ऊर्जा = mc^2')
assert.equal(translated.translations?.hi?.sourceHash, sourceTextHash(cue.text))
assert.equal(translated.translations?.hi?.reviewed, false)
assert.equal(setCueReviewed(translated, 'hi', true).translations?.hi?.reviewed, true)
const edited = updateCueSource(setCueReviewed(translated, 'hi', true), 'Energy equals mc^2')
assert.equal(edited.translations?.hi?.reviewed, false)
assert.ok(edited.translations?.hi?.warnings?.includes('Source caption changed'))
```

- [ ] **Step 2: Run the test to verify the helper module is missing**

Run: `npx --no-install tsx scripts/subtitleTranslationTypes.test.ts`

Expected: FAIL with a missing `src/subtitle/translation` module.

- [ ] **Step 3: Implement immutable cue helpers**

Use a small deterministic FNV-1a hash because the source hash detects edits and is not a security checksum:

```ts
export function sourceTextHash(text: string) {
  let hash = 0x811c9dc5
  for (const ch of text.trim().replace(/\s+/g, ' ')) {
    hash ^= ch.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
```

Implement the remaining helpers so they clone only the cue and selected language entry, never change `id`, `start`, or `end`, never duplicate source text under `translations`, and reset `reviewed` to `false` whenever source or translated text changes.

- [ ] **Step 4: Route caption edits through `updateCueSource` and normalize loaded tracks**

Replace `SubtitleModal`'s local source-text patch with:

```ts
function updateCueText(id: string, text: string) {
  setTrack(current => ({
    ...current,
    cues: current.cues.map(cue => cue.id === id ? updateCueSource(cue, text) : cue),
  }))
}
```

Use `normalizeSubtitleTrack` both for initial state and before `upsertSubtitleTrack`.

- [ ] **Step 5: Verify and commit**

Run: `npx --no-install tsx scripts/subtitleTranslationTypes.test.ts`

Expected: PASS.

Commit:

```powershell
git add src/subtitle/translation.ts src/subtitle/SubtitleModal.tsx scripts/subtitleTranslationTypes.test.ts
git commit -m "feat: track subtitle translation freshness"
```

---

### Task 3: Build Context Chunks, Protect Technical Content, and Validate Results

**Files:**
- Create: `electron/main/subtitleTranslationCore.ts`
- Create: `scripts/subtitleTranslationCore.test.ts`

**Interfaces:**
- Produces: `TranslationInputCue`, `TranslationChunk`, `ProtectedChunk`, `TranslationWarningCode`, `buildTranslationChunks(cues, maxWords)`, `protectTranslationChunk(chunk, glossary)`, `restoreTranslationChunk(text, tokens)`, `parseTranslatedChunk(text, expectedCueIds)`, and `validateTranslation(source, translated, language, protectedValues)`.
- Consumes: glossary entries shaped as `{ source: string; target: string }` and cue inputs shaped as `{ id: string; text: string }`.

- [ ] **Step 1: Write failing deterministic core tests**

Create cases covering:

```ts
const cues = [
  { id: 'a', text: 'Einstein wrote E = mc^2 in 1905.' },
  { id: 'b', text: 'Read https://example.org and keep DNA unchanged.' },
]
const chunks = buildTranslationChunks(cues, 120)
assert.deepEqual(chunks[0].cueIds, ['a', 'b'])

const protectedChunk = protectTranslationChunk(chunks[0], [
  { source: 'Einstein', target: 'आइंस्टीन' },
  { source: 'DNA', target: 'DNA' },
])
assert.ok(!protectedChunk.text.includes('1905'))
assert.ok(!protectedChunk.text.includes('https://example.org'))

const translatedWire = protectedChunk.text
  .replace('wrote', 'ने लिखा')
  .replace('Read', 'पढ़ें')
const restored = restoreTranslationChunk(translatedWire, protectedChunk.tokens)
const parsed = parseTranslatedChunk(restored, ['a', 'b'])
assert.equal(parsed.size, 2)
assert.match(parsed.get('a') ?? '', /1905/)
assert.match(parsed.get('b') ?? '', /https:\/\/example\.org/)
assert.throws(() => parseTranslatedChunk(restored.replace('__LF_CUE_b__', ''), ['a', 'b']))
```

Also assert longest glossary match first, duplicate marker rejection, reordered marker rejection, empty output warning, unchanged output warning, Latin/Devanagari script warning, and unusual length warning.

- [ ] **Step 2: Run the core test to verify failure**

Run: `npx --no-install tsx scripts/subtitleTranslationCore.test.ts`

Expected: FAIL because the core module does not exist.

- [ ] **Step 3: Implement bounded contextual chunking and cue markers**

Normalize whitespace, omit empty cues, keep timeline order, and group adjacent cues until adding the next cue would exceed `maxWords`. Serialize each chunk as:

```text
__LF_CUE_a__ Einstein wrote E = mc^2 in 1905.
__LF_CUE_b__ Read https://example.org and keep DNA unchanged.
```

Reject translated chunks unless every expected `__LF_CUE_<id>__` marker appears exactly once and in order.

- [ ] **Step 4: Implement deterministic protected tokens**

Match longest glossary entries first, then URLs/emails, formulas, numbers with units, code fragments, and uppercase abbreviations. Replace matches with sequential tokens such as `__LF_KEEP_0001__`. Store both the original source and required restored target, using the glossary target when present and the original value otherwise. Restoration must fail if a token is absent or duplicated.

- [ ] **Step 5: Implement explicit validation warnings**

Return stable warning codes/messages for:

```ts
type TranslationWarningCode =
  | 'empty-output'
  | 'unchanged-output'
  | 'length-outlier'
  | 'missing-protected-value'
  | 'unexpected-script'
```

Use a translated/source character ratio outside `0.2..5` as a length outlier. Warn for Hindi when fewer than 25% of letters are Devanagari and for English when fewer than 50% of letters are Latin. Do not classify digits or punctuation as letters.

- [ ] **Step 6: Run tests and commit**

Run: `npx --no-install tsx scripts/subtitleTranslationCore.test.ts`

Expected: PASS.

Commit:

```powershell
git add electron/main/subtitleTranslationCore.ts scripts/subtitleTranslationCore.test.ts
git commit -m "feat: validate contextual subtitle translation"
```

---

### Task 4: Add the Local CTranslate2 Worker and Reproducible Pack Builder

**Files:**
- Create: `resources/translation/install_pack.py`
- Create: `resources/translation/runner.py`
- Create: `scripts/build-translation-pack.mjs`
- Create: `scripts/verify-translation-pack.mjs`
- Create: `scripts/fixtures/fake-translation-runner.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `electron-builder` configuration in `package.json`
- Create during release build: `resources/translation/model-catalog.json`

**Interfaces:**
- Produces newline-delimited JSON worker protocol: request `{ jobId, sourceLanguage, targetLanguage, chunks }`; response `{ jobId, chunkId, text }` or `{ jobId, error }`.
- Produces catalog entries keyed by `en-hi`/`hi-en` and `${process.platform}-${process.arch}` with `url`, `bytes`, `sha256`, and `version`.
- Consumes AI4Bharat official distilled Fairseq archives and converts them with CTranslate2 INT8.

- [ ] **Step 1: Create the fake runner used by service tests**

The fixture must read one JSON object per stdin line and return the same markers with deterministic translated text:

```js
import readline from 'node:readline'
const lines = readline.createInterface({ input: process.stdin })
for await (const line of lines) {
  const request = JSON.parse(line)
  for (const chunk of request.chunks) {
    process.stdout.write(JSON.stringify({
      jobId: request.jobId,
      chunkId: chunk.id,
      text: chunk.text.replace(/\bhello\b/gi, 'नमस्ते'),
    }) + '\n')
  }
}
```

- [ ] **Step 2: Implement safe archive extraction**

`install_pack.py` accepts `archive`, `destination`, and `max_bytes`. It rejects absolute paths, `..` members, symlinks, and expanded totals above `max_bytes`, extracts into a sibling temporary directory, and renames only after all members are valid. It prints one JSON result to stdout and deletes the temporary directory on failure.

- [ ] **Step 3: Implement the real long-lived worker**

`runner.py` adds `<pack>/python` to `sys.path`, loads one `ctranslate2.Translator(<pack>/model, device="cpu", compute_type="int8", inter_threads=1)`, and loads `model.SRC`/`model.TGT` with SentencePiece. Use `eng_Latn` and `hin_Deva` language tags, AI4Bharat-compatible English/Hindi normalization/tokenization, `beam_size=5`, `max_input_length=160`, and `max_decoding_length=256`. Keep the model loaded for the job, translate each contextual chunk once, flush every JSON response immediately, and exit on malformed input rather than emitting partial unassociated text.

- [ ] **Step 4: Implement the pack builder**

Add package scripts:

```json
"build:translation-pack": "node scripts/build-translation-pack.mjs",
"verify:translation-pack": "node scripts/verify-translation-pack.mjs"
```

The builder must:

1. Download AI4Bharat's official `en-indic-dist.tar.gz` or `indic-en-dist.tar.gz` Fairseq archive.
2. Convert with `ct2-fairseq-converter --quantization int8`.
3. Install only `ctranslate2`, `sentencepiece`, `sacremoses`, `indic-nlp-library`, and their runtime dependencies into `<pack>/python`.
4. Copy `runner.py`, the two SentencePiece vocab files, MIT licenses, and model files.
5. Name the archive `indictrans2-${direction}-int8-${platform}-${arch}.tar.gz`, compute SHA-256 plus compressed and expanded byte sizes, reject either size over `524288000` bytes, and update `model-catalog.json` with `https://github.com/Creatorsai-Lab/luffy-create/releases/download/translation-models-v1/${assetName}`.

- [ ] **Step 5: Verify both direction packs on each release platform**

Run for each supported build machine:

```powershell
npm run build:translation-pack -- --direction en-hi
npm run verify:translation-pack -- --archive build/translation-packs/indictrans2-en-hi-int8-win32-x64.tar.gz
npm run build:translation-pack -- --direction hi-en
npm run verify:translation-pack -- --archive build/translation-packs/indictrans2-hi-en-int8-win32-x64.tar.gz
```

Expected: each verifier prints `valid=true`, `computeType=int8`, a successful educational sentence translation, `archiveBytes <= 524288000`, and `expandedBytes <= 524288000`.

- [ ] **Step 6: Package only installer/catalog support with the base app and commit**

Add this `extraResources` entry; model archives remain GitHub release assets and are not copied into the app:

```json
{
  "from": "resources/translation",
  "to": "translation",
  "filter": ["install_pack.py", "model-catalog.json"]
}
```

Commit source and the generated catalog, but not `build/translation-packs`:

```powershell
git add package.json package-lock.json resources/translation scripts/build-translation-pack.mjs scripts/verify-translation-pack.mjs scripts/fixtures/fake-translation-runner.mjs
git commit -m "build: prepare optional subtitle translation packs"
```

---

### Task 5: Implement Verified Model Installation and Worker Execution

**Files:**
- Create: `electron/main/subtitleTranslationPack.ts`
- Create: `electron/main/subtitleTranslationService.ts`
- Create: `scripts/subtitleTranslationPack.test.ts`
- Modify: `electron/main/index.ts:220-260,994-996`

**Interfaces:**
- Consumes: model catalog and Python resolver/process execution patterns from `electron/main/index.ts`.
- Consumes: Task 3 chunk/protection/validation functions and Task 4 worker protocol.
- Produces: `getStatus(direction)`, `install(direction, onProgress)`, `remove(direction)`, `translate(request, onProgress)`, and `cancel(jobId)`.

- [ ] **Step 1: Write pack-manager tests with temporary directories**

Use `mkdtemp(join(tmpdir(), 'luffy-translation-'))` and injected `fetch`, extractor, and spawn functions. Create a fresh manager for each response, then assert:

```ts
const manager = createTranslationPackManager({ root, catalog, fetch: validFetch, extract, spawn })
assert.deepEqual(await manager.getStatus('en-hi'), { state: 'not-installed', direction: 'en-hi' })
const oversizedManager = createTranslationPackManager({ root, catalog, fetch: oversizedFetch, extract, spawn })
await assert.rejects(() => oversizedManager.install('en-hi', () => {}), /500 MB/)
const corruptManager = createTranslationPackManager({ root, catalog, fetch: badChecksumFetch, extract, spawn })
await assert.rejects(() => corruptManager.install('en-hi', () => {}), /checksum/i)
assert.equal(await pathExists(finalPackDir), false)
await manager.install('en-hi', () => {})
assert.equal((await manager.getStatus('en-hi')).state, 'installed')
await manager.remove('en-hi')
assert.equal((await manager.getStatus('en-hi')).state, 'not-installed')
```

Also test cancellation removes `.download` and `.installing` paths and that only the requested direction is removed.

- [ ] **Step 2: Run the pack test to verify failure**

Run: `npx --no-install tsx scripts/subtitleTranslationPack.test.ts`

Expected: FAIL because the pack manager does not exist.

- [ ] **Step 3: Implement the pack manager**

Store packs under `join(app.getPath('userData'), 'translation-models', direction, version)`. Stream downloads to `<direction>.download`, count bytes while writing, abort above `524288000`, compute SHA-256 during the stream, compare it with the catalog, call `install_pack.py`, verify the installed manifest and runner, then atomically rename `.installing` to the version directory. Never use a renderer-provided URL, checksum, filesystem path, or command.

- [ ] **Step 4: Implement one-worker translation jobs**

`subtitleTranslationService.ts` must reject a second active job, start the installed pack's `runner.py` with the resolved bundled Python, set `PYTHONPATH` to `<pack>/python`, send protected chunks over stdin, parse only newline-delimited JSON matching the active job/chunk IDs, validate/restores each result, and return:

```ts
interface SubtitleTranslateResult {
  jobId: string
  translated: Array<{ id: string; text: string; warnings: string[] }>
  skipped: string[]
  failed: Array<{ id: string; error: string }>
  cancelled: boolean
}
```

On user cancellation, kill the process, close pipes, and resolve with `cancelled: true` plus all completed results. On a worker crash, return completed results and mark unfinished cue IDs as failed. Never overwrite project data in the main process.

- [ ] **Step 5: Wire the service into Electron main**

Create the service once beside existing `pythonJobs`, and register:

```ts
ipcMain.handle('subtitle:translation-status', (_event, direction) => translation.getStatus(direction))
ipcMain.handle('subtitle:translation-install', (event, direction) =>
  translation.install(direction, progress => event.sender.send('subtitle:translation-progress', progress)))
ipcMain.handle('subtitle:translation-remove', (_event, direction) => translation.remove(direction))
ipcMain.handle('subtitle:translate', (event, request) =>
  translation.translate(request, progress => event.sender.send('subtitle:translation-progress', progress)))
ipcMain.handle('subtitle:translation-cancel', (_event, jobId) => translation.cancel(jobId))
```

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
npx --no-install tsx scripts/subtitleTranslationPack.test.ts
npx --no-install tsx scripts/subtitleTranslationCore.test.ts
npm run build
```

Expected: both tests PASS and Electron main bundle builds.

Commit:

```powershell
git add electron/main/index.ts electron/main/subtitleTranslationPack.ts electron/main/subtitleTranslationService.ts scripts/subtitleTranslationPack.test.ts
git commit -m "feat: run verified local subtitle translation"
```

---

### Task 6: Expose a Narrow, Typed Translation API to the Renderer

**Files:**
- Modify: `electron/preload/index.ts:55-57`
- Modify: `src/types/global.d.ts:45-68,123-128`

**Interfaces:**
- Consumes: Task 5 IPC handlers.
- Produces: `window.api.subtitle.translationStatus`, `installTranslation`, `removeTranslation`, `translate`, `cancelTranslation`, and `onTranslationProgress`.

- [ ] **Step 1: Define renderer-safe request/result types**

Add types for direction, model state, progress, glossary entries, cue inputs, and results. The renderer request contains only:

```ts
interface SubtitleTranslateRequest {
  jobId: string
  sourceLanguage: 'en' | 'hi'
  targetLanguage: 'en' | 'hi'
  cues: Array<{ id: string; text: string }>
  glossary: Array<{ source: string; target: string }>
}
```

- [ ] **Step 2: Add preload methods and a removable progress listener**

Implement:

```ts
onTranslationProgress: (listener: (progress: SubtitleTranslationProgress) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, progress: SubtitleTranslationProgress) => listener(progress)
  ipcRenderer.on('subtitle:translation-progress', handler)
  return () => ipcRenderer.removeListener('subtitle:translation-progress', handler)
}
```

The renderer cannot supply URLs, checksums, commands, or pack paths.

- [ ] **Step 3: Build and commit**

Run: `npm run build`

Expected: preload and renderer type-check their matching API signatures.

Commit:

```powershell
git add electron/preload/index.ts src/types/global.d.ts
git commit -m "feat: expose subtitle translation ipc"
```

---

### Task 7: Add Translation Controls and Per-Cue Review Editing

**Files:**
- Create: `src/subtitle/SubtitleTranslationPanel.tsx`
- Modify: `src/subtitle/SubtitleModal.tsx`
- Modify: `src/subtitle/translation.ts`
- Modify: `scripts/subtitleTranslationTypes.test.ts`

**Interfaces:**
- Consumes: Task 2 cue helpers and Task 6 preload API.
- Produces: an isolated `SubtitleTranslationPanel` controlled by `track`, `onChange`, `status`, and `setStatus` props.
- Produces: `selectTranslationCandidates(track, replaceReviewed)` so reviewed, current translations are skipped unless explicitly replaced.

- [ ] **Step 1: Add failing candidate-selection and merge tests**

Assert that empty source cues are skipped, current reviewed cues are skipped by default, stale cues are included, a returned translation merges by cue ID, failures preserve prior text, and generated translations always have `reviewed: false`.

- [ ] **Step 2: Implement the compact translation panel**

Render one section in the left sidebar with:

- source and target selectors limited to English/Hindi;
- a swap button that keeps English/Hindi distinct and resets model status;
- installed/not-installed/downloading status;
- Install Model or Remove Model as applicable;
- Translate captions, Cancel while running, and a `Replace reviewed translations` checkbox;
- a collapsible glossary with source/required-translation inputs and row deletion.

Subscribe to progress in `useEffect` and always call the returned cleanup function. Translation must begin only in the Translate button handler.

- [ ] **Step 3: Merge completed results without losing edits**

Capture `sourceTextHash` for every submitted cue. When results arrive, merge a cue only if its current hash still equals the submitted hash. Report `translated`, `skipped`, and `failed` counts in the existing status area. Keep partial valid results on cancellation or mixed chunk failure.

- [ ] **Step 4: Expand each cue editor into fixed English/Hindi order**

Show English first and Hindi second regardless of source language. The source-language field edits `cue.text`; the translated field edits `cue.translations[target].text`, resets review state, and retains warning visibility. Add a Reviewed checkbox and per-cue Retranslate action. Keep the existing trash icon, timing inputs, and one Save style button.

- [ ] **Step 5: Add translated-row style overrides to the existing style sidebar**

Add only these controls below the main caption style:

```text
Show translation
Translated font
Translated size (%)
Translated color
Row gap
```

Default Hindi to Poppins. Blank English font/color overrides inherit the main caption style. The existing Save style button persists the entire normalized track, including translation settings.

- [ ] **Step 6: Verify UI logic and commit**

Run:

```powershell
npx --no-install tsx scripts/subtitleTranslationTypes.test.ts
npm run build
```

Expected: helper tests PASS and the modal builds without React/TypeScript errors.

Commit:

```powershell
git add src/subtitle/SubtitleTranslationPanel.tsx src/subtitle/SubtitleModal.tsx src/subtitle/translation.ts scripts/subtitleTranslationTypes.test.ts
git commit -m "feat: add bilingual subtitle translation controls"
```

---

### Task 8: Render a Compact English-First/Hindi-Second Caption Stack

**Files:**
- Modify: `src/subtitle/presentation.ts`
- Modify: `src/subtitle/SubtitleOverlay.tsx`
- Modify: `src/subtitle/SubtitleStylePreview.tsx`
- Modify: `scripts/subtitlePresentation.test.ts`

**Interfaces:**
- Consumes: normalized track/cue data from Tasks 1-2.
- Produces: `getSubtitleRenderRows(track, cue)`, `fitSubtitleRow(text, baseFontSize, maxWidth, measureAtSize)`, and `layoutSubtitleStack(rows, rowGap)`.
- Keeps `SubtitleCaption` usable by the single-row style preview.

- [ ] **Step 1: Write failing row-order, fitting, and stack-layout tests**

Add assertions equivalent to:

```ts
const rows = getSubtitleRenderRows(hindiSourceTrack, bilingualCue)
assert.deepEqual(rows.map(row => row.language), ['en', 'hi'])
assert.equal(rows[0].text, 'Gravity attracts masses.')
assert.equal(rows[1].text, 'गुरुत्वाकर्षण द्रव्यमानों को आकर्षित करता है।')

const fitted = fitSubtitleRow('a deliberately long caption', 48, 300, (text, size) => text.length * size * 0.55)
assert.ok(fitted.width <= 300)
assert.ok(fitted.fontSize <= 48)
assert.equal(fitted.lines, 1)

const stack = layoutSubtitleStack([
  { width: 280, height: 48 }, { width: 260, height: 42 },
], 8)
assert.equal(stack.height, 98)
```

- [ ] **Step 2: Run the presentation test to verify failure**

Run: `npx --no-install tsx scripts/subtitlePresentation.test.ts`

Expected: FAIL because bilingual layout helpers do not exist.

- [ ] **Step 3: Implement one-line font fitting and ordered row resolution**

Resolve source text through `track.language`, translated text through `cue.translations`, discard blank rows, sort English before Hindi, and return only the source when translation is hidden/missing/stale. Fit each normalized single-line string against `project.width * 0.9` using actual canvas font measurements and a binary search between 12 px and its requested size. Never insert a line break; if text still exceeds the width at 12 px, apply a final horizontal scale capped by the width.

- [ ] **Step 4: Refactor `SubtitleCaption` to position one shared stack**

Compute a shared stack width/height and call `getCaptionOrigin` once. Apply the existing entrance block animation to the outer `Group`, then render each row at its measured Y offset. Preserve word animation and Bulge/Inflate character warp within each row. Apply translated font/size/color overrides without mutating the main style.

- [ ] **Step 5: Keep preview and export behavior aligned**

Pass a one-row array containing `caption style preview` from `SubtitleStylePreview`. `EditorCanvas` already includes `SubtitleOverlay` inside the captured Konva stage, so no parallel export renderer is added; verify video frame capture sees both rows.

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
npx --no-install tsx scripts/subtitlePresentation.test.ts
npm run build
```

Expected: presentation tests PASS and the canvas/export bundle builds.

Commit:

```powershell
git add src/subtitle/presentation.ts src/subtitle/SubtitleOverlay.tsx src/subtitle/SubtitleStylePreview.tsx scripts/subtitlePresentation.test.ts
git commit -m "feat: render bilingual subtitle stacks"
```

---

### Task 9: Export Source, Translated, and Bilingual SRT

**Files:**
- Modify: `src/subtitle/srt.ts`
- Modify: `src/subtitle/SubtitleModal.tsx:145-155,255-259`
- Create: `scripts/subtitleSrt.test.ts`

**Interfaces:**
- Consumes: `getCueText` from Task 2 and track language settings from Task 1.
- Produces: `SubtitleSrtMode = 'source' | 'translated' | 'bilingual'` and `cuesToSrt(cues, options)`.

- [ ] **Step 1: Write failing output-mode tests**

Use one English-source cue with Hindi translation and assert:

```ts
assert.match(cuesToSrt(cues, { sourceLanguage: 'en', targetLanguage: 'hi', mode: 'source' }), /Gravity\./)
assert.doesNotMatch(cuesToSrt(cues, { sourceLanguage: 'en', targetLanguage: 'hi', mode: 'source' }), /गुरुत्व/)
assert.match(cuesToSrt(cues, { sourceLanguage: 'en', targetLanguage: 'hi', mode: 'translated' }), /गुरुत्व/)
assert.match(cuesToSrt(cues, { sourceLanguage: 'en', targetLanguage: 'hi', mode: 'bilingual' }), /Gravity\.\nगुरुत्व/)
```

Also assert Hindi-source bilingual output still writes English first, missing translation falls back to the available source, cue numbers/timestamps remain unchanged, and blank cues are omitted.

- [ ] **Step 2: Run the SRT test to verify failure**

Run: `npx --no-install tsx scripts/subtitleSrt.test.ts`

Expected: FAIL because `cuesToSrt` has no mode/options.

- [ ] **Step 3: Implement language-aware serialization**

Keep `srtTime` unchanged. Resolve mode text per cue, force English then Hindi in bilingual mode, filter empty resolved entries before numbering, and never change `start`/`end`.

- [ ] **Step 4: Add a compact export-mode selector**

Place `Source SRT`, `Translated SRT`, and `Bilingual SRT` in a select beside the existing SRT button. Use filenames ending in `-en.srt`, `-hi.srt`, or `-bilingual.srt`. Disable translated export when no translated text exists; bilingual remains available and falls back cue-by-cue.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npx --no-install tsx scripts/subtitleSrt.test.ts
npm run build
```

Expected: SRT tests PASS and the renderer builds.

Commit:

```powershell
git add src/subtitle/srt.ts src/subtitle/SubtitleModal.tsx scripts/subtitleSrt.test.ts
git commit -m "feat: export bilingual subtitle files"
```

---

### Task 10: Complete End-to-End Verification and Release Documentation

**Files:**
- Create: `docs/subtitle-translation.md`
- Modify only if verification exposes a feature regression: files owned by Tasks 1-9

**Interfaces:**
- Consumes: the complete feature from Tasks 1-9.
- Produces: user instructions, model-license attribution, release checklist, and verified acceptance evidence.

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm run test:subtitle
npm run build
git diff --check
```

Expected: all subtitle scripts PASS, Electron main/preload/renderer build, and no whitespace errors are reported. Record unrelated pre-existing TypeScript failures separately instead of changing unrelated editor components.

- [ ] **Step 2: Publish and verify optional model assets**

After maintainer approval for external publication, upload each generated archive to the `translation-models-v1` GitHub release, download it through the catalog URL, verify its compressed byte count, expanded byte count, and SHA-256, and confirm the application installs it into Electron user data. Do not publish an archive unless both sizes are at most `524288000` bytes and its included licenses are present.

- [ ] **Step 3: Exercise the real educational quality set in both directions**

Use fixtures containing:

```text
Newton's second law is F = ma, where force is measured in newtons.
The experiment used 2.5 kg at 20°C; see https://example.org/paper.
DNA stores genetic information, while RNA helps express it.
न्यूटन का दूसरा नियम F = ma है, जहाँ बल को न्यूटन में मापा जाता है।
प्रयोग में 2.5 kg और 20°C का उपयोग किया गया; https://example.org/paper देखें।
```

Confirm numbers, equations, URLs, glossary terms, cue IDs, and timing survive exactly. Review linguistic clarity manually; automated warnings are safeguards, not proof of correctness.

- [ ] **Step 4: Perform the UI/export acceptance pass**

Verify in `npm run dev`:

1. Translation never starts after generation or editing.
2. Each direction prompts only for its own pack.
3. Download progress, cancel, retry, remove, and offline reuse work.
4. Source edits mark only that cue outdated; reviewed state is explicit.
5. English is above Hindi for both translation directions.
6. Both rows remain one line and within 90% width at landscape, square, and vertical canvas sizes.
7. Caption entrance animation moves the stack together.
8. Canvas preview and MP4 export match.
9. Source, translated, and bilingual SRT files contain correct order and timing.
10. Removing a pack does not remove translations already saved in projects.

- [ ] **Step 5: Write concise user and maintainer documentation**

Document installing/removing a direction pack, translating only on click, glossary usage, warning/review semantics, style overrides, export choices, pack storage location, pack build commands, 500 MB enforcement, AI4Bharat/IndicTrans2 attribution, and CTranslate2 attribution.

- [ ] **Step 6: Final commit**

```powershell
git add docs/subtitle-translation.md
git commit -m "docs: explain offline subtitle translation"
```

The branch is complete only when all automated checks pass, both real packs meet the size cap, both translation directions pass the quality fixtures, and the UI/export acceptance pass is recorded.
