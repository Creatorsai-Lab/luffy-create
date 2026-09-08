# Local Bilingual Subtitle Translation Design

Date: 2026-09-08
Status: Approved design

## Goal

Add accurate, offline English/Hindi subtitle translation without a paid API or backend. English must render above Hindi as a compact two-row stack, regardless of which language is the source. Translation runs only when the user clicks **Translate captions**.

## Constraints

- No caption text leaves the computer.
- The base editor must not bundle translation models.
- Each optional direction pack must be 500 MB or smaller.
- Support English to Hindi and Hindi to English through separate on-demand packs.
- Preserve existing cue timing and IDs.
- Keep both language rows to one line each within 90% of the canvas width.
- Machine translation is never considered reviewed automatically.

## Translation Engine

Use the AI4Bharat IndicTrans2 distilled 200M models converted to CTranslate2 INT8. English-to-Indic and Indic-to-English are separate packs so users download only the direction they need. Translation reuses the editor's local Python runtime and runs in a single background worker.

The release process must measure each complete optional pack, including model, tokenizer, translation runner and pack-specific dependencies; the editor's already-bundled shared Python runtime is not duplicated in a pack. Packaging fails if a pack exceeds 500 MB. If either converted pack cannot meet the limit, it is not shipped until a smaller validated conversion is available.

References:

- <https://github.com/AI4Bharat/IndicTrans2>
- <https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M>
- <https://github.com/OpenNMT/CTranslate2/blob/master/docs/quantization.md>

## Data Model

Each cue keeps one time range and stores language variants together:

```ts
interface SubtitleTranslation {
  text: string
  reviewed?: boolean
  sourceHash: string
  warnings?: string[]
}

interface SubtitleCue {
  id: string
  start: number
  end: number
  text: string
  translations?: Record<string, SubtitleTranslation>
}
```

`text` remains the source caption for backward compatibility, and the track's source-language field identifies whether that text is English or Hindi. The other language is read from `translations.en` or `translations.hi`; source text is not duplicated in `translations`. `sourceHash` is derived from the current source text; a mismatch marks the translation outdated.

Track-level settings store:

- source and target language;
- translated-row visibility;
- terminology glossary;
- translated-row font, size percentage, color and row gap.

Old projects without translation fields continue to load unchanged.

## Model Pack Lifecycle

Electron's main process owns model installation and execution. The renderer can only request status, download, cancel, remove or translate through narrow IPC methods.

Packs are stored under Electron's user-data directory, outside projects and the application bundle. Installation follows this sequence:

1. Download to a temporary path with progress and cancellation.
2. Stop if the declared or received size exceeds 500 MB.
3. Verify the expected SHA-256 checksum and manifest.
4. Atomically rename the verified directory into its final location.
5. Remove incomplete temporary files on cancellation or failure.

Installed packs work offline and can be removed independently. Translation loads only the requested direction and releases the worker/model after the job finishes or is cancelled.

## Translation Pipeline

1. Collect non-empty source cues in timeline order.
2. Compute source hashes and skip unchanged, reviewed translations unless the user requests replacing them.
3. Group nearby cues into contextual chunks within the model's safe token limit.
4. Replace glossary entries, names, numbers, formulas, URLs, code fragments and abbreviations with reversible protected tokens.
5. Add stable cue markers and translate the complete contextual chunk.
6. Require every marker exactly once and in source order.
7. Restore protected values or their required glossary translations.
8. Validate each result before associating it with the source cue ID.
9. Return translated cues, warnings and progress to the renderer.

If marker validation fails, reject that chunk rather than guessing cue alignment. A failed or cancelled job never deletes or overwrites a previous valid translation. Valid results from other chunks may be saved, but the UI must report translated, skipped and failed counts explicitly.

## Terminology Glossary

The caption modal provides a collapsible two-column glossary: source term and required translation. Equal source/target values mean "keep unchanged." Matching is case-aware and prefers the longest term first so a shorter entry cannot replace part of a longer entry.

Glossary protection is deterministic and occurs before inference. Restoration and validation occur afterward. A missing, duplicated or changed protected term produces a visible warning.

## Validation and Review

Validation detects:

- missing, duplicated or reordered cue markers;
- changed or missing numbers, formulas, URLs and code fragments;
- missing glossary terms;
- empty or unchanged output;
- unusually short or long translations;
- insufficient Devanagari content for Hindi or insufficient Latin content for English.

Warnings do not silently mark a result as correct. Automatically generated or regenerated translations start unreviewed. Editing source text invalidates its translation. Manual translation edits are preserved, and the user explicitly controls the Reviewed checkbox.

## Caption Modal Workflow

Add one compact **Translation** section containing:

- source-language selector;
- target-language selector;
- swap button;
- model status;
- install/remove controls when relevant;
- **Translate captions** action;
- **Cancel** while running;
- collapsible glossary.

Translation never runs automatically after caption generation or source edits.

Each cue cell shows English and Hindi fields in a consistent order, plus warning state, Reviewed checkbox and a per-cue retranslate action. Editing the source marks only that cue's translation outdated.

## Rendering and Styling

- English is always the upper row and Hindi is always the lower row.
- Both rows share cue timing, stack position and entrance animation.
- The whole stack occupies at most 90% of the canvas width.
- Each row measures its actual font metrics and auto-fits independently to one line.
- The translated row inherits the primary caption style by default.
- Only translated-row font, size percentage, color and row gap are overridden.
- Poppins is the default Hindi font because the existing bundled font includes Devanagari glyphs.
- No background overlay is added.
- **Save style** persists the main style and translated-row overrides together.

## Export

The SRT action provides three outputs:

1. source-language SRT;
2. translated-language SRT;
3. bilingual SRT with English first and Hindi second.

Normal video export burns the same bilingual stack shown in the canvas preview. Missing or hidden translations fall back to rendering the available language without changing cue timing.

## Error Handling

- Model unavailable: show Install Model; do not start translation.
- Oversized or corrupt pack: delete temporary data and show a concise retryable error.
- Unsupported direction: disable Translate captions and explain which pack is missing.
- Worker crash: keep existing translations and report the failed chunk.
- Invalid output: retain the source and previous translation, then attach warnings.
- Cancellation: terminate the worker, clean temporary work and preserve completed project data.

## Testing and Acceptance

Automated tests use a deterministic fake translator and cover:

- contextual chunk boundaries and stable cue ordering;
- cue-marker loss, duplication and reordering;
- glossary protection and restoration;
- technical-token validation;
- source-hash invalidation and reviewed-state resets;
- backward-compatible project loading;
- English-first/Hindi-second rendering;
- independent one-line fitting within 90% width;
- cancellation, corrupt downloads, checksum failure and the 500 MB limit;
- separate source, translated and bilingual SRT output.

A separate manual quality set exercises the real local packs with educational and research sentences containing names, formulas, measurements, citations and glossary terms. Release acceptance requires both direction packs to remain within 500 MB and all protected tokens to survive every fixture exactly.

## Out of Scope

- Paid/cloud translation providers.
- Automatic translation immediately after transcription.
- More than one translated row at a time.
- Automatic claims that translation is error-free or reviewed.
- Bundling model weights in the base installer.
