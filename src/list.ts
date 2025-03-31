import { Action }      from '@itrocks/action'
import { ActionEntry } from '@itrocks/action'
import { getActions }  from '@itrocks/action'
import { Request }     from '@itrocks/action-request'
import { Need }        from '@itrocks/action'
import { Route }       from '@itrocks/route'
import { routeOf }     from '@itrocks/route'
import { dataSource }  from '@itrocks/storage'

@Need('Store', 'new')
@Route('/list')
export class List<T extends object = object> extends Action<T>
{

	async html(request: Request<T>)
	{
		const type    = request.type
		const objects = await dataSource().search(type)

		const generalActions:   ActionEntry[] = []
		const selectionActions: ActionEntry[] = []
		const route = routeOf(this)
		for (const action of getActions(type, route.slice(route.lastIndexOf('/') + 1))) {
			const actions = (action.need === 'object') ? selectionActions : generalActions
			actions.push(action)
		}

		return this.htmlTemplateResponse(
			{ generalActions, objects, selectionActions, type },
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
