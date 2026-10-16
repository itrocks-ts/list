import { Action }           from '@itrocks/action'
import { ActionEntry }      from '@itrocks/action'
import { getActions }       from '@itrocks/action'
import { Need }             from '@itrocks/action'
import { Request }          from '@itrocks/action-request'
import { Route }            from '@itrocks/route'
import { routeOf }          from '@itrocks/route'
import { dataSource }       from '@itrocks/storage'
import { Identifiers }      from '@itrocks/storage'
import { SearchType }       from '@itrocks/storage'
import { SelectionError }   from '@itrocks/storage'
import { listAccess }       from './access'
import { Columns }          from './columns'
import { Feed }             from './feed'
import { Filter }           from './filter'
import { load }             from './persist'
import { save }             from './persist'
import { ListColumn }       from './projection'
import { selectorStateKey } from './selector-state'
import { Sort }             from './sort'

export { listDependsOn } from './access'
export type { ListAccess, ListDependencies } from './access'

@Need('Store', 'new')
@Route('/list')
export class List<T extends object = object> extends Action<T>
{

	columns = new Columns
	feed    = new Feed
	filter  = new Filter(this.columns)
	sort    = new Sort(this.columns)

	async html(request: Request<T>, scope?: SearchType<T>)
	{
		const columns = this.columns
		const feed    = this.feed
		const filter  = this.filter
		const sort    = this.sort
		const type    = request.type

		load(this, request.request, type)

		columns.getParams(request.request, type)
		const access = await listAccess(request)
		for (const column of columns) {
			await access.authorise(column.name)
			for (const field of column.fields ?? []) await access.authorise(`${column.name}.${field}`)
		}
		if (request.request.data.columns !== undefined) {
			save(this, request.request, type)
			return this.htmlResponse('', 204)
		}

		feed.getParams(request.request)
		filter.getParams(request.request)
		for (const column of columns) column.search = filter.search[column.name] ?? ''
		sort.getParams(request.request, type)

		save(this, request.request, type)

		const options = feed.readOptions(filter.readOptions(sort.readOptions()))
		const search  = Object.assign(filter.searchObject(type), scope)
		for (const path of Object.keys(search)) await access.authorise(path)
		for (const path of Object.keys(sort.sorted ?? {})) await access.authorise(path)
		if (typeof request.request.data.column === 'string') {
			try {
				const path = request.request.data.column
				await access.authorise(path)
				const column = new ListColumn(type, path)
				for (const field of column.fields ?? []) await access.authorise(`${path}.${field}`)
				if (request.request.data.validate === '1') return this.jsonResponse({ label: column.label, path })
				const ids = request.request.data.rowIds
				if (typeof ids !== 'string') throw new Error('Visible row identities are required')
				const result = await dataSource().select(type, [column.selection()], search, [new Identifiers(
					ids ? ids.split(',') : []
				)])
				return this.jsonResponse({
					label: column.label, path,
					rows: await Promise.all(result.rows.map(async row => ({
						id: row.rootId, html: await column.output(row.cells[0])
					})))
				})
			}
			catch (error) {
				const message = error instanceof SelectionError && error.code === 'multiple-values'
					? 'This path has multiple values and cannot be displayed as a column.'
					: error instanceof Error ? error.message : 'Column unavailable'
				return this.jsonResponse({ error: message }, 400)
			}
		}
		const objects = await columns.projected(await dataSource().select(
			type, columns.map(column => column.selection()), search, options
		))

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

		return this.htmlTemplateResponse(
			{ columns, count, generalActions, objects, root: access.root, search: filter.search,
				selectionActions, selectorKey: selectorStateKey(request), type },
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
