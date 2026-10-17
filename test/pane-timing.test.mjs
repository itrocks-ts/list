import assert            from 'node:assert/strict'
import { readFileSync }  from 'node:fs'
import { test }          from 'node:test'

// Exercise the delivered consumer methods with independent port timing; no browser input claim.
const source = readFileSync(new URL('../property-select.js', import.meta.url), 'utf8')
	.replace(/^import .*\n/gm, '')
globalThis.CSS ??= { escape: value => value }
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
		content: { querySelector: () => null }, disposed: false, drag,
		options: { saveColumns: () => { events.push('save'); return save.promise } },
		pending: new Map(), removals: new Map(), removedColumns: new Map(), view: { selector: {
			branchContexts: [], search: { results: [] }, usedProperties: [], setConfiguration: () => events.push('configuration')
		} }
	})
	return { consumer, drag, events, finish, save }
}

test('pane restoration waits for a moved column to be saved', async () => {
	const f = fixture(), result = f.consumer.end('drag', {})
	assert.deepEqual(f.events, [])
	f.finish.resolve('moved')
	await Promise.resolve()
	assert.deepEqual(f.events, ['save'])
	assert.equal(f.consumer.drag, f.drag)
	f.save.resolve()
	assert.equal((await result).status, 'moved')
	assert.deepEqual(f.events, ['save', 'configuration', 'restore'])
	assert.equal(f.consumer.drag, undefined)
})

for (const phase of ['admission', 'save']) {
	test(`rejection during ${phase} releases the pane token`, async () => {
		const f = fixture(), result = f.consumer.end('drag', {})
		if (phase === 'save') {
			f.finish.resolve('moved')
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
		segments: [{ label: 'Facture', path: '' }, { label: 'ville', path: 'city' },
			{ label: 'pays', path: 'city.country' }]
	}]
	f.consumer.pane = { suspend: () => ({ restore: () => {} }) }
	f.consumer.options.addition = { beginExternal: source => {
		label = source.create().header.textContent
		return { cancel: () => {} }
	} }
	globalThis.document = { createElement: () => ({ dataset: {}, textContent: '', append() {}, setAttribute() {} }) }
	try {
		f.consumer.begin({ ...f.drag.intent, path: 'city.country.name' }, {})
		assert.equal(label, 'ville.pays.nom')
	}
	finally { globalThis.document = document }
})

test('context and retained rows provide the full translated path without metadata requests', () => {
	const f = fixture()
	const document = globalThis.document
	globalThis.document = { createElement: () => ({ dataset: {}, textContent: '', append() {}, setAttribute() {} }) }
	try {
		f.consumer.view.selector.branchContexts = [
			{ properties: [{ path: 'city', label: 'ville' }] },
			{ properties: [{ path: 'city.country', label: 'pays' }] },
			{ properties: [{ path: 'city.country.name', label: 'nom' }] }
		]
		assert.equal(f.consumer.columnSource('city.country.name').create().header.textContent, 'ville.pays.nom')
		f.consumer.view.selector.branchContexts = []
		f.consumer.content.querySelector = () => ({ title: 'ville.pays.nom' })
		assert.equal(f.consumer.columnSource('city.country.name').create().header.textContent, 'ville.pays.nom')
	}
	finally { globalThis.document = document }
})

test('click commits before requesting values, without a separate validation or save', async () => {
	const f = fixture(), values = deferred()
	let loading
	f.consumer.drag = undefined
	f.consumer.loadColumn = () => { f.events.push('values'); return values.promise }
	f.consumer.options.addition = { begin: source => {
		f.events.push('placeholder')
		loading = source.load(new AbortController().signal)
		return { commit: () => { f.events.push('commit'); return 'added' }, cancel: () => f.events.push('cancel') }
	} }
	const result = f.consumer.add('city', new AbortController().signal)
	assert.deepEqual(f.events, ['placeholder', 'commit', 'configuration'])
	assert.equal(await result, 'added')
	assert.deepEqual(f.events, ['placeholder', 'commit', 'configuration', 'values'])
	values.resolve({ cells: [], header: {} })
	await loading
})

