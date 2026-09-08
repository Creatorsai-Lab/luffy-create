# Offline English/Hindi subtitle translation

Luffy Create can translate subtitle tracks locally between English and Hindi and display both languages as a compact two-row caption. Caption text stays on the computer, and translation starts only when **Translate captions** or a cue's **Retranslate** action is clicked.

## Use it

1. Open **Automatic Captions** and generate, paste, or add the source captions.
2. In **Auto translation**, choose English→Hindi or Hindi→English.
3. Click **Install model**. Each direction is a separate optional download; install only the one you need.
4. Add important names, abbreviations, formulas, or technical terminology to **Technical glossary**.
5. Click **Translate captions**. Review warnings and edit either language directly.
6. Check **Reviewed** only after verifying a cue. A source edit makes that cue's translation outdated and unreviewed.
7. Click **Save style** to persist captions, glossary, review state, and translated-row settings.

English is always shown above Hindi, regardless of the source language. Each row remains one line and auto-fits within 90% of the canvas. The two rows share timing, position, warp, and entrance animation. The translated row can override font, relative size, color, and row gap; blank font or color overrides inherit the main caption style. Hindi defaults to the bundled Poppins Devanagari font.

The SRT selector exports source-only, translated-only, or bilingual subtitles. Bilingual SRT files use English first and Hindi second. A missing translation falls back to the available source without changing cue timing.

## Models and storage

Models live under Electron's user-data directory in `translation-models/<direction>/<version>`, outside project files and the base application. Installed packs work offline. **Remove model** deletes only that direction's runtime pack and keeps all translated text already saved in projects.

Downloads are streamed to a temporary file, limited to 500 MB compressed and expanded, checked against the catalog SHA-256, validated, and installed atomically. Cancellation or failure removes partial download and install paths.

## Maintainer workflow

Build and verify the optional Windows x64 packs independently:

```powershell
npm run build:translation-pack -- --direction en-hi
npm run verify:translation-pack -- --archive build/translation-packs/indictrans2-en-hi-int8-win32-x64.tar.gz
npm run build:translation-pack -- --direction hi-en
npm run verify:translation-pack -- --archive build/translation-packs/indictrans2-hi-en-int8-win32-x64.tar.gz
```

Generated archives stay outside the base installer. In development, **Install model** uses a matching archive from `build/translation-packs` when present, so the feature can be tested before release publication. Packaged builds use only the checksum-verified catalog URL.

Before publishing a `translation-models-v1` release asset:

- verify both archive and expanded sizes are at most 524,288,000 bytes;
- verify the SHA-256 exactly matches `resources/translation/model-catalog.json`;
- confirm `manifest.json`, `runner.py`, model, vocabularies, and license files are present;
- run English→Hindi and Hindi→English educational fixtures containing numbers, equations, units, URLs, names, and glossary terms;
- upload only after explicit release-maintainer approval, then install once through the catalog URL.

Run all subtitle regression tests and the production build with:

```powershell
npm run test:subtitle
npx --no-install tsc --noEmit
npm run build
```

## Accuracy and attribution

Translation uses [AI4Bharat IndicTrans2](https://github.com/AI4Bharat/IndicTrans2) distilled 200M models with [CTranslate2](https://github.com/OpenNMT/CTranslate2) INT8 inference. Their license material is included in each optional pack. Review remains essential for educational and research content: preservation checks and warnings protect technical tokens, but cannot guarantee linguistic correctness.
