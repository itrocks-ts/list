import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const require = createRequire(import.meta.url)
const { City, Country, Invoice } = require('./fixtures/graph.cjs')
const { List, listDependsOn } = require('@itrocks/list')
const { ListColumn, representationFields, listRepresentationDependsOn } = require('@itrocks/list/projection')
const { Columns, projectColumns } = require('../cjs/columns.js')
const { Filter } = require('../cjs/filter.js')
const { Sort } = require('../cjs/sort.js')
const { List: ListProperties } = require('@itrocks/list-properties')
const { Representative, representativeOf } = require('@itrocks/class-view')
const { storeOutput } = require('@itrocks/core-transformers')
const { initCollectionHtmlTransformers } = require('@itrocks/core-transformers')
const { Component } = require('@itrocks/composition')
const { MultipleOutput, multipleOutputOf } = require('@itrocks/list/multiple-output')
const { PropertySelect } = require('@itrocks/property-select')
const { HTML, OUTPUT, setPropertyTransformer, setPropertyTypeTransformer } = require('@itrocks/transformer')
const storage = require('@itrocks/storage')
const original = storage.dataSource
ListProperties('number')(Invoice)
after(() => { storage.dataSource = original })
const request = (data = {}, session = {}) => ({ type: Invoice, request: { data, headers: {}, session } })

test('column labels translate every property in a nested path', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'list-column-labels-'))
	try {
		const file = join(directory, 'labels.csv')
		await writeFile(file, 'city;ville\ncountry;pays\nname;nom\n')
		const { trLoad, trWithLanguage } = require('@itrocks/translate')
		await trLoad(file, 'fr-list-column-test')
		const label = trWithLanguage('fr-list-column-test', () =>
			new ListColumn(Invoice, 'city.country.name').label)
		assert.equal(label, 'ville.pays.nom')
	}
	finally { await rm(directory, { recursive: true, force: true }) }
})

test('object and deep columns derive a finite representation closure through reflection', async () => {
	const column = new ListColumn(Invoice, 'city')
	assert.deepEqual(column.selection(), { path: 'city', objectFields: ['name', 'country.name'] })
	assert.deepEqual(new ListColumn(Invoice, 'city.country.name').selection(), 'city.country.name')
	assert.deepEqual(column.sortPaths(), ['city.name', 'city.country.name', 'city'])
	setPropertyTransformer(Invoice, 'city', HTML, OUTPUT, value => `${value.name} (${value.country.name})`)
	const country = Object.assign(Object.create(Country.prototype), { id: 3, name: 'FRANCE' })
	const city = Object.assign(Object.create(City.prototype), { country, id: 2, name: 'Paris' })
	assert.equal(await column.output({ kind: 'value', loadedFields: ['name', 'country.name'], value: city }),
		'Paris (FRANCE)')
	await assert.rejects(column.output({ kind: 'value', loadedFields: ['name'], value: city }),
		error => error.code === 'unsupported-selection')
	assert.equal(await column.output({ kind: 'absent', at: 'city' }), '')
	assert.match(await new ListColumn(Invoice, 'number').output({ kind: 'unloaded', reason: 'ignored' }), /Unavailable/)
	setPropertyTransformer(Invoice, 'city', HTML, OUTPUT, storeOutput)
})

test('plural, cyclic and undeclared custom representation closures fail before projection', () => {
	assert.throws(() => new ListColumn(Invoice, 'cities.name'), error => error.code === 'multiple-values')
	listRepresentationDependsOn({ fields: () => ['parent'] })
	assert.throws(() => representationFields(City), error => error.code === 'unsupported-selection')
	listRepresentationDependsOn({ fields: () => { throw new Error('Undeclared custom representative fields') } })
	assert.throws(() => new ListColumn(Invoice, 'city'), /Undeclared/)
	listRepresentationDependsOn({ fields: undefined })
})

