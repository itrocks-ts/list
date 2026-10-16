import { Request } from '@itrocks/action-request'

export type ListAccess = {
	authorise(path: string): Promise<void>
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
