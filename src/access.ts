import { Request }          from '@itrocks/action-request'
import type { StateRecord } from '@itrocks/property-select'

export type ListAccess = {
	authorise(path: string): Promise<void>
	bootstrap?(paths: string[], state: StateRecord): Promise<object>
	root?: string
}
export type ListDependencies = { access: (request: Request) => Promise<ListAccess> }

const dependencies: ListDependencies = { access: async () => ({ authorise: async () => {} }) }

export function listDependsOn(overrides: Partial<ListDependencies>): void
{
	Object.assign(dependencies, overrides)
}

export function listAccess(request: Request): Promise<ListAccess>
{
	return dependencies.access(request)
}
