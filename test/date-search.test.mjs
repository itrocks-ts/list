import assert            from 'node:assert/strict'
import { mkdtemp }       from 'node:fs/promises'
import { rm }            from 'node:fs/promises'
import { writeFile }     from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir }        from 'node:os'
import { join }          from 'node:path'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)
const { dateSearch } = require('../cjs/date-search.js')
const now = new Date(2026, 9, 29, 12)
const stamp = date => [date.getFullYear(), date.getMonth() + 1, date.getDate(),
	date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()]
const bounds = criterion => criterion.build().values.map(stamp)
const period = (year, month = 1, day = 1, lastMonth = month, lastDay = day) => [
	[year, month, day, 0, 0, 0, 0], [year, lastMonth, lastDay, 23, 59, 59, 999]
]

test('year and month inputs select their whole calendar periods', () => {
	for (const [value, expected] of [
		['6', period(2026, 6, 1, 6, 30)], ['06', period(2026, 6, 1, 6, 30)],
		['1', period(2026, 1, 1, 1, 31)],
		['2020', period(2020, 1, 1, 12, 31)], ['02', period(2026, 2, 1, 2, 28)],
		['02/2020', period(2020, 2, 1, 2, 29)], ['2020/02', period(2020, 2, 1, 2, 29)],
		['02-2020', period(2020, 2, 1, 2, 29)], ['2020-02', period(2020, 2, 1, 2, 29)],
		['26-3', period(2026, 3, 1, 3, 31)], ['1234', period(1234, 1, 1, 12, 31)]
	]) assert.deepEqual(bounds(dateSearch(value, '=', now, 'dd/MM/yyyy')), expected, value)
})

test('localized, ISO and compact dates accept short fields and completed years', () => {
	for (const [format, values] of [
		['dd/MM/yyyy', ['09/03/2020', '9/3/2020', '09/3/20', '9/03/020', '9/3/0', '09032020', '090320']],
		['MM/dd/yyyy', ['03/09/2020', '3/9/2020', '03/9/20', '3/09/020', '3/9/0', '03092020', '030920']]
	]) {
		for (const value of [...values, '2020-03-09', '20-3-9', '020-03-9', '0-3-09', '2020/3/9'])
			assert.deepEqual(bounds(dateSearch(value, '=', now, format)), period(2020, 3, 9), value)
		const short = format.startsWith('dd') ? '9/3' : '3/9'
		assert.deepEqual(bounds(dateSearch(short, '=', now, format)), period(2026, 3, 9))
	}
	assert.deepEqual(bounds(dateSearch('31/12/99', '=', now, 'dd/MM/yyyy')), period(2099, 12, 31))
})

test('ISO hyphens stay date separators and slash dates allow inclusive ranges', () => {
	for (const format of ['dd/MM/yyyy', 'MM/dd/yyyy']) {
		assert.deepEqual(bounds(dateSearch('2020-03', '=', now, format)), period(2020, 3, 1, 3, 31))
		assert.deepEqual(bounds(dateSearch('2020-2021', '=', now, format)),
			[[2020, 1, 1, 0, 0, 0, 0], [2021, 12, 31, 23, 59, 59, 999]])
	}
	const criterion = dateSearch(' 1/3/2020 - 9/3/2020 ', '=', now, 'dd/MM/yyyy')
	assert.deepEqual(bounds(criterion), period(2020, 3, 1, 3, 9))
	assert.deepEqual(bounds(dateSearch('3/1/2020-3/9/2020', '=', now, 'MM/dd/yyyy')), period(2020, 3, 1, 3, 9))
	assert.equal(dateSearch('-9/3/2020', '=', now).sql, ' <= ?')
	assert.equal(dateSearch('9/3/2020-', '=', now).sql, ' >= ?')
})

test('comparisons use the beginning or end of the selected calendar period', () => {
	for (const [operator, sql, expected] of [
		['>', ' > ?', [2020, 12, 31, 23, 59, 59, 999]],
		['>=', ' >= ?', [2020, 1, 1, 0, 0, 0, 0]],
		['<', ' < ?', [2020, 1, 1, 0, 0, 0, 0]],
		['<=', ' <= ?', [2020, 12, 31, 23, 59, 59, 999]]
	]) {
		const query = dateSearch('2020', operator, now).build()
		assert.equal(query.sql, sql)
		assert.deepEqual(stamp(query.values[0]), expected)
	}
	for (const operator of ['!', '!=', '<>']) {
		const criterion = dateSearch('2020', operator, now)
		assert.equal(criterion.sql, ' NOT BETWEEN ? AND ?')
		assert.deepEqual(bounds(criterion), period(2020, 1, 1, 12, 31))
	}
})

test('hyphens between years with more than two digits select all of both endpoint years', () => {
	for (const value of ['2026-2027', '2026 - 2027', '026-027', '026-2027']) {
		const criterion = dateSearch(value, '=', now)
		assert.equal(criterion.sql, ' BETWEEN ? AND ?')
		assert.deepEqual(bounds(criterion), [[2026, 1, 1, 0, 0, 0, 0], [2027, 12, 31, 23, 59, 59, 999]])
	}
	assert.deepEqual(bounds(dateSearch('2027-2026', '=', now)),
		[[2027, 1, 1, 0, 0, 0, 0], [2026, 12, 31, 23, 59, 59, 999]])
	assert.deepEqual(dateSearch('0000-2027', '=', now), [])
})

