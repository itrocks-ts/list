import { Action }                 from '@itrocks/action'
import { ActionEntry }            from '@itrocks/action'
import { getActions }             from '@itrocks/action'
import { Need }                   from '@itrocks/action'
import { Request }                from '@itrocks/action-request'
import { Route }                  from '@itrocks/route'
import { routeOf }                from '@itrocks/route'
import { dataSource }             from '@itrocks/storage'
import { Identifiers }            from '@itrocks/storage'
import { SearchType }             from '@itrocks/storage'
import { SelectionError }         from '@itrocks/storage'
import { ListView }               from './access'
import { listAccess }             from './access'
import { listColumnsView }        from './access'
import { listSelection }          from './access'
import { listView }               from './access'
import { ColumnWidths }           from './column-widths'
import { Columns }                from './columns'
import { projectColumnOutput }    from './columns'
import { Feed }                   from './feed'
import { Filter }                 from './filter'
import { filterAliases }          from './filter-summary'
import { filterSummary }          from './filter-summary'
import { load }                   from './persist'
import { save }                   from './persist'
import { ListColumn }             from './projection'
import { captureListSearch }      from './search'
import { listSearch }             from './search'
import { selectorStateBootstrap } from './selector-state'
import { selectorStateKey }       from './selector-state'
import { prepareListSession }     from './session-state'
import { Sort }                   from './sort'

export { listAccess, listDependsOn } from './access'
export type { ListAccess, ListColumnOutput, ListColumnsView, ListDependencies, ListView } from './access'

@Need('Store', 'new')
@Route('/list')
export class List<T extends object = object> extends Action<T>
{

	columns      = new Columns
	columnWidths = new ColumnWidths(this.columns)
	feed         = new Feed
	filter       = new Filter(this.columns)
	sort         = new Sort(this.columns)

	protected canResizeColumns(_request: Request<T>): boolean
	{
		return true
	}

	protected filterBar(request: Request<T>): ListView
	{
		return filterSummary(this.filter.search, filterAliases(request.type, this.columns))
	}

