import assert from 'node:assert/strict'

async function main() {
  const animator = await import('../src/engine/animator')
  const getClips = (animator as Record<string, unknown>).getOutlineRevealClips
  assert.equal(typeof getClips, 'function', 'outline reveal clip math must be exported')
  if (typeof getClips !== 'function') return

  const round = (value: number) => Math.round(value * 1000) / 1000
  const clips = getClips(0.5, 100) as { fillWidth: number; outlineX: number; outlineWidth: number }
  assert.deepEqual(
    { fillWidth: round(clips.fillWidth), outlineX: round(clips.outlineX), outlineWidth: round(clips.outlineWidth) },
    { fillWidth: 30.556, outlineX: 30.556, outlineWidth: 38.889 },
  )
  assert.deepEqual(getClips(-2, 100), { fillWidth: 0, outlineX: 0, outlineWidth: 0 })
  assert.deepEqual(getClips(0.5, Infinity), { fillWidth: 0, outlineX: 0, outlineWidth: 0 })

  const { makeText } = await import('../src/utils/defaults')
  const reveal = await import('../src/engine/textOutlineReveal')
  assert.equal(typeof reveal.getOutlineRevealClipBox, 'function')
  const box = reveal.getOutlineRevealClipBox(0.5, 100, 220, 20)
  assert.deepEqual({
    fillWidth: round(box.fillWidth),
    outlineX: round(box.outlineX),
    outlineWidth: round(box.outlineWidth),
    clipY: box.clipY,
    clipHeight: box.clipHeight,
  }, {
    fillWidth: 30.556,
    outlineX: 30.556,
    outlineWidth: 38.889,
    clipY: -20,
    clipHeight: 260,
  })
  const outlineText = reveal.makeOutlineTextElement(makeText(0, 0), '#f8fafc')
  assert.equal(outlineText.fillMode, 'solid')
  assert.equal(outlineText.color, 'transparent')
  assert.equal(outlineText.textStroke, '#f8fafc')
  assert.equal(outlineText.textStrokeWidth, 0.5)

  const enterText = makeText(20, 30)
  enterText.animations = [{
    id: 'outline-in',
    type: 'outlineRevealIn',
    timing: 'onEnter',
    startTime: 1,
    duration: 2,
    delay: 0,
    easing: 'linear',
  } as never]

  assert.equal(animator.getAnimatedProps(enterText, 0.5).opacity, 0)
  assert.deepEqual(
    pickReveal(animator.getAnimatedProps(enterText, 1.5)),
    { opacity: 1, textProgress: 0.25, textMode: 'outlineReveal' },
  )
  assert.deepEqual(
    pickReveal(animator.getAnimatedProps(enterText, 3)),
    { opacity: 1, textProgress: 1, textMode: undefined },
  )

  const exitText = makeText(20, 30)
  exitText.animations = [{
    id: 'outline-out',
    type: 'outlineRevealOut',
    timing: 'onExit',
    startTime: 1,
    duration: 2,
    delay: 0,
    easing: 'linear',
  } as never]

  assert.deepEqual(
    pickReveal(animator.getAnimatedProps(exitText, 0.5)),
    { opacity: 1, textProgress: 1, textMode: undefined },
  )
  assert.deepEqual(
    pickReveal(animator.getAnimatedProps(exitText, 2)),
    { opacity: 1, textProgress: 0.5, textMode: 'outlineReveal' },
  )
  assert.equal(animator.getAnimatedProps(exitText, 3).opacity, 0)

  const textPanel = await import('../src/components/panels/TextPanel')
  assert.equal(textPanel.TEXT_ENTER_ANIMS.some(item => item.value === 'outlineRevealIn'), true)
  assert.equal(textPanel.TEXT_EXIT_ANIMS.some(item => item.value === 'outlineRevealOut'), true)
  assert.equal(textPanel.ENTER_ANIMS.some(item => item.value === 'outlineRevealIn'), false)
  assert.equal(textPanel.EXIT_ANIMS.some(item => item.value === 'outlineRevealOut'), false)
}

function pickReveal(props: { opacity: number; textProgress: number; textMode?: string }) {
  return {
    opacity: props.opacity,
    textProgress: props.textProgress,
    textMode: props.textMode,
  }
}

void main()
