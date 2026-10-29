import assert            from 'node:assert/strict'
import { mkdtemp }       from 'node:fs/promises'
import { rm }            from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir }        from 'node:os'
import { join }          from 'node:path'
import { after }         from 'node:test'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)

const { FileStore } = require('@itrocks/fastify-file-session-store')
const { Feed }      = require('../cjs/feed.js')
const { Filter }    = require('../cjs/filter.js')
const { List }      = require('../cjs/list.js')
const { Sort }      = require('../cjs/sort.js')
const storage  = require('@itrocks/storage')

const originalDataSource = storage.dataSource
let activeDataSource

storage.dataSource = () => activeDataSource

after(() => {
	storage.dataSource = originalDataSource
})

test('html combines user filters and a mandatory scope for projection and count', async () => {
	const filter = { owner: 'requested-owner', text: 'visible text' }
	const scope  = { owner: 'authorized-owner', tenant: 42 }
	const { calls, list } = listDouble({ filter })

	await list.html(actionRequest(), scope)

	assert.equal(calls.select.length, 1)
	assert.equal(calls.count.length, 1)
	assert.equal(calls.select[0].type, Entry)
	assert.deepEqual({ ...calls.select[0].search }, {
		owner:  'authorized-owner',
		tenant: 42,
		text:   'visible text'
	})
	assert.equal(Object.getPrototypeOf(calls.select[0].search), Entry.prototype)
	assert.equal(calls.count[0].search, calls.select[0].search)
	assert.deepEqual(calls.select[0].options, ['sort', 'filter', 'feed'])
	assert.deepEqual(scope, { owner: 'authorized-owner', tenant: 42 })
})

test('html keeps the mandatory scope on paginated feed requests', async () => {
	const scope = { tenant: 42 }
	const { calls, list } = listDouble({ filter: { text: 'visible text' }, offset: 50 })

	const response = await list.html(actionRequest({ offset: '50' }), scope)

	assert.equal(calls.select.length, 1)
	assert.deepEqual({ ...calls.select[0].search }, { tenant: 42, text: 'visible text' })
	assert.deepEqual(calls.select[0].options, ['sort', 'filter', 'feed'])
	assert.equal(calls.count.length, 0)
	assert.equal(response.template, 'feed.html')
})

test('html restores session filters for queries and inputs, and accepts clearing them', async () => {
	const session = {}
	const render = async data => {
		const { calls, list } = listDouble()
		list.filter = new Filter({ map: callback => ['owner', 'text'].map(name => callback({ name })) })
		const request = actionRequest(data)
		request.request.session = session
		const response = await list.html(request)
		return { calls, response }
	}

	await render({ search: { text: 'Alice & Bob' } })
	const restored = await render({})
	assert.deepEqual({ ...restored.calls.select[0].search }, { text: 'Alice & Bob' })
	assert.deepEqual(restored.response.data.search, { owner: '', text: 'Alice & Bob' })
	assert.equal(restored.calls.count[0].search, restored.calls.select[0].search)

	const sorted = await render({ sort: 'text' })
	assert.deepEqual({ ...sorted.calls.select[0].search }, { text: 'Alice & Bob' })
	const feed = await render({ offset: '50', search: { owner: '', text: 'Alice & Bob' } })
	assert.deepEqual({ ...feed.calls.select[0].search }, { text: 'Alice & Bob' })

	await render({ search: { text: '' } })
	const cleared = await render({})
	assert.deepEqual({ ...cleared.calls.select[0].search }, {})
	assert.equal(cleared.response.data.search.text, '')
})

