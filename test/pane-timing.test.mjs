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
