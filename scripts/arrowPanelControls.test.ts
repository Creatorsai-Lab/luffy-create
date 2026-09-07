import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BendCountInput } from '../src/components/panels/ArrowPanel'

const markup = renderToStaticMarkup(createElement(BendCountInput, {
  value: 2,
  onChange() {},
}))

assert.equal(markup.includes('aria-label="Decrease bend count"'), true)
assert.equal(markup.includes('aria-label="Bend count"'), true)
assert.equal(markup.includes('type="number"'), true)
assert.equal(markup.includes('value="2"'), true)
assert.equal(markup.includes('aria-label="Increase bend count"'), true)

console.log('arrow panel control tests passed')
