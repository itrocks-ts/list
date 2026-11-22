import type { Request }    from '@itrocks/action-request'
import { AND }             from '@itrocks/sql-functions'
import { OR }              from '@itrocks/sql-functions'
import { conditionPaths }  from '@itrocks/sql-functions'
import type { SearchType } from '@itrocks/storage'
import type { ListAccess } from './access'
import type { Filter }     from './filter'

export type ListSearch = { criteria: SearchType; filters: Record<string, string> }

// Run the real list action so application scopes and path authorisation also apply to bulk actions.
const lookups = new WeakMap<Request, { search?: ListSearch }>()

export async function resolveListSearch(
	request: Request, run: (request: Request) => Promise<unknown>
): Promise<ListSearch | undefined>
{
	const lookup: { search?: ListSearch } = {}
	lookups.set(request, lookup)
	try {
		await run(request)
		return lookup.search
	}
	finally {
		lookups.delete(request)
	}
}

export function captureListSearch(request: Request, search: ListSearch): boolean
{
	const lookup = lookups.get(request)
	if (!lookup) return false
	lookup.search = search
	return true
}

export async function listSearch<T extends object>(
	request: Request<T>, filter: Filter<T>, access: ListAccess, scope?: SearchType<T>
): Promise<{ criteria: SearchType<T>; filters: Record<string, string> }>
{
	const filters = filter.searchObject(request.type)
	// Scope values override direct user criteria; logical groups remain cumulative.
	for (const path of Object.keys(scope ?? {})) delete filters[path]
	const criteria = scope && ((scope[AND] !== undefined) || (scope[OR] !== undefined))
		? (Reflect.ownKeys(filters).length ? { [AND]: [filters, scope] } : scope)
		: Object.assign(filters, scope)
	for (const path of conditionPaths(criteria)) await access.authorise(path)
	return { criteria, filters: filter.search }
}
