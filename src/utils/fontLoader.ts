/**
 * Font preloader for Konva/Canvas rendering.
 *
 * Canvas does NOT trigger lazy font loading the way DOM does.  We must call
 * document.fonts.load() explicitly for each face we want to use in Canvas,
 * otherwise Konva silently falls back to the system default font.
 *
 * All @fontsource packages register their @font-face rules when imported;
 * this module then forces the browser to actually fetch and cache the files.
 */

// ── Import @fontsource packages ───────────────────────────────────────────────
// Only the weights we actually use (400 normal + 700 bold).  Importing the
// specific weight CSS is optional but keeps the bundle smaller.
import '@fontsource/bangers/400.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/caveat/400.css'
import '@fontsource/caveat/700.css'
import '@fontsource/caveat-brush/400.css'
import '@fontsource/chewy/400.css'
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/700.css'
import '@fontsource/handlee/400.css'
import '@fontsource/imperial-script/400.css'
import '@fontsource/indie-flower/400.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/700.css'
import '@fontsource/kalam/400.css'
import '@fontsource/kalam/700.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/noto-serif/400.css'
import '@fontsource/noto-serif/700.css'
import '@fontsource/pacifico/400.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/700.css'
import '@fontsource/quicksand/400.css'
import '@fontsource/quicksand/700.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/700.css'
import '@fontsource/shadows-into-light/400.css'

// ── Fonts that need explicit preloading (non-system only) ─────────────────────
const CANVAS_FONTS: Array<{ family: string; weights: string[] }> = [
  { family: 'Bangers',            weights: ['400'] },
  { family: 'Bebas Neue',         weights: ['400'] },
  { family: 'Caveat',             weights: ['400', '700'] },
  { family: 'Caveat Brush',       weights: ['400'] },
  { family: 'Chewy',              weights: ['400'] },
  { family: 'EB Garamond',        weights: ['400', '700'] },
  { family: 'Handlee',            weights: ['400'] },
  { family: 'Imperial Script',    weights: ['400'] },
  { family: 'Indie Flower',       weights: ['400'] },
  { family: 'Inter',              weights: ['400', '700'] },
  { family: 'Kalam',              weights: ['400', '700'] },
  { family: 'Montserrat',         weights: ['400', '700'] },
  { family: 'Noto Serif',         weights: ['400', '700'] },
  { family: 'Pacifico',           weights: ['400'] },
  { family: 'Playfair Display',   weights: ['400', '700'] },
  { family: 'Poppins',            weights: ['400', '700'] },
  { family: 'Quicksand',          weights: ['400', '700'] },
  { family: 'Roboto',             weights: ['400', '700'] },
  { family: 'Shadows Into Light', weights: ['400'] },
]

let preloadPromise: Promise<void> | null = null

/**
 * Call once on app start.  Waits for all @fontsource CSS rules to register,
 * then force-fetches each font binary so they are in document.fonts and ready
 * for Canvas / Konva rendering.  Safe to call multiple times (cached).
 */
export function preloadFonts(): Promise<void> {
  if (preloadPromise) return preloadPromise

  preloadPromise = (async () => {
    await document.fonts.ready

    const loads = CANVAS_FONTS.flatMap(({ family, weights }) =>
      weights.map(w => document.fonts.load(`${w} 16px "${family}"`))
    )

    const results = await Promise.allSettled(loads)

    const failed = results
      .map((r, i) => (r.status === 'rejected' ? CANVAS_FONTS[Math.floor(i / 2)]?.family : null))
      .filter(Boolean)

    if (failed.length) {
      console.warn('[FontLoader] Some fonts failed to load:', [...new Set(failed)])
    }
  })()

  return preloadPromise
}

/**
 * Force-load a single font family + weight on demand (called by TextKonva
 * when fontFamily changes so the new font is ready before the next draw).
 */
export function loadFont(family: string, weight = '400'): Promise<void> {
  return document.fonts.load(`${weight} 16px "${family}"`).then(() => {})
}
