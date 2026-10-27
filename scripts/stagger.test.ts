// Stagger/sequence timing, repeating loops in the animator, colour flash on
// shapes, and folding the old animation `startTime` into `delay` on load.
import assert from 'node:assert/strict'
import { getAnimatedProps } from '../src/engine/animator'
import { migrateProject } from '../src/store/migrateProject'
import { makeAnimation, makeProject, makeShape } from '../src/utils/defaults'
import { animationsEnd, buildSequence, buildStagger, staggerGroups, type StaggerItem } from '../src/utils/stagger'

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`)

// A 3-4-2 network: neurons stacked in columns at x = 100, 300, 500.
const layers = [3, 4, 2]
const neurons: StaggerItem[] = layers.flatMap((count, layer) =>
  Array.from({ length: count }, (_, i) => ({ id: `n${layer}-${i}`, x: 100 + layer * 200, y: 100 + i * 80, width: 40, height: 40 })))

{ // columns start together when "together" covers them
  const groups = staggerGroups(neurons, { order: 'leftToRight', step: 0.2, together: 20 })
  assert.deepEqual(groups.map(g => g.length), [3, 4, 2])
  assert.deepEqual(staggerGroups(neurons, { order: 'rightToLeft', step: 0.2, together: 20 }).map(g => g.length), [2, 4, 3])
  // one by one, top to bottom within a column
  const single = staggerGroups(neurons.slice(0, 3).reverse(), { order: 'leftToRight', step: 0.1 })
  assert.deepEqual(single.map(g => g[0].id), ['n0-0', 'n0-1', 'n0-2'])
  // top to bottom: rows by y, left to right within a row
  assert.deepEqual(staggerGroups(neurons, { order: 'topToBottom', step: 0.1, together: 10 })[0].map(i => i.id), ['n0-0', 'n1-0', 'n2-0'])
}

{ // a staggered fade-in: delays step by group; end = last start + duration
  const result = buildStagger(neurons, { type: 'fadeIn', duration: 0.5 }, { order: 'leftToRight', step: 0.3, together: 20 }, { start: 1 })
  const delay = (id: string) => result.animations.find(a => a.elementId === id)!.animation.delay
  near(delay('n0-2'), 1); near(delay('n1-0'), 1.3); near(delay('n2-1'), 1.6)
  near(result.end, 2.1)
  assert.equal(result.animations[0].animation.timing, 'onEnter')
  assert.equal(result.period, undefined)
}

{ // forward pass then backward pass, repeating
  const result = buildSequence([
    { items: neurons, animation: { type: 'pulse', duration: 0.4 }, timing: { order: 'leftToRight', step: 0.25, together: 20 } },
    { items: neurons, animation: { type: 'colorPulse', duration: 0.3, params: { pulseColor: '#ff0000', pulseCount: 1 } },
      timing: { order: 'rightToLeft', step: 0.25, together: 20 }, gapBefore: 0.2 },
  ], { start: 0.5, repeat: true, repeatGap: 0.6 })
  // forward: 0.5 → 0.5 + 2·0.25 + 0.4 = 1.4; backward starts 1.6 → 1.6 + 0.5 + 0.3 = 2.4
  near(result.end, 2.4)
  near(result.period!, 2.4 - 0.5 + 0.6)
  const backward = result.animations.filter(a => a.animation.type === 'colorPulse')
  near(backward.find(a => a.elementId === 'n2-0')!.animation.delay, 1.6)
  near(backward.find(a => a.elementId === 'n0-0')!.animation.delay, 2.1)
  assert.ok(result.animations.every(a => a.animation.repeatEvery === result.period && a.animation.timing === 'loop'))
}

{ // a repeating loop plays once per period and rests in between
  const shape = makeShape('circle', 0, 0)
  shape.animations = [{ ...makeAnimation(), type: 'pulse', timing: 'loop', delay: 1, duration: 0.4, repeatEvery: 3 }]
  const scale = (t: number) => getAnimatedProps(shape, t).scaleX
  assert.equal(scale(0.5), 1, 'before the delay')
  assert.notEqual(scale(1.1), 1, 'first play')
  assert.equal(scale(2), 1, 'resting')
  assert.notEqual(scale(4.1), 1, 'second play, one period later')
  assert.equal(scale(4.6), 1, 'resting again')
}

{ // a colour flash on a shape recolours its fill
  const shape = Object.assign(makeShape('circle', 0, 0), { fill: '#000000' })
  shape.animations = [{ ...makeAnimation(), type: 'colorPulse', timing: 'loop', delay: 0, duration: 1, params: { pulseColor: '#ffffff', pulseCount: 1 } }]
  assert.equal(getAnimatedProps(shape, 0.5).textColor, '#ffffff')
  assert.equal(getAnimatedProps(shape, 1.5).textColor, undefined, 'one flash only')
}

{ // "after the last animation" ignores endless loops
  const a = makeShape('rect', 0, 0)
  a.animations = [
    { ...makeAnimation(), type: 'fadeIn', delay: 1, duration: 0.5 },
    { ...makeAnimation(), type: 'pulse', timing: 'loop', delay: 0, duration: 1 },
    { ...makeAnimation(), type: 'pulse', timing: 'loop', delay: 2, duration: 0.4, repeatEvery: 3 },
  ]
  near(animationsEnd([a]), 2.4)
}

{ // old projects: startTime is folded into delay
  const project = makeProject('p', 'old')
  const shape = makeShape('rect', 0, 0)
  shape.animations = [{ ...makeAnimation(), delay: 0.5, startTime: 2 } as never]
  project.scenes[0].elements = [shape]
  migrateProject(project)
  near(shape.animations[0].delay, 2.5)
  assert.equal('startTime' in shape.animations[0], false)
}

console.log('stagger tests passed')
