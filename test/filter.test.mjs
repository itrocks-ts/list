import assert            from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)
const { Filter } = require('../cjs/filter.js')

class Entry
{}

test('filters interpret the first hyphen as an interval with optional inclusive bounds', () => {
	for (const [value, expected] of [
		['2000-2010', { sql: ' BETWEEN ? AND ?', values: ['2000', '2010'] }],
		['2000 \t- 2010', { sql: ' BETWEEN ? AND ?', values: ['2000', '2010'] }],
		['A - B-C', { sql: ' BETWEEN ? AND ?', values: ['A', 'B-C'] }],
		['- 2010', { sql: ' <= ?', values: ['2010'] }],
		['2000 - ', { sql: ' >= ?', values: ['2000'] }],
		['0 - 10', { sql: ' BETWEEN ? AND ?', values: ['0', '10'] }],
		['0 - 0', { sql: ' BETWEEN ? AND ?', values: ['0', '0'] }],
		['10 - 0', { sql: ' BETWEEN ? AND ?', values: ['10', '0'] }],
		['-0', { sql: ' <= ?', values: ['0'] }],
		['0-', { sql: ' >= ?', values: ['0'] }]
	]) {
		const filter = new Filter({ map: callback => [callback({ name: 'year' })] })
		filter.getParams({ data: { 'search.year': value } })
		const search = filter.searchObject(Entry)
		assert.equal(Object.getPrototypeOf(search), Entry.prototype)
		assert.deepEqual(search.year.build(), expected)
		assert.deepEqual(filter.serialize(), { year: value })
	}
})

test('filters preserve ordinary equality and ignore an interval without either bound', () => {
	for (const [value, expected] of [
		['0', { year: '0' }], ['2010', { year: '2010' }], [' Alice ', { year: ' Alice ' }], ['', {}], ['-', {}], [' - ', {}]
	]) {
		const filter = new Filter({ map: callback => [callback({ name: 'year' })] })
		filter.getParams({ data: { search: { year: value } } })
		assert.deepEqual({ ...filter.searchObject(Entry) }, expected)
	}
})
