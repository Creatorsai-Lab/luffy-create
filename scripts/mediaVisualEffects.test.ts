import assert from 'node:assert/strict'

async function main() {
  const editor = await import('../src/types/editor')
  assert.equal(editor.FONT_FAMILIES.includes('Computer Modern Roman'), true)

  const fontLoader = await import('../src/utils/fontLoader')
  assert.equal(
    fontLoader.fontLoadDescriptor('Computer Modern Roman', '400', true),
    'italic 400 16px "Computer Modern Roman"',
  )

  const defaults = await import('../src/utils/defaults')
  const clip = defaults.makeMediaEffectClip('rain', 6.5)
  assert.equal(clip.type, 'rain')
  assert.equal(clip.startAt, 0)
  assert.equal(clip.endAt, 6.5)
  assert.equal(clip.mediaEffectIntensity, defaults.DEFAULT_MEDIA_EFFECT.mediaEffectIntensity)
  assert.equal('mediaEffect' in clip, false)

  const flickerClip = defaults.makeMediaEffectClip('lightFlicker' as never, 5)
  assert.equal(flickerClip.mediaEffectColor, '#dcecff')
  assert.equal(flickerClip.mediaEffectHardness, 0.4)

  const effects = await import('../src/engine/mediaEffects')
  const normalize = (effects as Record<string, unknown>).normalizeMediaEffect

  assert.equal(typeof normalize, 'function')
  if (typeof normalize !== 'function') return
  assert.equal(normalize('smoke'), 'none')
  assert.equal(normalize('cloudy'), 'none')
  assert.equal(normalize('motionBlur'), 'none')
  assert.equal(normalize('glitch'), 'glitch')
  assert.equal(normalize('lightFlicker'), 'lightFlicker')

  const flicker = (effects as Record<string, unknown>).getLightFlickerStrength
  assert.equal(typeof flicker, 'function')
  if (typeof flicker === 'function') {
    const times = [0, 0.06, 0.18, 0.34, 0.57, 0.83, 1.16, 1.51]
    const normal = times.map(time => flicker(time, 1, 0.5))
    assert.deepEqual(normal, times.map(time => flicker(time, 1, 0.5)))
    assert.notDeepEqual(normal, times.map(time => flicker(time, 2, 0.5)))
    assert.equal(normal.some(value => value === 0), true)
    assert.equal(normal.some(value => value > 0 && value <= 1), true)
    assert.equal(Number.isFinite(flicker(Number.MAX_VALUE, 5, 0.5)), true)
  }

  const clips = effects.getMediaEffectClips({
    type: 'image',
    mediaEffects: [
      { type: 'glitch', startAt: 1.5, endAt: 4 },
      { type: 'glitch', startAt: 0, endAt: 5 },
      { type: 'rain', startAt: 0, endAt: 2 },
    ],
  } as never)
  assert.deepEqual(clips.map(clip => clip.type), ['glitch', 'rain'])
  assert.deepEqual(
    effects.getActiveMediaEffects({ type: 'image', mediaEffects: clips } as never, 1.5).map(clip => clip.type),
    ['glitch', 'rain'],
  )
  assert.deepEqual(
    effects.getActiveMediaEffects({ type: 'image', mediaEffects: clips } as never, 4).map(clip => clip.type),
    ['glitch'],
  )
  assert.deepEqual(effects.getMediaEffectClips({
    type: 'image',
    mediaEffects: [],
    mediaEffect: 'glitch',
  } as never), [])
  assert.deepEqual(effects.getMediaEffectClips({
    type: 'video',
    mediaEffects: [],
    videoEffect: 'shake',
  } as never), [])
  assert.deepEqual(effects.getMediaEffectClips({
    type: 'video',
    mediaEffects: [{ type: 'removed-effect', startAt: 0, endAt: 2 }],
    videoEffect: 'distortion',
  } as never), [])
  assert.deepEqual(effects.getMediaEffectClips({
    type: 'image',
    mediaEffect: 'glitch',
    mediaEffectIntensity: 0.7,
  } as never), [{
    type: 'glitch',
    startAt: 0,
    endAt: Infinity,
    mediaEffectIntensity: 0.7,
  }])

  assert.equal(effects.mediaEffectRequiresAnimation({
    type: 'image',
    mediaEffect: 'glitch',
    mediaEffectIntensity: 0,
  } as never), false)
  assert.equal(effects.mediaEffectRequiresAnimation({
    type: 'image',
    mediaEffect: 'glitch',
    mediaEffectIntensity: 0.5,
  } as never), true)
  assert.equal(effects.mediaEffectRequiresAnimation({
    type: 'image',
    mediaEffects: [{ type: 'glitch', startAt: 2, endAt: 4, mediaEffectIntensity: 0.5 }],
  } as never), true)
  assert.equal(effects.mediaEffectRequiresAnimation({
    type: 'image',
    mediaEffects: [{ type: 'glitch', startAt: 0, endAt: 4, mediaEffectIntensity: 0 }],
  } as never), false)
  assert.equal(effects.mediaEffectRequiresAnimation({
    type: 'image',
    mediaEffects: [{ type: 'lightFlicker', startAt: 0, endAt: 4, mediaEffectHardness: 0 }],
  } as never), false)

  const resolveAxis = (effects as Record<string, unknown>).resolveGlitchAxis
  assert.equal(typeof resolveAxis, 'function')
  if (typeof resolveAxis === 'function') {
    assert.equal(resolveAxis('vertical'), 'vertical')
    assert.equal(resolveAxis('horizontal'), 'horizontal')
    assert.equal(resolveAxis('old-value'), 'horizontal')
  }

  const filters = await import('../src/engine/imageFilters')
  const getStops = (filters as Record<string, unknown>).getVignetteStops
  assert.equal(typeof getStops, 'function')
  if (typeof getStops === 'function') {
    assert.deepEqual(getStops(0.5, 0.65), { inner: 0.455, fadeStart: 0.4275 })
    assert.deepEqual(getStops(1, 0), { inner: 0.18, fadeStart: 0.98 })
  }
}

void main()
