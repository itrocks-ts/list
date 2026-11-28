import { Request }                  from '@itrocks/action-request'
import type { Type }                from '@itrocks/class-type'
import type { StateRecord }         from '@itrocks/property-select'
import type { ResolvedPropertyPath } from '@itrocks/reflect-path'
import type { Response }            from '@itrocks/request-response'
import type { ProjectionCell }      from '@itrocks/storage'
import type { Sort }                from '@itrocks/storage'
import type { ListColumn }          from './projection'
import type { ListSearch }          from './search'

export type ListAccess = {
	authorise(path: string): Promise<void>
	bootstrap?(paths: string[], state: StateRecord): Promise<object>
	root?: string
}
export type ListColumnOutput = (
	column: ListColumn, cell: ProjectionCell, property: ListColumn['property']
) => string | undefined | Promise<string | undefined>

export type ListColumnsView = {
	objectFields?:  (column: ListColumn) => readonly string[] | undefined
	output?:        ListColumnOutput
	searchOnOwner?: (property: ResolvedPropertyPath) => boolean
	sort?:          Sort
	view?:          ListView
}

export type ListDependencies = {
	access: (request: Request) => Promise<ListAccess>
	columnsView?: (type: Type, primarySort?: Readonly<[string, boolean]>) => ListColumnsView | undefined
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

export function listColumnsView(type: Type, primarySort?: Readonly<[string, boolean]>): ListColumnsView | undefined
{
	return dependencies.columnsView?.(type, primarySort)
}
