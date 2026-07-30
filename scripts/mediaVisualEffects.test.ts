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

  const zoomClip = defaults.makeMediaEffectClip('zoomIn' as never, 4)
  assert.equal(zoomClip.mediaEffectZoomPosition, 'center')

  const effects = await import('../src/engine/mediaEffects')
  const normalize = (effects as Record<string, unknown>).normalizeMediaEffect

  assert.equal(typeof normalize, 'function')
  if (typeof normalize !== 'function') return
  assert.equal(normalize('smoke'), 'none')
  assert.equal(normalize('cloudy'), 'none')
  assert.equal(normalize('motionBlur'), 'none')
  assert.equal(normalize('glitch'), 'glitch')
  assert.equal(normalize('lightFlicker'), 'lightFlicker')
  assert.equal(normalize('zoomIn'), 'zoomIn')
  assert.equal(normalize('zoomOut'), 'zoomOut')

  const getZoomScale = (effects as Record<string, unknown>).getMediaZoomScale as
    | ((type: 'zoomIn' | 'zoomOut', elapsed: number, duration: number, speed: number) => number)
    | undefined
  const getZoomAnchor = (effects as Record<string, unknown>).getMediaZoomAnchor as
    | ((position: string, size: number, axis: 'x' | 'y') => number)
    | undefined
  assert.equal(typeof getZoomScale, 'function')
  assert.equal(typeof getZoomAnchor, 'function')
  if (getZoomScale && getZoomAnchor) {
    assert.equal(getZoomScale('zoomIn', 0, 4, 1), 1)
    assert.equal(getZoomScale('zoomIn', 2, 4, 1), 1.24)
    assert.equal(getZoomScale('zoomIn', 4, 4, 1), 1.48)
    assert.equal(getZoomScale('zoomOut', 0, 4, 1), 1.48)
    assert.equal(getZoomScale('zoomOut', 2, 4, 1), 1.24)
    assert.equal(getZoomScale('zoomOut', 4, 4, 1), 1)
    assert.equal(getZoomScale('zoomIn', 2, 4, 2), 1.48)
    assert.equal(getZoomScale('zoomOut', 0, 8, 1), 1.96)
    assert.equal(Number.isFinite(getZoomScale('zoomIn', Infinity, Infinity, Infinity)), true)
    assert.deepEqual([
      [getZoomAnchor('center', 100, 'x'), getZoomAnchor('center', 80, 'y')],
      [getZoomAnchor('topLeft', 100, 'x'), getZoomAnchor('topLeft', 80, 'y')],
      [getZoomAnchor('topRight', 100, 'x'), getZoomAnchor('topRight', 80, 'y')],
      [getZoomAnchor('bottomRight', 100, 'x'), getZoomAnchor('bottomRight', 80, 'y')],
      [getZoomAnchor('bottomLeft', 100, 'x'), getZoomAnchor('bottomLeft', 80, 'y')],
      [getZoomAnchor('old-value', 100, 'x'), getZoomAnchor('old-value', 80, 'y')],
    ], [[50, 40], [0, 0], [100, 0], [100, 80], [0, 80], [50, 40]])
  }

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
  assert.equal(effects.getMediaEffectClips({
    type: 'image',
    mediaEffects: [{
      type: 'zoomIn',
      startAt: 1,
      endAt: 5,
      mediaEffectZoomPosition: 'bottomRight',
    }],
  } as never)[0]?.mediaEffectZoomPosition, 'bottomRight')
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
  assert.equal(effects.mediaEffectRequiresAnimation({
    type: 'image',
    mediaEffects: [{ type: 'zoomIn', startAt: 0, endAt: 4, mediaEffectIntensity: 0 }],
  } as never), true)
  assert.equal(effects.mediaEffectRequiresAnimation({
    type: 'video',
    mediaEffects: [{ type: 'zoomOut', startAt: 1, endAt: 4, mediaEffectIntensity: 0 }],
  } as never), true)

  const zoomElement = {
    type: 'image',
    mediaEffects: [
      { type: 'zoomIn', startAt: 1, endAt: 5, mediaEffectSpeed: 1, mediaEffectZoomPosition: 'center' },
      { type: 'zoomOut', startAt: 1, endAt: 3, mediaEffectSpeed: 1, mediaEffectZoomPosition: 'bottomRight' },
    ],
  } as never
  function zoomDrawOperations(time: number) {
    const operations: (string | number)[][] = []
    const context = {
      save: () => operations.push(['save']),
      restore: () => operations.push(['restore']),
      translate: (x: number, y: number) => operations.push(['translate', x, y]),
      scale: (x: number, y: number) => operations.push(['scale', x, y]),
    } as never
    effects.drawMediaWithEffects(context, zoomElement, 100, 80, time, {
      drawBase: () => { operations.push(['draw']) },
    })
    return operations
  }
  assert.deepEqual(zoomDrawOperations(0.5), [['draw']])
  assert.deepEqual(zoomDrawOperations(1), [
    ['save'],
    ['translate', 50, 40], ['scale', 1, 1], ['translate', -50, -40],
    ['translate', 100, 80], ['scale', 1.24, 1.24], ['translate', -100, -80],
    ['draw'], ['restore'],
  ])
  assert.deepEqual(zoomDrawOperations(2), [
    ['save'],
    ['translate', 50, 40], ['scale', 1.12, 1.12], ['translate', -50, -40],
    ['translate', 100, 80], ['scale', 1.12, 1.12], ['translate', -100, -80],
    ['draw'], ['restore'],
  ])
  assert.deepEqual(zoomDrawOperations(3), [
    ['save'],
    ['translate', 50, 40], ['scale', 1.24, 1.24], ['translate', -50, -40],
    ['translate', 100, 80], ['scale', 1, 1], ['translate', -100, -80],
    ['draw'], ['restore'],
  ])

  const effectPanel = await import('../src/components/panels/MediaEffectsPanel')
  const options = (effectPanel as Record<string, unknown>).MEDIA_EFFECT_OPTIONS as
    | { label: string; value: string }[]
    | undefined
  assert.equal(options?.some(option => option.value === 'zoomIn'), true)
  assert.equal(options?.some(option => option.value === 'zoomOut'), true)

  const effectCard = await import('../src/components/panels/MediaEffectCard')
  const visibleControls = (effectCard as Record<string, unknown>).getMediaEffectControlVisibility as
    | ((type: string) => { intensity: boolean; hardness: boolean; blend: boolean; zoomPosition: boolean })
    | undefined
  assert.deepEqual(visibleControls?.('zoomIn'), {
    intensity: false,
    hardness: false,
    blend: false,
    zoomPosition: true,
  })
  assert.deepEqual(visibleControls?.('shake'), {
    intensity: true,
    hardness: true,
    blend: true,
    zoomPosition: false,
  })

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