test('component columns show up to eight values and count from nine', async () => {
	const representative = representativeOf(City)
	Representative('name')(City)
	initCollectionHtmlTransformers({
		representativeValueOf: async value => value.name,
		propertyOutput: async (object, property) => String(object[property] ?? '')
	})
	const column = new ListColumn(Invoice, 'cities')
	assert.equal(column.multiple, true)
	assert.equal(column.sortable, false)
	const sortable = new Columns()
	sortable.unshift(column)
	const sort = new Sort(sortable)
	sort.getParams({ data: { sort: 'cities' } }, Invoice)
	assert.deepEqual(sort.sortOption().properties, [])
	const cities = [Object.assign(new City(), { name: 'Paris' }), Object.assign(new City(), { name: 'Lyon' })]
	assert.equal(multipleOutputOf(Invoice, 'cities'), 'commas')
	assert.equal(await column.output({ kind: 'value', value: cities }), 'Lyon, Paris')
	Component()(Invoice.prototype, 'cities')
	assert.equal(multipleOutputOf(Invoice, 'cities'), 'commas')
	assert.equal(await column.output({ kind: 'value', value: cities }), 'Lyon, Paris')
	assert.equal(await column.output({ kind: 'value', value: [] }), '')
	const eight = Array.from({ length: 8 }, (_, index) => Object.assign(new City(), { name: `City ${index}` }))
	assert.equal(await column.output({ kind: 'value', value: eight }),
		Array.from({ length: 8 }, (_, index) => `City ${index}`).join(', '))
	assert.equal(await column.output({ kind: 'value', value: [...eight, new City()] }), '9 cities')
	Component(false)(Invoice.prototype, 'cities')
	MultipleOutput('lines')(Invoice.prototype, 'cities')
	assert.equal(multipleOutputOf(Invoice, 'cities'), 'lines')
	assert.equal(await column.output({ kind: 'value', value: cities }),
		'<ul><li>Lyon</li><li>Paris</li></ul>')
	Component()(Invoice.prototype, 'cities')
	assert.equal(await column.output({ kind: 'value', value: cities }), 'Lyon, Paris')
	assert.equal(await column.output({ kind: 'value', value: [...eight, new City()] }), '9 cities')
	MultipleOutput('commas')(Invoice.prototype, 'cities')
	assert.equal(multipleOutputOf(Invoice, 'cities'), 'commas')
	assert.equal(await column.output({ kind: 'value', value: cities }), 'Lyon, Paris')
	Component(false)(Invoice.prototype, 'cities')
	Representative(...representative)(City)
})

test('plural cells use the visible projected ids and keep singular columns in place', async () => {
	const calls = []
	storage.dataSource = () => ({
		select: async (_type, selections) => {
			calls.push(selections)
			return { rootType: Invoice, columns: [{ path: 'number', kind: 'scalar' }], rows: [
				{ rootId: 2, cells: [{ kind: 'value', value: 'INV-2' }] },
				{ rootId: 1, cells: [{ kind: 'value', value: 'INV-1' }] }
			] }
		},
		search: async (_type, _search, options) => {
			assert.deepEqual(options[0].ids, [2, 1])
			return [{ id: 1, cities: [{ name: 'Paris' }] }, { id: 2, cities: [{ name: 'Lyon' }] }]
		}
	})
	const columns = [new ListColumn(Invoice, 'cities'), new ListColumn(Invoice, 'number')]
	const result = await projectColumns(Invoice, columns, {}, [])
	assert.deepEqual(calls, [['number']])
	assert.deepEqual(result.rows.map(row => row.cells.map(cell => cell.value)), [
		[[{ name: 'Lyon' }], 'INV-2'], [[{ name: 'Paris' }], 'INV-1']
	])
})