test('feed restores the current query after durable session saves, changing only the limit', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'list-feed-'))
	const store = new FileStore(directory)
	const read = () => new Promise((resolve, reject) =>
		store.get('list', (error, session) => error ? reject(error) : resolve(session ?? {})))
	const render = async data => {
		const session = await read()
		const { calls, list } = listDouble()
		list.columns.properties = []
		list.feed   = new Feed()
		list.filter = new Filter({ map: callback => ['owner', 'text'].map(name => callback({ name })) })
		list.sort   = new Sort(list.columns)
		const request = actionRequest(data)
		request.request.session = session
		const response = await list.html(request, { tenant: 42 })
		await store.transact('list', session, () => {})
		return { calls, response }
	}
	const compare = (initial, feed, offset) => {
		const first = initial.calls.select[0]
		const next  = feed.calls.select[0]
		assert.deepEqual(next.columns, first.columns)
		assert.deepEqual(next.search, first.search)
		assert.deepEqual(next.options.filter(option => !(option instanceof storage.Limit)),
			first.options.filter(option => !(option instanceof storage.Limit)))
		assert.deepEqual(next.options.find(option => option instanceof storage.Limit), new storage.Limit(50, offset))
		assert.equal(feed.calls.count.length, 0)
		assert.equal(feed.response.template.endsWith('/feed.html'), true)
	}
	try {
		await render({ sort: 'owner', search: { text: 'Alice & Bob' } })
		const changed = await render({ sort: 'text' })
		compare(changed, await render({ offset: '50' }), 50)
		// Promote an existing criterion without changing either direction.
		const promoted = await render({ sort: 'owner' })
		assert.deepEqual(promoted.calls.select[0].options[0].properties, ['owner', 'text'])
		compare(promoted, await render({ offset: '50' }), 50)
		compare(promoted, await render({ offset: '100' }), 100)
		const reversed = await render({ sort: 'text', reverse: '', search: { owner: 'current' } })
		compare(reversed, await render({ offset: '50' }), 50)
		const cleared = await render({ search: { text: '', owner: '' } })
		assert.deepEqual({ ...cleared.calls.select[0].search }, { tenant: 42 })
		compare(cleared, await render({ offset: '50' }), 50)
	}
	finally { await rm(directory, { recursive: true, force: true }) }
})

test('session sorting retains its priority and directions in the ordered format', () => {
	const { list } = listDouble()
	list.columns.properties = []
	const sort = new Sort(list.columns)
	sort.unserialize([['text', true], ['owner', false]])
	sort.getParams({ data: {} }, Entry)
	assert.deepEqual(sort.serialize(), [['text', true], ['owner', false]])
	const restored = new Sort({ properties: [] })
	restored.unserialize(JSON.parse(JSON.stringify(sort.serialize())))
	assert.deepEqual(restored.sortOption(), sort.sortOption())
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

	assert.deepEqual({ ...htmlDouble.calls.select[0].search }, { text: 'visible text' })
	assert.equal(htmlDouble.calls.count[0].search, htmlDouble.calls.select[0].search)

	const jsonDouble = listDouble()

	await jsonDouble.list.json(actionRequest())

	assert.equal(jsonDouble.calls.search[0].search, undefined)
})

class Entry
{}

function actionRequest(data = {})
{
	return {
		action: 'list', ids: [], route: '/entry',
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
		search: [],
		select: []
	}
	activeDataSource = {
		async select(type, columns, search, options)
		{
			calls.select.push({ columns, options, search, type })
			return { rootType: type, columns: [], rows: [{ rootId: 1, cells: [] }] }
		},
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
		[Symbol.iterator]() { return [][Symbol.iterator]() },
		map() { return [] },
		serialize() { return [] },
		projected(result) { return result.rows },
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

test('initial HTML embeds the session bootstrap; feed and configuration saves do not rebuild it', async () => {
	const { listDependsOn } = require('@itrocks/list')
	const { listStateDependsOn } = require('@itrocks/list/selector-state')
	const session = { propertySelect: { '/entry/list': { revision: 5 } } }
	let bootstraps = 0
	listStateDependsOn({ transaction: async (_session, operation) => operation(session) })
	listDependsOn({ access: async () => ({
		authorise: async () => {}, root: '/entry', bootstrap: async (_paths, record) => {
			bootstraps ++
			assert.equal(record.revision, 5)
			return { template: '<section title="A & B">', contexts: [] }
		}
	}) })
	try {
		const response = await listDouble().list.html(actionRequest())
		const initial = JSON.parse(decodeURIComponent(response.data.selectorBootstrap))
		assert.equal(initial.generation, session.propertySelectGeneration)
		assert.equal(initial.record.revision, 5)
		assert.equal(initial.template, '<section title="A & B">')
		assert.ok(!response.data.selectorBootstrap.includes('"'))
		await listDouble({ offset: 50 }).list.html(actionRequest({ offset: '50' }))
		await listDouble().list.html(actionRequest({ columns: '' }))
		assert.equal(bootstraps, 1)
	}
	finally { listDependsOn({ access: async () => ({ authorise: async () => {} }) }) }
})
