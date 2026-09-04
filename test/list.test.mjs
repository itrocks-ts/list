import assert            from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after }         from 'node:test'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)

const { List } = require('../cjs/list.js')
const storage  = require('@itrocks/storage')

const originalDataSource = storage.dataSource
let activeDataSource

storage.dataSource = () => activeDataSource

after(() => {
	storage.dataSource = originalDataSource
})

test('html combines user filters and a mandatory scope for search and count', async () => {
	const filter = { owner: 'requested-owner', text: 'visible text' }
	const scope  = { owner: 'authorized-owner', tenant: 42 }
	const { calls, list } = listDouble({ filter })

	await list.html(actionRequest(), scope)

	assert.equal(calls.search.length, 1)
	assert.equal(calls.count.length, 1)
	assert.equal(calls.search[0].type, Entry)
	assert.deepEqual({ ...calls.search[0].search }, {
		owner:  'authorized-owner',
		tenant: 42,
		text:   'visible text'
	})
	assert.equal(Object.getPrototypeOf(calls.search[0].search), Entry.prototype)
	assert.equal(calls.count[0].search, calls.search[0].search)
	assert.deepEqual(calls.search[0].options, ['sort', 'filter', 'feed'])
	assert.deepEqual(scope, { owner: 'authorized-owner', tenant: 42 })
})

test('html keeps the mandatory scope on paginated feed requests', async () => {
	const scope = { tenant: 42 }
	const { calls, list } = listDouble({ filter: { text: 'visible text' }, offset: 50 })

	const response = await list.html(actionRequest({ offset: '50' }), scope)

	assert.equal(calls.search.length, 1)
	assert.deepEqual({ ...calls.search[0].search }, { tenant: 42, text: 'visible text' })
	assert.deepEqual(calls.search[0].options, ['sort', 'filter', 'feed'])
	assert.equal(calls.count.length, 0)
	assert.equal(response.template, 'feed.html')
})

test('json forwards its mandatory scope directly to the data source', async () => {
	const scope = { tenant: 42 }
	const { calls, list } = listDouble()

	const response = await list.json(actionRequest(), scope)

	assert.equal(calls.search.length, 1)
	assert.equal(calls.search[0].search, scope)
	assert.equal(calls.search[0].options, undefined)
	assert.deepEqual(response.body, [{ id: 1, text: 'result' }])
})

test('omitting the scope preserves html filters and the json query', async () => {
	const htmlDouble = listDouble({ filter: { text: 'visible text' } })

	await htmlDouble.list.html(actionRequest())

	assert.deepEqual({ ...htmlDouble.calls.search[0].search }, { text: 'visible text' })
	assert.equal(htmlDouble.calls.count[0].search, htmlDouble.calls.search[0].search)

	const jsonDouble = listDouble()

	await jsonDouble.list.json(actionRequest())

	assert.equal(jsonDouble.calls.search[0].search, undefined)
})

class Entry
{}

function actionRequest(data = {})
{
	return {
		request: {
			data,
			headers: {},
			method:  'GET',
			session: {}
		},
		type: Entry
	}
}

function listDouble({ filter = {}, offset = 0 } = {})
{
	const calls = {
		count:  [],
		search: []
	}
	activeDataSource = {
		async count(type, search)
		{
			calls.count.push({ search, type })
			return 1
		},
		async search(type, search, options)
		{
			calls.search.push({ options, search, type })
			return [{ id: 1, text: 'result' }]
		}
	}

	const list = new List()
	list.columns = {
		getParams()
		{},
		propertiesOf(object)
		{
			return object
		}
	}
	list.feed = {
		getParams()
		{},
		offset,
		readOptions(options)
		{
			return [...options, 'feed']
		},
		template: 'feed.html'
	}
	list.filter = {
		getParams()
		{},
		readOptions(options)
		{
			return [...options, 'filter']
		},
		search: {},
		searchObject(type)
		{
			return Object.setPrototypeOf({ ...filter }, type.prototype)
		}
	}
	list.sort = {
		getParams()
		{},
		readOptions()
		{
			return ['sort']
		}
	}
	list.htmlTemplateResponse = (data, _request, template) => ({ data, template })
	list.jsonResponse         = body => ({ body })

	return { calls, list }
}