test('new drops restore the pane without waiting for their values request', async () => {
	const f = fixture(), result = f.consumer.end('drag', {})
	f.finish.resolve('added')
	assert.equal((await result).status, 'added')
	assert.deepEqual(f.events, ['configuration', 'restore'])
})

test('external moves skip admission and new drags wait until drop before loading', async () => {
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
	f.consumer.begin({ ...f.drag.intent, path: 'new' }, {})
	const loading = source.load(new AbortController().signal)
	await Promise.resolve()
	assert.equal(loaded, false)
	f.consumer.cancel('drag')
	await loading
	assert.equal(loaded, true)
	f.consumer.cancel('drag')
})


for (const kind of ['relation', 'terminal'])
test(`select toggles existing ${kind} columns after publishing the unchecked state`, async () => {
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
	assert.deepEqual(f.events, ['configuration', 'remove'])
	assert.deepEqual(f.consumer.paths(), ['number'])
	f.consumer.article.querySelectorAll = () => [{ dataset: { property: 'number' } }]
	removal.resolve(true)
	await Promise.resolve()
	f.save.resolve()
	assert.equal((await first).status, 'removed')
	assert.deepEqual(f.events, ['configuration', 'remove', 'save', 'configuration'])
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
	assert.deepEqual(f.events, ['configuration', 'configuration'])
	assert.deepEqual(f.consumer.paths(), ['number', 'city'])
	assert.equal(f.consumer.pending.size, 0)
})

for (const [name, columns, position, expected] of [
	['left neighbour has priority', ['number', 'city', 'note'], { left: 'number', right: 'city' }, 2],
	['left neighbour follows its current position', ['city', 'number', 'note'], { left: 'number', right: 'city' }, 3],
	['right neighbour is the fallback', ['city', 'note'], { left: 'number', right: 'city' }, 1],
	['missing neighbours append', ['note'], { left: 'number', right: 'city' }, undefined]
]) {
	test(`reselection placement: ${name}`, async () => {
		const f = fixture(), signal = new AbortController().signal
		f.consumer.drag = undefined
		f.consumer.removedColumns.set('amount', position)
		f.consumer.article.querySelectorAll = () => columns.map((path, index) => ({
			cellIndex: index + 1, dataset: { property: path }
		}))
		f.consumer.columnSource = () => ({})
		f.consumer.options.addition = { begin: () => ({
			header: { cellIndex: columns.length + 1 },
			cancel: () => assert.fail('Valid placement must commit'),
			commit: () => { f.events.push('commit'); return 'added' },
			moveTo: index => f.events.push(['move', index])
		}) }
		f.save.resolve()
		assert.equal(await f.consumer.add('amount', signal), 'added')
		assert.deepEqual(f.events, [...(expected === undefined ? [] : [['move', expected]]),
			'commit', 'configuration'])
		assert.equal(f.consumer.removedColumns.has('amount'), false)
	})
}

test('closing during removal cannot repopulate the new pane memory', async () => {
	const f = fixture(), removal = deferred()
	f.consumer.drag = undefined
	f.consumer.options.addition = { remove: () => removal.promise }
	const result = f.consumer.remove('city', new AbortController().signal)
	f.consumer.removedColumns = new Map()
	removal.resolve(true)
	f.save.resolve()
	assert.equal(await result, 'removed')
	assert.equal(f.consumer.removedColumns.size, 0)
})

