import assert            from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)
const { Limit } = require('@itrocks/storage')
const { Feed }  = require('../cjs/feed.js')

test('an absent offset resets the feed to the first page with a finite limit', () => {
	const feed = new Feed()
	feed.getParams({ data: { offset: '50' }, headers: {} })
	feed.getParams({ data: {}, headers: {} })

	assert.equal(feed.offset, 0)
	const [option] = feed.readOptions()
	assert.ok(option instanceof Limit)
	assert.equal(option.limit, Feed.DEFAULT_LIMIT)
	assert.equal(option.offset, 0)
})

test('explicit valid offsets and viewport limits retain their pagination values', () => {
	for (const offset of [0, 1, 50, Number.MAX_SAFE_INTEGER]) {
		for (const value of [offset, String(offset)]) {
			const feed = new Feed()
			feed.getParams({ data: { offset: value }, headers: { 'xhr-info': '{"visibleRows":17}' } })

			assert.equal(feed.offset, offset)
			const [option] = feed.readOptions()
			assert.equal(option.limit, 17)
			assert.equal(option.offset, offset)
		}
	}
})

test('invalid explicit offsets remain visible to downstream validation', () => {
	for (const [value, expected] of [['invalid', NaN], ['-1', -1], ['0.5', 0.5], ['Infinity', Infinity]]) {
		const feed = new Feed()
		feed.getParams({ data: { offset: value }, headers: {} })

		assert.equal(feed.offset, expected)
		assert.equal(feed.readOptions()[0].offset, expected)
	}
})