test('property selector admits and sends a direct plural object column', async () => {
	storage.dataSource = () => ({
		select: async () => ({ rootType: Invoice, columns: [], rows: [{ rootId: 1, cells: [] }] }),
		search: async () => [{ id: 1, cities: [Object.assign(new City(), { name: 'Paris' })] }]
	})
	const list = new List()
	list.jsonResponse = (body, status = 200) => ({ body, status })
	const admitted = await list.html(request({ column: 'cities', validate: '1' }))
	assert.equal(admitted.status, 200)
	assert.equal(admitted.body.sortable, false)
	const selected = []
	const selector = new PropertySelect({
		root: 'invoice',
		metadata: {
			context: async () => ({ label: 'Invoice', path: '', type: 'Invoice', properties: [
				{ kind: 'relation', label: 'Cities', name: 'cities', order: 0, path: 'cities',
					relation: { cardinality: 'one-to-many', id: 'Invoice.cities' }, target: 'City' }
			] }),
			resolve: async () => ({ kind: 'relation', label: 'Cities', name: 'cities', order: 0, path: 'cities',
				relation: { cardinality: 'one-to-many', id: 'Invoice.cities' }, target: 'City' })
		},
		consumer: { select: async intent => {
			selected.push(intent.path)
			const response = await list.html(request({ column: intent.path, rowIds: '1' }))
			assert.equal(response.status, 200)
			assert.deepEqual(response.body.rows, [{ html: 'Paris', id: 1 }])
			return { id: intent.id, path: intent.path, status: 'added' }
		} }
	})
	const errors = []
	selector.subscribe(event => { if (event.type === 'error') errors.push(event.error) })
	await selector.mount()
	const outcome = await selector.select('cities')
	assert.deepEqual(errors, [])
	assert.equal(outcome.status, 'added')
	assert.deepEqual(selected, ['cities'])
	selector.dispose()
})

test('path columns persist, filter both form trees and query keys, and expand representative ordering', () => {
	const columns = new Columns()
	columns.getParams({ data: { columns: 'number,city,city.country.name' } }, Invoice)
	const restored = new Columns()
	restored.unserialize(columns.serialize(), Invoice)
	assert.deepEqual(restored.serialize(), ['number', 'city', 'city.country.name'])
	const filter = new Filter(restored)
	filter.getParams({ data: { search: { city: { country: { name: 'France' } } } } })
	assert.equal(filter.search['city.country.name'], 'France')
	filter.getParams({ data: { search: { city: '', 'city%2Ecountry%2Ename': 'UK' } } })
	assert.equal(filter.search['city.country.name'], 'UK')
	const sort = new Sort(restored)
	sort.getParams({ data: { sort: 'city' } }, Invoice)
	assert.deepEqual(sort.sortOption().properties.map(String).slice(0, 3), ['city.name', 'city.country.name', 'city'])
	filter.getParams({ data: { reset: 'reset' } })
	assert.equal(filter.search['city.country.name'], '')
})

test('visible row projection intersects mandatory scope and preserves full JSON entities', async () => {
	const calls = []
	storage.dataSource = () => ({
		select: async (type, columns, search, options) => {
			calls.push({ columns, options, search, type })
			return { columns: [{ kind: 'scalar', path: 'number' }], rootType: type,
				rows: [{ cells: [{ kind: 'value', value: 'INV-1' }], rootId: 1 }] }
		},
		search: async () => [{ id: 1, active: true, number: 'INV-1', city: { id: 2 } }],
		count: async () => assert.fail('Column requests must not count')
	})
	const list = new List()
	list.jsonResponse = (body, status = 200) => ({ body, status })
	const session = {}
	const response = await list.html(request({ column: 'number', columns: 'number', rowIds: '1,2' }, session), { active: true })
	assert.deepEqual(session.list[require('@itrocks/route').routeOf(Invoice)].columns, ['number'])
	assert.equal(response.status, 200)
	assert.deepEqual(response.body.rows, [{ html: 'INV-1', id: 1 }])
	assert.deepEqual(calls[0].columns, ['number'])
	assert.deepEqual({ ...calls[0].search }, { active: true })
	assert.ok(calls[0].options[0] instanceof storage.Identifiers)
	assert.deepEqual(calls[0].options[0].ids, ['1', '2'])
	assert.deepEqual((await list.json(request())).body, [{ id: 1, active: true, number: 'INV-1', city: { id: 2 } }])
	const refused = await new List().html(request({ column: 'cities.name', rowIds: '1' }))
	assert.equal(refused.statusCode, 400)
	assert.match(refused.body, /multiple values/)
	assert.equal(calls.length, 1)
})

