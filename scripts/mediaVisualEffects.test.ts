import assert from 'node:assert/strict'

async function main() {
  const effects = await import('../src/engine/mediaEffects')
  const normalize = (effects as Record<string, unknown>).normalizeMediaEffect

  assert.equal(typeof normalize, 'function')
  if (typeof normalize !== 'function') return
  assert.equal(normalize('smoke'), 'none')
  assert.equal(normalize('cloudy'), 'none')
  assert.equal(normalize('motionBlur'), 'none')
  assert.equal(normalize('glitch'), 'glitch')

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