	async html(request: Request<T>, scope?: SearchType<T>)
	{
		const columns = this.columns
		const feed    = this.feed
		const filter  = this.filter
		const sort    = this.sort
		const type    = request.type

		const selection = listSelection()
		const updated   = await selection?.update(request)
		if (updated) return updated

		const prepared = await prepareListSession(request)
		if (prepared) return prepared
		this.columnWidths.unserialize(undefined)
		load(this, request.request, type)

		columns.getParams(request.request, type)
		const access = await listAccess(request)
		for (const column of columns) {
			await access.authorise(column.name)
			for (const field of column.fields ?? []) await access.authorise(`${column.name}.${field}`)
		}
		const canResize = this.canResizeColumns(request)
		const resizing  = ('resizeColumn' in request.request.data) || ('columnWidth' in request.request.data)
		if (resizing && (request.request.method !== 'POST')) return this.htmlResponse('', 405)
		if (resizing && !canResize) return this.htmlResponse('', 403)
		if (!this.columnWidths.getParams(request.request)) return this.htmlResponse('', 400)
		const batch = typeof request.request.data.loadColumns === 'string'
		if (resizing || (request.request.data.columns !== undefined && typeof request.request.data.column !== 'string'
			&& !batch)) {
			save(this, request.request, type)
			return this.htmlResponse('', 204)
		}

		feed.getParams(request.request)
		filter.getParams(request.request, type)
		for (const column of columns) column.search = filter.search[column.name] ?? ''
		sort.getParams(request.request, type)

		const columnsView  = listColumnsView(type, Object.entries(sort.sorted ?? {})[0])
		const activeSearch = await listSearch(request, filter, access, scope, columnsView?.searchOnOwner)
		if (captureListSearch(request, activeSearch)) {
			return this.htmlResponse('', 204)
		}
		if (!batch) {
			save(this, request.request, type)
		}

		const search = activeSearch.criteria
		for (const path of Object.keys(sort.sorted ?? {})) {
			await access.authorise(path)
		}
		if (batch) {
			try {
				const names = (request.request.data.loadColumns as string).split(',').filter(Boolean)
				if (new Set(names).size !== names.length) throw new Error('Duplicate column paths')
				const requested = names.map(path => new ListColumn(type, path))
				for (const column of requested) {
					if (!columns.serialize().includes(column.name)) throw new Error('Column absent from configuration')
					await access.authorise(column.name)
					for (const field of column.fields ?? []) await access.authorise(`${column.name}.${field}`)
				}
				const ids = request.request.data.rowIds
				if (typeof ids !== 'string') {
					throw new Error('Visible row identities are required')
				}
				const rows = requested.length
					? await projectColumnOutput(
						type, requested, search, [new Identifiers(ids ? ids.split(',') : [])], access, columnsView
					)
					: []
				const response = requested.map((column, index) => ({
					label:    column.label,
					path:     column.name,
					sortable: column.sortable,
					rows:     rows.map(row => ({ id: row.id, html: row.properties[index].outputOptionalContainer }))
				}))
				save(this, request.request, type)
				return this.jsonResponse({ columns: response })
			}
			catch (error) {
				return this.jsonResponse({ error: error instanceof Error ? error.message : 'Columns unavailable' }, 400)
			}
		}
		if (typeof request.request.data.column === 'string') {
			try {
				const path = request.request.data.column
				await access.authorise(path)
				const column = new ListColumn(type, path)
				for (const field of column.fields ?? []) await access.authorise(`${path}.${field}`)
				if (request.request.data.validate === '1') {
					return this.jsonResponse({ label: column.label, path, sortable: column.sortable })
				}
				const ids = request.request.data.rowIds
				if (typeof ids !== 'string') {
					throw new Error('Visible row identities are required')
				}
				const rows = await projectColumnOutput(
					type, [column], search, [new Identifiers(ids ? ids.split(',') : [])], access, columnsView
				)
				return this.jsonResponse({
					label:    column.label,
					path,
					sortable: column.sortable,
					rows:     rows.map(row => ({ id: row.id, html: row.properties[0].outputOptionalContainer }))
				})
			}
			catch (error) {
				const message = error instanceof SelectionError && error.code === 'multiple-values'
					? 'This path has multiple values and cannot be displayed as a column.'
					: error instanceof Error ? error.message : 'Column unavailable'
				return this.jsonResponse({ error: message }, 400)
			}
		}
		const sortOptions = columnsView?.sort ? [columnsView.sort] : sort.readOptions()
		const options     = feed.readOptions(filter.readOptions(sortOptions))
		const objects     = await projectColumnOutput(type, columns, search, options, access, columnsView)

		if (feed.offset) {
			return this.htmlTemplateResponse({ objects, type }, request, feed.template)
		}

		const count = await dataSource().count(type, search)
		const route = routeOf(this)

		const generalActions:   ActionEntry[] = []
		const selectionActions: ActionEntry[] = []
		for (const action of getActions(type, route.slice(route.lastIndexOf('/') + 1))) {
			const actions = (action.need === 'object') ? selectionActions : generalActions
			actions.push(action)
		}

		let selectorBootstrap: string | undefined
		if (access.bootstrap) {
			const state = await selectorStateBootstrap(request)
			const metadata = await access.bootstrap([...columns].map(column => column.name), state.record)
			selectorBootstrap = encodeURIComponent(JSON.stringify({ ...state, ...metadata }))
		}
		const focus       = request.request.method === 'POST' ? request.request.data.focusListColumn : undefined
		const focusColumn = [...columns].find(column => column.field === focus)?.field ?? ''
		return this.htmlTemplateResponse(
			{
				canResize, columns, columnsView: columnsView?.view, count, filterBar: this.filterBar(request), focusColumn,
				generalActions, objects,
				root: access.root, search: filter.search,
				selectionActions, selectorBootstrap, selectorKey: selectorStateKey(request), type,
				selection: selectionActions.length ? await selection?.view(request, activeSearch, count) : undefined,
				view: await listView(request)
			},
			request,
			__dirname + '/list.html'
		)
	}

	async json(request: Request<T>, scope?: SearchType<T>)
	{
		const objects = await dataSource().search(request.type, scope)
		return this.jsonResponse(objects)
	}

}

// Route resolution must select the action alongside its public dependency hooks.
export default List