test('cancelled addition retains the remembered neighbours for a later retry', async () => {
	const f = fixture(), position = { left: 'number', right: 'city' }
	f.consumer.drag = undefined
	f.consumer.removedColumns.set('amount', position)
	f.consumer.columnSource = () => ({})
	const abort = new AbortController()
	abort.abort(new Error('Addition cancelled'))
	f.consumer.options.addition = { begin: () => ({
		cancel: () => f.events.push('cancel'),
		commit: () => assert.fail('Rejected addition must not commit'),
		moveTo: () => assert.fail('Rejected addition must not move')
	}) }
	await assert.rejects(f.consumer.add('amount', abort.signal), /Addition cancelled/)
	assert.deepEqual(f.events, ['cancel'])
	assert.deepEqual(f.consumer.removedColumns.get('amount'), position)
})

for (const kind of ['relation', 'terminal']) {
	test(`rechecking ${kind} during its flash cancels removal without saving`, async () => {
		const f = fixture(), signal = new AbortController().signal, configurations = []
		f.consumer.drag = undefined
		f.consumer.view.selector.setConfiguration = configuration => configurations.push(configuration.usedPaths)
		f.consumer.options.addition = {
			remove: (_path, abort) => new Promise(resolve => {
				f.events.push('red')
				abort.addEventListener('abort', () => { f.events.push('cancel'); resolve(false) })
			}),
			reveal: () => {}, highlight: () => f.events.push('green')
		}
		const intent = { id: 'uncheck', path: 'city', root: 'invoice' }
		const first = f.consumer.select(intent, signal)
		assert.deepEqual(configurations, [['number']])
		const second = f.consumer.select({ ...intent, id: 'recheck' }, signal)
		assert.deepEqual(configurations.at(-1), ['number', 'city'])
		assert.equal((await first).status, 'existing')
		assert.equal((await second).status, 'existing')
		assert.deepEqual(f.events, ['red', 'cancel', 'green', 'green'])
		assert.equal(f.consumer.removedColumns.size, 0)
		assert.equal(f.consumer.pending.size, 0)
		assert.equal(f.consumer.removals.size, 0)
	})
}

test('a third rapid toggle starts a new removal after cancelling the first one', async () => {
	const f = fixture(), finalRemoval = deferred(), signal = new AbortController().signal
	f.consumer.drag = undefined
	let calls = 0
	f.consumer.options.addition = {
		remove: (_path, abort) => ++ calls === 1 ? new Promise(resolve => {
			abort.addEventListener('abort', () => resolve(false))
		}) : finalRemoval.promise,
		reveal: () => {}, highlight: () => {}
	}
	const intent = { id: 'off', path: 'city', root: 'invoice' }
	const off = f.consumer.select(intent, signal)
	const on = f.consumer.select({ ...intent, id: 'on' }, signal)
	const offAgain = f.consumer.select({ ...intent, id: 'off-again' }, signal)
	await off
	await on
	while (calls < 2) await Promise.resolve()
	assert.deepEqual(f.consumer.paths(), ['number'])
	f.consumer.article.querySelectorAll = () => [{ dataset: { property: 'number' } }]
	finalRemoval.resolve(true)
	f.save.resolve()
	assert.equal((await offAgain).status, 'removed')
	assert.equal(f.consumer.removals.size, 0)
})

test('rechecking after deletion but before persistence adds the column again', async () => {
	const f = fixture(), signal = new AbortController().signal
	f.consumer.drag = undefined
	f.consumer.options.addition = {
		remove: async () => {
			f.consumer.article.querySelectorAll = () => [{ dataset: { property: 'number' } }]
			return true
		},
		reveal: () => {}, highlight: () => {}
	}
	f.consumer.add = async () => { f.events.push('add'); return 'added' }
	const intent = { id: 'off', path: 'city', root: 'invoice' }
	const off = f.consumer.select(intent, signal)
	while (!f.events.includes('save')) await Promise.resolve()
	const on = f.consumer.select({ ...intent, id: 'on' }, signal)
	f.save.resolve()
	assert.equal((await off).status, 'removed')
	assert.equal((await on).status, 'added')
	assert.equal(f.events.filter(event => event === 'add').length, 1)
})
