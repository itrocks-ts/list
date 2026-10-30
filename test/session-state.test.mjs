import assert            from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)
const { Route } = require('@itrocks/route')
const { Filter } = require('../cjs/filter.js')
const { load, save } = require('../cjs/persist.js')
const { listSessionDependsOn, listState, replaceListState } = require('@itrocks/list/session-state')

class Movie {}
Route('/session-state-movie')(Movie)
const initial = { columns: ['title'], filter: { hidden: 'saved', title: 'Alien' }, sort: [['title', false]] }

test('the session port copies only persistent settings and replaces or resets the entire state', () => {
	const request = { session: {} }
	replaceListState(request, Movie, initial)
	request.session.list['/session-state-movie'].feed = { offset: 100 }
	const state = listState(request, Movie)
	assert.deepEqual(state, initial)
	state.columns.push('year')
	assert.deepEqual(listState(request, Movie).columns, ['title'])
	replaceListState(request, Movie, { columns: [] })
	assert.deepEqual(listState(request, Movie).columns, [])
	assert.equal(listState(request, Movie).filter, undefined)
	replaceListState(request, Movie)
	assert.deepEqual(request.session.list['/session-state-movie'], {})
})

test('filter mutations notify after applying changes without mutating the restored session object', () => {
	const request = { data: { search: { title: 'Blade Runner' } }, session: {} }
	replaceListState(request, Movie, initial)
	const list = { filter: new Filter({ map: callback => [callback({ name: 'title' })] }) }
	let changes = 0
	listSessionDependsOn({ changed: () => { changes ++ } })
	load(list, request, Movie)
	list.filter.getParams(request)
	assert.equal(listState(request, Movie).filter.title, 'Alien')
	save({ ...list, columns: { ignored: true } }, request, Movie)
	assert.equal(changes, 1)
	listSessionDependsOn({ changed: () => {} })
})
