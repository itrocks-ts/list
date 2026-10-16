import { Action }                   from '@itrocks/action'
import { Request }                  from '@itrocks/action-request'
import type { SelectorState }       from '@itrocks/property-select'
import { StateConflictError }       from '@itrocks/property-select'
import type { StateRecord }         from '@itrocks/property-select'
import { validateSelectorState }    from '@itrocks/property-select'
import { Request as ServerRequest } from '@itrocks/request-response'
import { randomUUID }               from 'node:crypto'
import { listAccess }               from './access'

export type SessionTransaction = <T>(
	session: object, operation: (data: Record<string, any>) => T | Promise<T>
) => Promise<T>

let transaction: SessionTransaction = async () => { throw new Error('Session transactions are not configured') }

export function listStateDependsOn(dependencies: { transaction: SessionTransaction }): void
{
	transaction = dependencies.transaction
}

/** Keep all router-resolved identity segments; format and query are presentation parameters. */
export function selectorStateKey(request: Request): string
{
	return request.route + (request.ids.length ? '/' + request.ids.join(',') : '') + '/' + request.action
}

export function selectorStateBootstrap(request: Request): Promise<{ generation: string; record: StateRecord }>
{
	return transaction(request.request.session, data => {
		data.propertySelectGeneration ??= randomUUID()
		return {
			generation: data.propertySelectGeneration,
			record: structuredClone(data.propertySelect?.[selectorStateKey(request)] ?? { revision: 0 })
		}
	})
}

export class SessionStateStore
{

	constructor(private readonly session: object, private readonly run: SessionTransaction = transaction)
	{
	}

	read(key: string): Promise<StateRecord>
	{
		return this.run(this.session, data => structuredClone(data.propertySelect?.[key] ?? { revision: 0 }))
	}

	remove(key: string, expectedRevision: number): Promise<StateRecord>
	{
		return this.change(key, undefined, expectedRevision)
	}

	write(key: string, state: SelectorState, expectedRevision: number): Promise<StateRecord>
	{
		const validated = validateSelectorState(state)
		if (!validated) throw new TypeError('Invalid selector state')
		return this.change(key, validated, expectedRevision)
	}

	private change(key: string, state: SelectorState | undefined, expectedRevision: number): Promise<StateRecord>
	{
		if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError('Invalid revision')
		return this.run(this.session, data => {
			const current: StateRecord = data.propertySelect?.[key] ?? { revision: 0 }
			if (current.revision !== expectedRevision) throw new StateConflictError()
			const record: StateRecord = state ? { revision: current.revision + 1, state }
				: { revision: current.revision + 1 }
			data.propertySelect ??= {}
			Object.defineProperty(data.propertySelect, key, {
				configurable: true, enumerable: true, writable: true, value: structuredClone(record)
			})
			return structuredClone(record)
		})
	}

}

export class SelectorStateAction extends Action
{

	async json(request: Request)
	{
		const headers = { 'Cache-Control': 'no-store' }
		try {
			const input = request.data as Record<string, any>
			if (typeof input.key !== 'string' || !input.key.startsWith('/') || input.key.startsWith('//')
				|| input.key.length > 2048) throw new TypeError('Invalid selector route')
			const origin = request.request
			const path = input.key.split('?')[0].split('#')[0]
			const target = new Request(new ServerRequest('GET', origin.scheme, origin.host, origin.port,
				path, {}, {}, {}, origin.session))
			if (target.action !== 'list') throw new TypeError('Selector state requires a list route')
			const access = await listAccess(target)
			if (!access.root) return this.jsonResponse({ error: 'forbidden' }, 403, headers)
			const key = selectorStateKey(target)
			let generation = ''
			const store = new SessionStateStore(origin.session, (session, operation) => transaction(session, data => {
				data.propertySelectGeneration ??= randomUUID()
				generation = data.propertySelectGeneration
				if (origin.method !== 'GET' && origin.headers['x-property-select-session'] !== generation)
					throw Object.assign(new Error('The selector session has ended'), { code: 'SESSION_STALE' })
				return operation(data)
			}))
			const respond = (record: StateRecord) => this.jsonResponse(record, 200, {
				...headers, 'X-Property-Select-Session': generation
			})
			if (origin.method === 'GET') return respond(await store.read(key))
			if (origin.method === 'DELETE')
				return respond(await store.remove(key, Number(input.revision)))
			if (origin.method !== 'PUT') throw new TypeError('Invalid state operation')
			const state = validateSelectorState(input.state)
			if (!state) throw new TypeError('Invalid selector state')
			return respond(await store.write(key, state, Number(input.revision)))
		}
		catch (error) {
			if (error instanceof StateConflictError) return this.jsonResponse({ error: error.code }, 409, headers)
			if ((error as { code?: string }).code === 'SESSION_STALE')
				return this.jsonResponse({ error: 'SESSION_STALE' }, 410, headers)
			if (error instanceof TypeError) return this.jsonResponse({ error: error.message }, 400, headers)
			throw error
		}
	}

}
