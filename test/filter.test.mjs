import assert            from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)
const { File } = require('@itrocks/class-file')
const { Filter } = require('../cjs/filter.js')

class Entry
{}
File(require.resolve('./fixtures/filter.d.ts').replace('.d.ts', '.js'))(Entry)

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

test('leading comparison operators take precedence over interval syntax and prefix matching', () => {
	for (const [value, sql, operand] of [
		['> 0', ' > ?', '0'], ['>=0', ' >= ?', '0'], ['< 10', ' < ?', '10'], ['<=10', ' <= ?', '10'],
		['<> 0', ' <> ?', '0'], ['!=0', ' <> ?', '0'], ['=2010', ' = ?', '2010'],
		['=-10', ' = ?', '-10'], ['>=-10', ' >= ?', '-10'], ['<>A-B', ' <> ?', 'A-B'],
		['=A-B', ' = ?', 'A-B'], ['=', ' = ?', ''],
		['!0', ' <> ?', '0'], ['! 10', ' <> ?', '10'], ['!A-B', ' <> ?', 'A-B'], ['!', ' <> ?', '']
	]) {
		for (const property of ['text', 'year']) {
			const filter = new Filter({ map: callback => [callback({ name: property })] })
			filter.getParams({ data: { [`search.${property}`]: value } })
			assert.deepEqual(filter.searchObject(Entry)[property].build(), { sql, values: [operand] })
			assert.deepEqual(filter.serialize(), { [property]: value })
		}
	}
})

test('text fields default to prefix matching, including nested properties', () => {
	for (const [value, sql, operand] of [
		['Alice', ' LIKE ?', 'Alice%'], ['0', ' LIKE ?', '0%'], ['=Alice', ' = ?', 'Alice'],
		['!=Alice', ' <> ?', 'Alice'], ['!Alice', ' <> ?', 'Alice']
	]) {
		const filter = new Filter({ map: callback => [callback({ name: 'text' })] })
		filter.getParams({ data: { 'search.text': value } })
		assert.deepEqual(filter.searchObject(Entry).text.build(), { sql, values: [operand] })
	}
	const { Invoice } = require('./fixtures/graph.cjs')
	const filter = new Filter({ map: callback => [callback({ name: 'city.country.name' })] })
	filter.getParams({ data: { 'search.city.country.name': 'Fr' } })
	assert.deepEqual(filter.searchObject(Invoice)['city.country.name'].build(), { sql: ' LIKE ?', values: ['Fr%'] })
})

test('wildcards produce an explicit LIKE pattern for every property type', () => {
	for (const [value, pattern] of [
		['*', '%'], ['?', '_'], ['*Matrix*', '%Matrix%'], ['20??', '20__'],
		['0*', '0%'], ['A*B?C*', 'A%B_C%'], ['2000-20??', '2000-20__']
	]) {
		for (const property of ['text', 'year']) {
			const filter = new Filter({ map: callback => [callback({ name: property })] })
			filter.getParams({ data: { [`search.${property}`]: value } })
			assert.deepEqual(filter.searchObject(Entry)[property].build(), { sql: ' LIKE ?', values: [pattern] })
			assert.deepEqual(filter.serialize(), { [property]: value })
		}
	}
})

test('all not-equal prefixes with wildcards produce NOT LIKE for every property type', () => {
	for (const prefix of ['!', '!=', '<>']) {
		for (const [value, pattern] of [['*Alice*', '%Alice%'], ['20??', '20__'], ['0*', '0%'], ['A-?*', 'A-_%']]) {
			for (const property of ['text', 'year']) {
				const filter = new Filter({ map: callback => [callback({ name: property })] })
				const text = prefix + ' ' + value
				filter.getParams({ data: { [`search.${property}`]: text } })
				assert.deepEqual(filter.searchObject(Entry)[property].build(), { sql: ' NOT LIKE ?', values: [pattern] })
				assert.deepEqual(filter.serialize(), { [property]: text })
			}
		}
	}
})

test('date fields use date parsing before generic hyphens, operators and wildcards', () => {
	for (const value of ['2020', '2020-03-09', '09/03/2020', '20??', '!??/03/2020', '<=2020-03-09', '?', '!?']) {
		const filter = new Filter({ map: callback => [callback({ name: 'date' })] })
		filter.getParams({ data: { 'search.date': value } })
		const { dateSearch } = require('../cjs/date-search.js')
		const comparison = value.match(/^(<=|!)(.*)$/)
		assert.deepEqual(filter.searchObject(Entry).date,
			dateSearch(comparison ? comparison[2] : value, comparison?.[1]))
		assert.equal(filter.serialize().date, value)
	}
})

test('empty dates read by the driver render as an empty list cell', async () => {
	const { initDateHtmlTransformers } = require('@itrocks/core-transformers')
	const { ListColumn } = require('../cjs/projection.js')
	initDateHtmlTransformers()
	assert.equal(await new ListColumn(Entry, 'date').output({ kind: 'value', value: null }), '')
})
