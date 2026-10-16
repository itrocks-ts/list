import type { SelectorState } from '@itrocks/property-select/property-select.js'
import { StateConflictError } from '@itrocks/property-select/property-select.js'
import type { StateRecord }   from '@itrocks/property-select/property-select.js'
import type { StateStore }    from '@itrocks/property-select/property-select.js'

/** The key is supplied by the host router; this transport does not derive it from location. */
export class HttpStateStore implements StateStore
{

	private generation?: string

	constructor(
		private readonly endpoint = '/property-select/state/json',
		private readonly fetcher = globalThis.fetch.bind(globalThis)
	)
	{
	}

	read(key: string, signal?: AbortSignal): Promise<StateRecord>
	{
		return this.request('GET', key, undefined, undefined, signal)
	}

	remove(key: string, revision: number): Promise<StateRecord>
	{
		return this.request('DELETE', key, undefined, revision)
	}

	write(key: string, state: SelectorState, revision: number): Promise<StateRecord>
	{
		return this.request('PUT', key, state, revision)
	}

	private async request(
		method: string, key: string, state?: SelectorState, revision?: number, signal?: AbortSignal
	): Promise<StateRecord>
	{
		const response = await this.fetcher(`${this.endpoint}?${new URLSearchParams({ key })}`, {
			body: method === 'GET' ? undefined : JSON.stringify({ revision, state }), cache: 'no-store',
			credentials: 'same-origin', method, signal,
			headers: { 'Content-Type': 'application/json', 'X-Property-Select-Session': this.generation ?? '' }
		})
		if (response.status === 410) throw new Error('The selector session has ended. Reload the page.')
		if (response.status === 409) throw new StateConflictError()
		if (!response.ok) throw new Error(`Unable to save selector state (${response.status}). Try again.`)
		const generation = response.headers.get('X-Property-Select-Session') ?? undefined
		if (this.generation && generation !== this.generation)
			throw new Error('The selector session has ended. Reload the page.')
		this.generation = generation
		return response.json()
	}

}
