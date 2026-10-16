import assert            from 'node:assert/strict'
import { mkdtemp }       from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir }        from 'node:os'
import { join }          from 'node:path'
import test              from 'node:test'
const require = createRequire(import.meta.url)
const { FileStore } = require('@itrocks/fastify-file-session-store')
const { SessionStateStore, selectorStateKey } = require('@itrocks/list/selector-state')
const state = { branch: ['customer'], current: 1, query: 'name', recent: [], scroll: {}, version: 1 }

test('actual session CAS, tombstones, distinct route keys and isolated sessions', async () => {
	const files = new FileStore(await mkdtemp(join(tmpdir(), 'selector-state-')))
	const session = {}
	const run = (id, object) => new SessionStateStore(object,
		(_session, operation) => files.transact(id, object, operation))
	const a = run('one', session)
	assert.deepEqual(await a.read('/invoice/list'), { revision: 0 })
	await a.write('/invoice/list', state, 0)
	await a.write('/invoice/42/list', { ...state, query: 'other' }, 0)
	const other = await new Promise((resolve, reject) =>
		files.get('one', (error, value) => error ? reject(error) : resolve(value)))
	const b = run('one', other)
	const results = await Promise.allSettled([
		a.write('/invoice/list', { ...state, query: 'first' }, 1),
		b.write('/invoice/list', { ...state, query: 'second' }, 1)
	])
	assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
	assert.equal(results.find(result => result.status === 'rejected').reason.code, 'STATE_CONFLICT')
	assert.deepEqual(await b.remove('/invoice/list', 2), { revision: 3 })
	await assert.rejects(a.write('/invoice/list', state, 2), error => error.code === 'STATE_CONFLICT')
	assert.deepEqual(await a.read('/invoice/list'), { revision: 3 })
	assert.equal((await a.write('/invoice/list', state, 3)).revision, 4)
	assert.equal((await a.read('/invoice/42/list')).state.query, 'other')
	assert.deepEqual(await run('two', {}).read('/invoice/list'), { revision: 0 })
	assert.equal(selectorStateKey({ route: '/organisation/invoices', ids: ['42'], action: 'list' }),
		'/organisation/invoices/42/list')
})

test('public browser transport carries credentials, revisions and a session generation', async () => {
	const { HttpStateStore } = await import('@itrocks/list/selector-state.js')
	const calls = []
	let status = 200, generation = 'first-generation'
	const transport = new HttpStateStore('/state', async (url, options) => {
		calls.push({ url, options })
		return new Response(JSON.stringify({ revision: 1 }), {
			headers: { 'X-Property-Select-Session': generation }, status
		})
	})
	await transport.read('/invoices/list')
	await transport.write('/invoices/list', state, 1)
	assert.equal(calls[1].options.credentials, 'same-origin')
	assert.equal(calls[1].options.headers['X-Property-Select-Session'], generation)
	assert.equal(JSON.parse(calls[1].options.body).revision, 1)
	status = 409
	await assert.rejects(transport.write('/invoices/list', state, 1), error => error.code === 'STATE_CONFLICT')
	status = 410
	await assert.rejects(transport.write('/invoices/list', state, 1), /session has ended/)
	status = 200
	generation = 'new-session'
	await assert.rejects(transport.read('/invoices/list'), /session has ended/)
})

test('embedded state skips the first HTTP read and preserves session checks and conflict rereads', async () => {
	const { HttpStateStore } = await import('@itrocks/list/selector-state.js')
	const calls = []
	const transport = new HttpStateStore('/state', async (url, options) => {
		calls.push({ url, options })
		return new Response(JSON.stringify({ revision: 4, state }), {
			headers: { 'X-Property-Select-Session': 'embedded-session' }
		})
	}, { generation: 'embedded-session', key: '/invoices/list', record: { revision: 3, state } })
	assert.deepEqual(await transport.read('/invoices/list'), { revision: 3, state })
	assert.equal(calls.length, 0)
	await transport.write('/invoices/list', state, 3)
	assert.equal(calls[0].options.headers['X-Property-Select-Session'], 'embedded-session')
	assert.equal(JSON.parse(calls[0].options.body).revision, 3)
	assert.equal((await transport.read('/invoices/list')).revision, 4)
	assert.equal(calls[1].options.method, 'GET')
})
