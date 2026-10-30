import assert            from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)
const { File } = require('@itrocks/class-file')
const { Select } = require('@itrocks/sql-build')
const { AND, OR, LogicalFunction, and, between, equal, greaterOrEqual, less, like, or }
	= require('@itrocks/sql-functions')
const { Filter } = require('../cjs/filter.js')
const { searchExpression } = require('../cjs/search-expression.js')
const { Invoice } = require('./fixtures/graph.cjs')

class Entry {}
File(require.resolve('./fixtures/filter.d.ts').replace('.d.ts', '.js'))(Entry)

const table = { table: 'entry', columns: {
	text: { name: 'text', scalar: true }, year: { name: 'year', scalar: true }
} }

function filtered(property, value, type = Entry)
{
	const filter = new Filter({ map: callback => [callback({ name: property })] })
	filter.getParams({ data: { search: { [property]: value } } })
	return { filter, search: filter.searchObject(type) }
}

test('both OR separators retain the existing prefix, wildcard and exact comparisons', () => {
	for (const separator of [',', '|']) {
		const value = `Alice ${separator} =Bob ${separator} *Carol*`
		const { filter, search } = filtered('text', value)
		assert.deepEqual(search.text, or(like('Alice%'), equal('Bob'), like('%Carol%')))
		assert.equal(filter.serialize().text, value)
	}
})

test('AND binds more tightly than OR, with all separator aliases', () => {
	for (const disjunction of [',', '|']) for (const conjunction of ['&', '+']) {
		const input = `<1980 ${disjunction} >=2000 ${conjunction} <2010`
		const { search } = filtered('year', input)
		assert.deepEqual(search.year, or(less('1980'), and(greaterOrEqual('2000'), less('2010'))))
		const query = new Select(table, ['year'], search).build()
		assert.match(query.sql, /WHERE `t0`\.`year` < \? OR \(`t0`\.`year` >= \? AND `t0`\.`year` < \?\)/)
		assert.deepEqual(query.values, ['1980', '2000', '2010'])
	}
})

test('parentheses override precedence and permit nested expressions', () => {
	const { search } = filtered('year', '(<1980 | >=2000) & (2000-2005 | (=2010 + <2011))')
	assert.deepEqual(search.year, and(or(less('1980'), greaterOrEqual('2000')),
		or(between('2000', '2005'), and(equal('2010'), less('2011')))))
	assert.deepEqual(filtered('year', '(((>=2000)))').search.year, greaterOrEqual('2000'))
})

test('date leaves retain period and range parsing within logical expressions', () => {
	const { dateSearch } = require('../cjs/date-search.js')
	const { search } = filtered('date', '2020 | (2021-2022 & !06/2021)')
	assert.deepEqual(search.date, or(dateSearch('2020'), and(dateSearch('2021-2022'), dateSearch('06/2021', '!'))))
})

test('quoted and escaped operators, parentheses and quotes remain literal text', () => {
	for (const [input, expected] of [
		['"Rock & Roll"', 'Rock & Roll%'],
		['" Rock & Roll "', ' Rock & Roll %'],
		['="Paris, Texas"', 'Paris, Texas'],
		['"Alien (Director\'s Cut)"', "Alien (Director's Cut)%"],
		[String.raw`Rock \& Roll`, 'Rock & Roll%'],
		[String.raw`Paris\, Texas`, 'Paris, Texas%'],
		[String.raw`A\|B\+C\(D\)`, 'A|B+C(D)%'],
		[String.raw`"Say \"Hi\""`, 'Say "Hi"%'],
		[String.raw`C:\movies`, String.raw`C:\movies%`],
		['=""', ''],
		["L'homme", "L'homme%"]
	]) {
		assert.deepEqual(filtered('text', input).search.text.build().values, [expected], input)
	}
	const { search } = filtered('text', '"Rock & Roll" | ("Paris, Texas" & !*test*)')
	assert.ok(search.text instanceof LogicalFunction)
	assert.deepEqual(search.text.operands[0].values, ['Rock & Roll%'])
	assert.equal(search.text.operands[1].operator, 'AND')
})

test('each object criterion searches all representatives and collection AND allows separate matching children', () => {
	for (const property of ['city', 'cities']) {
		const { search } = filtered(property, '(Paris, Lyon) & Fr', Invoice)
		const conditions = search[AND][0][AND]
		assert.deepEqual(conditions[0][OR][0][OR][0][`${property}.name`], like('Paris%'))
		assert.deepEqual(conditions[0][OR][1][OR][0][`${property}.name`], like('Lyon%'))
		assert.deepEqual(conditions[1][OR][0][`${property}.name`], like('Fr%'))
		assert.deepEqual(conditions[1][OR][1][OR][0][`${property}.country.name`], like('Fr%'))
	}
	const literal = filtered('cities', '"Paris & Lyon"', Invoice).search[AND][0][OR][0]
	assert.deepEqual(literal['cities.name'], like('Paris & Lyon%'))
})

test('invalid expressions never turn into an unrestricted or partially applied search', () => {
	for (const input of ['(', ')', '()', '( )', 'A,', '|A', 'A&&B', 'A + | B', 'A (B)',
		'(A|B', 'A|B)', '"A', 'A|"B', '(A)(B)']) {
		assert.throws(() => searchExpression(input), SyntaxError, input)
		const { filter, search } = filtered('text', input)
		assert.deepEqual(search.text, or(), input)
		assert.match(new Select(table, ['text'], search).build().sql, /WHERE 1 = 0/)
		assert.equal(filter.serialize().text, input)
	}
	assert.deepEqual(filtered('year', '1 | -').search.year, or('1', or()))
})

test('session restoration rebuilds the same expression, including nested field parameters and an encoded plus', () => {
	const input = '(>=1980 | =1970) + <2000'
	const first = filtered('year', input)
	const second = new Filter({ map: callback => [callback({ name: 'year' })] })
	second.unserialize(first.filter.serialize())
	second.getParams({ data: {} })
	assert.deepEqual(second.searchObject(Entry), first.search)
	const decoded = Object.fromEntries(new URLSearchParams('search.year=%3E%3D1980%2B%3C2000'))
	second.getParams({ data: decoded })
	assert.deepEqual(second.searchObject(Entry).year, and(greaterOrEqual('1980'), less('2000')))
})
