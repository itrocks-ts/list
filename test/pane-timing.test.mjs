import assert            from 'node:assert/strict'
import { readFileSync }  from 'node:fs'
import { test }          from 'node:test'

// Exercise the delivered consumer methods with independent port timing; no browser input claim.
const source = readFileSync(new URL('../property-select.js', import.meta.url), 'utf8')
	.replace(/^import .*\n/gm, '')
const { ListPropertySelect } = await import('data:text/javascript,' + encodeURIComponent(
	'const normalisePath = value => value\n' + source
))
function deferred()
{
	let resolve, reject
	const promise = new Promise((yes, no) => { resolve = yes; reject = no })
	return { promise, reject, resolve }
}
function fixture()
{
	const finish = deferred(), save = deferred(), events = []
	let restored = false
	const drag = {
		drop: () => {},
		intent: { id: 'drag', path: 'city', root: 'invoice' }, paths: ['number'],
		operation: { cancel: () => { events.push('cancel'); finish.resolve('cancelled') }, finish: () => finish.promise },
		restore: () => { if (!restored) { restored = true; events.push('restore') } }
	}
	const consumer = Object.assign(Object.create(ListPropertySelect.prototype), {
		article: { querySelectorAll: () => [{ dataset: { property: 'number' } }, { dataset: { property: 'city' } }] },
		disposed: false, drag,
		options: { saveColumns: () => { events.push('save'); return save.promise } },
		pending: new Map(), view: { selector: {
			search: { results: [] }, setConfiguration: () => events.push('configuration')
		} }
	})
	return { consumer, drag, events, finish, save }
}

test('pane restoration waits for both admission and durable column save', async () => {
	const f = fixture(), result = f.consumer.end('drag', {})
	assert.deepEqual(f.events, [])
	f.finish.resolve('added')
	await Promise.resolve()
	assert.deepEqual(f.events, ['save'])
	assert.equal(f.consumer.drag, f.drag)
	f.save.resolve()
	assert.equal((await result).status, 'added')
	assert.deepEqual(f.events, ['save', 'configuration', 'restore'])
	assert.equal(f.consumer.drag, undefined)
})

for (const phase of ['admission', 'save']) {
	test(`rejection during ${phase} releases the pane token`, async () => {
		const f = fixture(), result = f.consumer.end('drag', {})
		if (phase === 'save') {
			f.finish.resolve('added')
			await Promise.resolve()
			f.save.reject(new Error('Save failed'))
		}
		else f.finish.reject(new Error('Admission refused'))
		assert.equal((await result).status, 'rejected')
		assert.equal(f.events.at(-1), 'restore')
		assert.equal(f.consumer.drag, undefined)
	})
}

test('cancellation restores before delayed completion and never starts a save', async () => {
	const f = fixture(), result = f.consumer.end('drag', {})
	f.consumer.cancel('drag')
	assert.deepEqual(f.events, ['cancel', 'restore', 'configuration'])
	assert.equal((await result).status, 'cancelled')
	assert.equal(f.events.filter(value => value === 'restore').length, 1)
	assert.equal(f.events.includes('save'), false)
})

test('the pane folds before external geometry starts and restores on synchronous rejection', () => {
	const f = fixture()
	f.consumer.drag = undefined
	f.consumer.pane = { suspend: options => {
		assert.deepEqual(options, { mobileOnly: true })
		f.events.push('fold')
		return { restore: () => f.events.push('restore') }
	} }
	f.consumer.options.addition = { beginExternal: () => {
		assert.deepEqual(f.events, ['fold'])
		throw new Error('Busy table')
	} }
	assert.throws(() => f.consumer.begin(f.drag.intent, {}), /Busy table/)
	assert.deepEqual(f.events, ['fold', 'restore'])
})

test('a dropped nested property uses its translated path in the provisional header', () => {
	const f = fixture()
	const document = globalThis.document
	let label
	f.consumer.drag = undefined
	f.consumer.view.selector.search.results = [{
		property: { label: 'nom', path: 'city.country.name' },
		segments: [{ label: 'ville' }, { label: 'pays' }]
	}]
	f.consumer.pane = { suspend: () => ({ restore: () => {} }) }
	f.consumer.options.addition = { beginExternal: source => {
		label = source.create().header.textContent
		return { cancel: () => {} }
	} }
	globalThis.document = { createElement: () => ({ dataset: {}, textContent: '' }) }
	try {
		f.consumer.begin({ ...f.drag.intent, path: 'city.country.name' }, {})
		assert.equal(label, 'ville.pays.nom')
	}
	finally { globalThis.document = document }
})

