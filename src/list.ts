import { Action }      from '@itrocks/action'
import { ActionEntry } from '@itrocks/action'
import { getActions }  from '@itrocks/action'
import { Need }        from '@itrocks/action'
import { Request }     from '@itrocks/action-request'
import { Route }       from '@itrocks/route'
import { routeOf }     from '@itrocks/route'
import { dataSource }  from '@itrocks/storage'
import { Columns }     from './columns'
import { Feed }        from './feed'
import { Filter }      from './filter'
import { load }        from './persist'
import { save }        from './persist'
import { Sort }        from './sort'

@Need('Store', 'new')
@Route('/list')
export class List<T extends object = object> extends Action<T>
{

	columns = new Columns
	feed    = new Feed
	filter  = new Filter
	sort    = new Sort(this.columns)

	async html(request: Request<T>)
	{
		const columns = this.columns
		const feed    = this.feed
		const filter  = this.filter
		const sort    = this.sort
		const type    = request.type

		load(this, request.request, type)

		columns.getParams(request.request, type)
		feed.getParams(request.request)
		filter.getParams(request.request)
		sort.getParams(request.request, type)

		save(this, request.request, type)

		const objects = await dataSource().search(
			type,
			filter.searchObject(type),
			feed.readOptions(filter.readOptions(sort.readOptions()))
		)

		if (feed.offset) {
			return this.htmlTemplateResponse({ objects, type }, request, feed.template)
		}

		const count = await dataSource().count(type)
		const route = routeOf(this)

		const generalActions:   ActionEntry[] = []
		const selectionActions: ActionEntry[] = []
		for (const action of getActions(type, route.slice(route.lastIndexOf('/') + 1))) {
			const actions = (action.need === 'object') ? selectionActions : generalActions
			actions.push(action)
		}

		return this.htmlTemplateResponse(
			{ columns, count, generalActions, objects, selectionActions, type },
			request,
			__dirname + '/list.html'
		)
	}

	async json(request: Request<T>)
	{
		const objects = await dataSource().search(request.type)
		return this.jsonResponse(objects)
	}

}
