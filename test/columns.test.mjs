import assert            from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)
const { File } = require('@itrocks/class-file')
const { Columns } = require('../cjs/columns.js')
const { List }    = require('../cjs/list.js')
const { List: ListProperties } = require('@itrocks/list-properties')
const { load, save } = require('../cjs/persist.js')
const { routeOf } = require('@itrocks/route')

class Entry
{
	name = ''
	email = ''
	createdAt = ''
}
File(require.resolve('./fixtures/entry.d.ts').replace('.d.ts', '.js'))(Entry)
ListProperties('name', 'email', 'createdAt')(Entry)

const request = (columns, session = {}) => ({ data: columns === undefined ? {} : { columns }, session })

test('columns accept reordering and removing properties without restoring defaults', () => {
	const columns = new Columns()
	columns.getParams(request(), Entry)
	assert.deepEqual(columns.serialize(), ['name', 'email', 'createdAt'])
	for (const value of ['createdAt,name', ['name', 'createdAt'], 'name']) {
		columns.getParams(request(value), Entry)
		assert.deepEqual(columns.serialize(), Array.isArray(value) ? value : value.split(','))
		columns.getParams(request(), Entry)
		assert.deepEqual(columns.serialize(), Array.isArray(value) ? value : value.split(','))
	}
	columns.getParams(request(''), Entry)
	columns.getParams(request(), Entry)
	assert.deepEqual(columns.serialize(), [])
})

test('columns reject duplicates, unknown properties and malformed requests', () => {
	const columns = new Columns()
	columns.getParams(request('email'), Entry)
	for (const value of ['name,name', 'name,unknown', 'name,', [42], {}]) {
		columns.getParams(request(value), Entry)
		assert.deepEqual(columns.serialize(), ['email'])
	}
})

test('removed columns, including the last column, survive session restoration', () => {
	const session = {}
	for (const value of ['email,name', '']) {
		const original = { columns: new Columns() }
		original.columns.getParams(request(value, session), Entry)
		save(original, request(undefined, session), Entry)
		const restored = { columns: new Columns() }
		load(restored, request(undefined, session), Entry)
		restored.columns.getParams(request(undefined, session), Entry)
		assert.deepEqual(restored.columns.serialize(), value ? value.split(',') : [])
	}
})

test('column changes persist and return 204 before any data query, even for an empty list', async () => {
	const session = {}
	for (const value of ['email', '']) {
		const list = new List()
		list.htmlResponse = (body, status) => ({ body, status })
		list.feed.getParams = () => assert.fail('A column save must not fetch or render the list')
		const response = await list.html({ type: Entry, request: request(value, session) })
		assert.deepEqual(response, { body: '', status: 204 })
		assert.deepEqual(session.list[routeOf(Entry)].columns, value ? [value] : [])
	}
})

test('column saves preserve validation and restore an empty session on the next request', async () => {
	const session = {}
	for (const [value, expected] of [
		['email', ['email']], ['name,unknown', ['email']], ['', []], [[], []], [[''], []]
	]) {
		const list = new List()
		list.htmlResponse = (body, status) => ({ body, status })
		list.feed.getParams = () => assert.fail('Column saves must finish before feed processing')
		assert.deepEqual(await list.html({ type: Entry, request: request(value, session) }), { body: '', status: 204 })
		assert.deepEqual(session.list[routeOf(Entry)].columns, expected)
	}
	for (const data of [{}, { columns: undefined }]) {
		const list = new List()
		const rendering = new Error('Normal list rendering reached')
		list.feed.getParams = () => { throw rendering }
		await assert.rejects(list.html({ type: Entry, request: { data, session } }), error => error === rendering)
		assert.deepEqual(list.columns.serialize(), [])
	}
})