test('open ranges complete their bound to the beginning or end of its date period', () => {
	for (const [value, first, last] of [
		['2026', [2026, 1, 1, 0, 0, 0, 0], [2026, 12, 31, 23, 59, 59, 999]],
		['026', [2026, 1, 1, 0, 0, 0, 0], [2026, 12, 31, 23, 59, 59, 999]],
		['6', [2026, 6, 1, 0, 0, 0, 0], [2026, 6, 30, 23, 59, 59, 999]],
		['06', [2026, 6, 1, 0, 0, 0, 0], [2026, 6, 30, 23, 59, 59, 999]],
		['2020-02', [2020, 2, 1, 0, 0, 0, 0], [2020, 2, 29, 23, 59, 59, 999]],
		['2020-02-29', [2020, 2, 29, 0, 0, 0, 0], [2020, 2, 29, 23, 59, 59, 999]],
		['29/02/20', [2020, 2, 29, 0, 0, 0, 0], [2020, 2, 29, 23, 59, 59, 999]],
		['290220', [2020, 2, 29, 0, 0, 0, 0], [2020, 2, 29, 23, 59, 59, 999]]
	]) {
		const from = dateSearch(value + ' - ', '=', now, 'dd/MM/yyyy').build()
		const until = dateSearch(' - ' + value, '=', now, 'dd/MM/yyyy').build()
		assert.equal(from.sql, ' >= ?')
		assert.equal(until.sql, ' <= ?')
		assert.deepEqual(from.values.map(stamp), [first], value)
		assert.deepEqual(until.values.map(stamp), [last], value)
	}
	for (const value of ['-2026-02-29', '2020-13-', '-13', '0-', '-'])
		assert.deepEqual(dateSearch(value, '=', now), [])
})

test('wildcard dates are reordered from display format into SQL date patterns', () => {
	for (const [format, value, expected] of [
		['dd/MM/yyyy', '??/03/2020', '2020-03-__%'],
		['MM/dd/yyyy', '03/??/2020', '2020-03-__%'],
		['dd/MM/yyyy', '%/3/202?', '202_-03-0%%'],
		['dd/MM/yyyy', '202?-3-?', '202_-03-0_%'],
		['dd/MM/yyyy', '20??', '20__-%'],
		['dd/MM/yyyy', '0?', '2026-0_-%'],
		['dd/MM/yyyy', '??0320', '2020-03-__%'],
		['MM/dd/yyyy', '03??2020', '2020-03-__%'],
		['dd/MM/yyyy', '03/20??', '20__-03-%'],
		['dd/MM/yyyy', '20??/03', '20__-03-%'],
		['dd/MM/yyyy', '%', '2026-0%-%'], ['dd/MM/yyyy', '*', '2026-0%-%'],
		['dd/MM/yyyy', '??', '2026-__-%'], ['dd/MM/yyyy', '?*', '2026-_%-%'],
		['dd/MM/yyyy', '****', '%%%%-%'], ['dd/MM/yyyy', '????', '____-%'],
		['dd/MM/yyyy', '??03**', '20%%-03-__%'],
		['dd/MM/yyyy', '??/3/*', '202%-03-__%'],
		['dd/MM/yyyy', '??/3/**', '20%%-03-__%'],
		['dd/MM/yyyy', '??/3/***', '2%%%-03-__%'],
		['MM/dd/yyyy', '3/??/**', '20%%-03-__%']
	]) {
		assert.deepEqual(dateSearch(value, '=', now, format).build(), { sql: ' LIKE ?', values: [expected] }, value)
		for (const operator of ['!', '!=', '<>'])
			assert.deepEqual(dateSearch(value, operator, now, format).build(),
				{ sql: ' NOT LIKE ?', values: [expected] })
	}
})

test('a single question mark finds present dates and negation finds missing dates', () => {
	for (const value of ['?', ' ? ']) {
		assert.deepEqual(dateSearch(value, '=', now).build(), { sql: ' IS NOT NULL', values: [] })
		for (const operator of ['!', '!=', '<>'])
			assert.deepEqual(dateSearch(value, operator, now).build(), { sql: ' IS NULL', values: [] })
	}
})

test('invalid dates match no rows instead of rolling into another month', () => {
	for (const value of ['', '00', '13', '0000', '2026-02-29', '2020-13-01', '31/04/2020',
		'29/02/2026', '31042020', '310426', 'abcd', '0', '12345', '31/02/2020-01/03/2020'])
		assert.deepEqual(dateSearch(value, '=', now, 'dd/MM/yyyy'), [], value)
})

test('day periods use local midnight even across daylight saving changes', () => {
	for (const [month, day] of [[3, 29], [10, 25]]) {
		const query = dateSearch(`2026-${month}-${day}`, '=', now).build()
		assert.deepEqual(query.values, [new Date(2026, month - 1, day),
			new Date(new Date(2026, month - 1, day + 1).getTime() - 1)])
	}
})

test('the request display format determines slash and compact order without leaking between users', async () => {
	const { trLoad, trWithLanguage } = require('@itrocks/translate')
	const directory = await mkdtemp(join(tmpdir(), 'list-date-locale-'))
	try {
		for (const [language, format] of [['date-fr', 'dd/MM/yyyy'], ['date-us', 'MM/dd/yyyy']]) {
			const file = join(directory, language + '.csv')
			await writeFile(file, `dd/MM/yyyy;${format}\n`)
			await trLoad(file, language)
		}
		const results = await Promise.all(['date-fr', 'date-us'].map(language => trWithLanguage(language, async () => {
			await Promise.resolve()
			return [bounds(dateSearch('03/09/2020', '=', now)), bounds(dateSearch('03092020', '=', now))]
		})))
		assert.deepEqual(results, [
			[period(2020, 9, 3), period(2020, 9, 3)], [period(2020, 3, 9), period(2020, 3, 9)]
		])
	}
	finally { await rm(directory, { recursive: true, force: true }) }
})
