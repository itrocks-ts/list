import { Request }                  from '@itrocks/action-request'
import { Type }                     from '@itrocks/class-type'
import { Request as ServerRequest } from '@itrocks/request-response'
import { Response }                 from '@itrocks/request-response'
import { routeOf }                  from '@itrocks/route'

export type ListQueryState = { fields: Record<string, string>; syntax?: 'logical'; text: string }

export type ListState = {
	columns?:   string[]
	filter?:    Record<string, string>
	listQuery?: ListQueryState
	sort?:      [string, boolean][]
}

export type ListSessionDependencies = {
	changed: (request: ServerRequest, type: Type) => void
	prepare: (request: Request) => Promise<Response | void>
}

const dependencies: ListSessionDependencies = {
	changed: () => {},
	prepare: async () => {}
}

export function listSessionDependsOn(overrides: Partial<ListSessionDependencies>): void
{
	Object.assign(dependencies, overrides)
}

export function listState(request: ServerRequest, type: Type): ListState
{
	const state = request.session.list?.[routeOf(type)] ?? {}
	return structuredClone({
		columns: state.columns,
		filter:  state.filter,
		...(state.listQuery ? { listQuery: state.listQuery } : {}),
		sort:    state.sort
	})
}

export function replaceListState(request: ServerRequest, type: Type, state?: ListState): void
{
	request.session.list ??= {}
	// Replacing the complete entry also removes filters belonging to hidden columns.
	request.session.list[routeOf(type)] = structuredClone(state ?? {})
}

export function prepareListSession(request: Request): Promise<Response | void>
{
	return dependencies.prepare(request)
}

export function listSessionChanged(request: ServerRequest, type: Type): void
{
	dependencies.changed(request, type)
}

export function comparableListState(state: ListState): string
{
	return JSON.stringify({
		columns: state.columns,
		filter:  Object.entries(state.filter ?? {})
			.filter(([, value]) => value !== '')
			.sort(([left], [right]) => left.localeCompare(right)),
		listQuery: state.listQuery || undefined,
		sort: state.sort
	})
}