test('access denial is checked before projection and object-field authorisation is explicit', async () => {
	storage.dataSource = () => ({ select: () => assert.fail('Denied data cannot be queried') })
	listDependsOn({ access: async () => ({ authorise: async () => { throw new Error('forbidden') } }) })
	await assert.rejects(new List().html(request()), /forbidden/)
	const authorised = []
	listDependsOn({ access: async () => ({ authorise: async path => { authorised.push(path) } }) })
	const list = new List()
	await list.html(request({ columns: 'city' }))
	assert.deepEqual(authorised, ['city', 'city.name', 'city.country.name'])
	listDependsOn({ access: async () => ({ authorise: async () => {} }) })
})

test('default route resolves List after adding public dependency hooks', () => {
	assert.equal(require('@itrocks/route').resolveDestination('@itrocks/list'), require('@itrocks/list').List)
})

test('undeclared object transformers fail before querying; declared fields are accepted', async () => {
	let queries = 0
	storage.dataSource = () => ({ select: () => { queries ++; assert.fail('No undeclared projection') } })
	const custom = value => value.postcode
	setPropertyTransformer(Invoice, 'city', HTML, OUTPUT, custom)
	const response = await new List().html(request({ column: 'city', rowIds: '1' }))
	assert.equal(response.statusCode, 400)
	assert.match(response.body, /Undeclared custom object representation/)
	assert.equal(queries, 0)
	listRepresentationDependsOn({ fields: type => type === City ? ['postcode'] : representativeOf(type).map(String) })
	assert.deepEqual(new ListColumn(Invoice, 'city').fields, ['postcode'])
	listRepresentationDependsOn({ fields: undefined })
	setPropertyTransformer(Invoice, 'city', HTML, OUTPUT, storeOutput)
	setPropertyTransformer(City, 'country', HTML, OUTPUT, custom)
	assert.throws(() => new ListColumn(Invoice, 'city'), /Undeclared custom object representation/)
	setPropertyTransformer(City, 'country', HTML, OUTPUT, storeOutput)
	setPropertyTypeTransformer(City, HTML, OUTPUT, custom)
	assert.throws(() => new ListColumn(Invoice, 'cityOther'), /Undeclared custom object representation/)
	setPropertyTypeTransformer(City, HTML, OUTPUT, storeOutput)
})

test('external admission validates representation and authorisation without loading rows', async () => {
	storage.dataSource = () => ({
		select: () => assert.fail('Admission must not query values'),
		count: () => assert.fail('Admission must not count')
	})
	const authorised = []
	listDependsOn({ access: async () => ({ authorise: async path => { authorised.push(path) } }) })
	try {
		const list = new List()
		list.jsonResponse = (body, status = 200) => ({ body, status })
		const response = await list.html(request({ column: 'city', validate: '1' }))
		assert.equal(response.status, 200)
		assert.equal(response.body.path, 'city')
		assert.equal(response.body.rows, undefined)
		assert.ok(['city', 'city.name', 'city.country.name'].every(path => authorised.includes(path)))
		const refused = await list.html(request({ column: 'cities.name', validate: '1' }))
		assert.equal(refused.status, 400)
		assert.match(refused.body.error, /multiple values/)
	}
	finally { listDependsOn({ access: async () => ({ authorise: async () => {} }) }) }
})
