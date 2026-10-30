import assert            from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)
const { File } = require('@itrocks/class-file')
const { AND, OR, and, like, notLike, or } = require('@itrocks/sql-functions')
const { tr, trLoad, trWithLanguage } = require('@itrocks/translate')
const { dateSearch } = require('../cjs/date-search.js')
const { Filter } = require('../cjs/filter.js')
const { Invoice } = require('./fixtures/graph.cjs')

class Entry {}
File(require.resolve('./fixtures/filter.d.ts').replace('.d.ts', '.js'))(Entry)

await trLoad(fileURLToPath(new URL('../../framework/fr-FR.csv', import.meta.url)), 'fr-FR')

function filtered(property, value, type = Entry)
{
	const filter = new Filter({ map: callback => [callback({ name: property })] })
	filter.getParams({ data: { search: { [property]: value } } })
	return { filter, search: filter.searchObject(type) }
}

test('aliases combine with other criteria and expand through object representatives', () => {
	trWithLanguage('fr-FR', () => {
		assert.deepEqual(filtered('text', 'vide | (!vide & A*)').search.text,
			or(notLike('_%'), and(like('_%'), like('A%'))))
		const search = filtered('city', 'vide', Invoice).search
		assert.deepEqual(search[AND][0][OR][0]['city.name'], notLike('_%'))
		assert.deepEqual(filtered('city.country.name', '!vide', Invoice).search['city.country.name'], like('_%'))
	})
})

test('empty aliases and their negations use the existing wildcard and date criteria', () => {
	for (const language of ['en-US', 'fr-FR']) trWithLanguage(language, () => {
		const word = tr('empty')
		assert.equal(word, language === 'fr-FR' ? 'vide' : 'empty')
		for (const alias of new Set(['empty', word, word.toUpperCase(), ` ${word} `])) {
			for (const prefix of ['', '!', '!=', '<>']) {
				const input = ` ${prefix} ${alias} `
				for (const property of ['date', 'text', 'year']) {
					const { filter, search } = filtered(property, input)
					const expected = property === 'date'
						? dateSearch('?', prefix ? undefined : '!')
						: (prefix ? like('_%') : notLike('_%'))
					assert.deepEqual(search[property], expected, `${language}: ${property}: ${input}`)
					assert.equal(filter.serialize()[property], input)
					const restored = new Filter({ map: callback => [callback({ name: property })] })
					restored.unserialize(filter.serialize())
					assert.deepEqual(restored.searchObject(Entry)[property], expected)
				}
			}
		}
	})
})

test('literal comparisons and words containing an alias retain their original meaning', () => {
	trWithLanguage('fr-FR', () => {
		for (const [input, sql, value] of [
			['=empty', ' = ?', 'empty'], ['=vide', ' = ?', 'vide'], ['>vide', ' > ?', 'vide'],
			['emptyish', ' LIKE ?', 'emptyish%'], ['vide*', ' LIKE ?', 'vide%'], ['video', ' LIKE ?', 'video%']
		]) {
			assert.deepEqual(filtered('text', input).search.text.build(), { sql, values: [value] })
		}
	})
	trWithLanguage('en-US', () => assert.deepEqual(filtered('text', 'vide').search.text, like('vide%')))
})