test('click inserts a placeholder and starts values without waiting for admission or saving', async () => {
	const f = fixture(), admission = deferred(), values = deferred()
	let source, loading
	f.consumer.drag = undefined
	f.consumer.validateColumn = () => admission.promise
	f.consumer.loadColumn = () => { f.events.push('values'); return values.promise }
	f.consumer.options.addition = { begin: value => {
		source = value
		f.events.push('placeholder')
		loading = source.load(new AbortController().signal)
		return { commit: () => { f.events.push('commit'); return 'added' }, cancel: () => f.events.push('cancel') }
	} }
	const result = f.consumer.add('city', new AbortController().signal)
	assert.deepEqual(f.events, ['placeholder', 'values'])
	admission.resolve()
	await Promise.resolve()
	assert.deepEqual(f.events, ['placeholder', 'values', 'commit', 'save'])
	f.save.resolve()
	assert.equal(await result, 'added')
	assert.ok(f.events.includes('values'))
	values.resolve({ cells: [], header: {} })
	await loading
})

test('external moves skip admission and new drags load values before drop', async () => {
	const f = fixture()
	f.consumer.drag = undefined
	f.consumer.pane = { suspend: () => ({ restore: () => {} }) }
	let source
	f.consumer.options.addition = { beginExternal: value => {
		source = value
		return { cancel: () => {} }
	} }
	f.consumer.begin({ ...f.drag.intent, path: 'number' }, {})
	assert.equal(source.accept, undefined)
	f.consumer.cancel('drag')
	let loaded = false
	f.consumer.loadColumn = async () => { loaded = true; return { cells: [], header: {} } }
	f.consumer.validateColumn = () => assert.fail('Admission must wait for the drop')
	f.consumer.begin({ ...f.drag.intent, path: 'new' }, {})
	void source.accept(new AbortController().signal)
	await source.load(new AbortController().signal)
	assert.equal(loaded, true)
	f.consumer.cancel('drag')
})


for (const kind of ['relation', 'terminal'])
test(`select toggles existing ${kind} columns once while repeated clicks share removal`, async () => {
	const f = fixture(), removal = deferred(), signal = new AbortController().signal
	f.consumer.drag = undefined
	f.consumer.view.selector.context = { properties: [{ kind, path: 'city' }] }
	f.consumer.view.selector.usedProperties = []
	f.consumer.options.addition = {
		remove: () => { f.events.push('remove'); return removal.promise },
		reveal: () => assert.fail('Removed columns must not be revealed again'),
		highlight: () => assert.fail('Removed columns must not flash green')
	}
	const intent = { id: 'click', path: 'city', root: 'invoice' }
	const first = f.consumer.select(intent, signal)
	const repeated = f.consumer.select({ ...intent, id: 'repeat' }, signal)
	assert.deepEqual(f.events, ['remove'])
	f.consumer.article.querySelectorAll = () => [{ dataset: { property: 'number' } }]
	removal.resolve(true)
	await Promise.resolve()
	f.save.resolve()
	assert.equal((await first).status, 'removed')
	assert.equal((await repeated).status, 'existing')
	assert.deepEqual(f.events, ['remove', 'save', 'configuration'])
})

test('plus keeps existing terminal columns and reveals them without saving or removing', async () => {
	const f = fixture(), signal = new AbortController().signal
	f.consumer.drag = undefined
	f.consumer.view.selector.context = { properties: [{ kind: 'terminal', path: 'city' }] }
	f.consumer.view.selector.usedProperties = []
	f.consumer.options.addition = {
		remove: () => assert.fail('Plus must never remove an existing column'),
		reveal: path => f.events.push(['reveal', path]),
		highlight: path => f.events.push(['highlight', path])
	}
	const outcome = await f.consumer.select({ action: 'add', id: 'plus', path: 'city', root: 'invoice' }, signal)
	assert.equal(outcome.status, 'existing')
	assert.deepEqual(f.events, [['reveal', 'city'], ['highlight', 'city']])
	assert.equal(f.consumer.pending.size, 0)
})

test('explicit addition keeps existing relation columns and reveals them without navigation', async () => {
	const f = fixture(), signal = new AbortController().signal
	f.consumer.drag = undefined
	f.consumer.view.selector.context = { properties: [{ kind: 'relation', path: 'city' }] }
	f.consumer.view.selector.usedProperties = []
	f.consumer.options.addition = {
		remove: () => assert.fail('Relations are selected without toggling'),
		reveal: path => f.events.push(['reveal', path]),
		highlight: path => f.events.push(['highlight', path])
	}
	const outcome = await f.consumer.select({ action: 'add', id: 'click', path: 'city', root: 'invoice' }, signal)
	assert.equal(outcome.status, 'existing')
	assert.deepEqual(f.events, [['reveal', 'city'], ['highlight', 'city']])
})

test('cancelled removal reports a recoverable failure without saving columns', async () => {
	const f = fixture(), signal = new AbortController().signal
	f.consumer.drag = undefined
	f.consumer.view.selector.context = { properties: [{ kind: 'terminal', path: 'city' }] }
	f.consumer.view.selector.usedProperties = []
	f.consumer.options.addition = { remove: async () => false }
	const outcome = await f.consumer.select({ id: 'click', path: 'city', root: 'invoice' }, signal)
	assert.equal(outcome.status, 'rejected')
	assert.match(outcome.message, /cancelled/)
	assert.deepEqual(f.events, [])
	assert.equal(f.consumer.pending.size, 0)
})
