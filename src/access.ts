import { Request }          from '@itrocks/action-request'
import type { StateRecord } from '@itrocks/property-select'
import type { Response }    from '@itrocks/request-response'
import type { ListSearch }  from './search'

export type ListAccess = {
	authorise(path: string): Promise<void>
	bootstrap?(paths: string[], state: StateRecord): Promise<object>
	root?: string
}
export type ListDependencies = {
	access: (request: Request) => Promise<ListAccess>
	view:   (request: Request) => Promise<ListView | undefined>
	selection?: {
		update: (request: Request) => Promise<Response | undefined>
		view:   (request: Request, search: ListSearch, count: number) =>
			Promise<ListView & { footer?: ListView; footerSummary?: ListView }>
	}
}
export type ListView = { template: string; [name: string]: unknown }

const dependencies: ListDependencies = {
	access: async () => ({ authorise: async () => {} }),
	view:   async () => undefined
}

export function listAccess(request: Request): Promise<ListAccess>
{
	return dependencies.access(request)
}

export function listDependsOn(overrides: Partial<ListDependencies>): void
{
	Object.assign(dependencies, overrides)
}

export function listView(request: Request): Promise<ListView | undefined>
{
	return dependencies.view(request)
}

export function listSelection()
{
	return dependencies.selection
}
