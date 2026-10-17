import { PropertySelectView }    from '@itrocks/property-select/front/property-select.js'
import type { ConsumerPort }     from '@itrocks/property-select/property-select.js'
import type { MetadataProvider } from '@itrocks/property-select/property-select.js'
import type { Outcome }          from '@itrocks/property-select/property-select.js'
import type { PointerSample }    from '@itrocks/property-select/property-select.js'
import type { SelectionIntent }  from '@itrocks/property-select/property-select.js'
import type { StateRecord }      from '@itrocks/property-select/property-select.js'
import { normalisePath }         from '@itrocks/property-select/property-select.js'
import type { ColumnContent }    from '@itrocks/table/column-add.js'
import type { ColumnOperation }  from '@itrocks/table/column-add.js'
import type { ColumnSource }     from '@itrocks/table/column-add.js'
import { TableColumnAdd }        from '@itrocks/table/column-add.js'
import { HttpStateStore }        from './selector-state.js'

export type PaneHandle = {
	close(): void
	open(): void
	remove(): void
	subscribe(listener: (state: { present: boolean; open: boolean; suspended: boolean }) => void): () => void
	suspend(options?: { mobileOnly?: boolean }): { restore(): void }
}
export type ListSelectorOptions = {
	advice?: readonly string[]
	addition: TableColumnAdd
	metadata: MetadataProvider
	mountSelector(content: HTMLElement, title: string): PaneHandle
	saveColumns(): Promise<void>
	templateUrl?: string
}
type ColumnResponse = { label: string; path: string; sortable: boolean;
	rows: { html: string; id: string | number }[] }

export class ListPropertySelect implements ConsumerPort
{

	private readonly abort = new AbortController()
	private readonly button: HTMLButtonElement
	private disposed = false
	private drag?: {
		drop(): void
		intent: SelectionIntent
		operation: ColumnOperation
		paths: string[]
		restore(): void
	}
	private readonly observer: MutationObserver
	private readonly pane: PaneHandle
	private readonly pending = new Map<string, Promise<'added' | 'existing' | 'removed'>>()
	readonly view: PropertySelectView

	constructor(private readonly article: HTMLElement, private readonly options: ListSelectorOptions)
	{
		const content = document.createElement('div')
		this.button = article.querySelector<HTMLButtonElement>('.add-column')!
		this.pane = options.mountSelector(content, 'Add columns')
		const initial = article.dataset.selectorBootstrap
			? JSON.parse(decodeURIComponent(article.dataset.selectorBootstrap)) as {
				generation: string; record: StateRecord; template: string
			} : undefined
		this.view = new PropertySelectView(content, {
			consumer: this, metadata: options.metadata, root: article.dataset.propertyRoot!,
			advice: options.advice, stateKey: article.dataset.selectorKey!, stateMode: 'session',
			stateStore: new HttpStateStore(undefined, undefined, initial && {
				...initial, key: article.dataset.selectorKey!
			}), usedPaths: this.paths()
		}, { template: initial?.template, templateUrl: options.templateUrl })
		this.observer = new MutationObserver(records => {
			if (this.drag && records.some(record => (record.target as Element).tagName === 'TBODY'))
				this.view.selector.cancel(this.drag.intent.id, 'row view changed')
			this.view.selector.setConfiguration({ usedPaths: this.paths() })
		})
		this.observer.observe(article.querySelector('thead')!, { childList: true, subtree: true })
		this.observer.observe(article.querySelector('tbody')!, { childList: true })
		this.button.addEventListener('click', () => this.pane.open(), { signal: this.abort.signal })
	}

	private async loadColumn(path: string, signal: AbortSignal): Promise<ColumnContent>
	{
		const form = this.article.querySelector<HTMLFormElement>('form')!
		const table = this.article.querySelector<HTMLTableElement>('table.objects')!
		const rows = [...table.tBodies[0].rows]
		const ids = rows.map(row => row.querySelector<HTMLInputElement>('input[name=id]')!.value)
		const query = new URLSearchParams({ column: path, rowIds: ids.join(',') })
		const response = await fetch(`${form.action}?${query}`, {
			signal: AbortSignal.any([signal, this.abort.signal])
		})
		const result = await response.json() as ColumnResponse & { error?: string }
		if (!response.ok) throw new Error(result.error ?? 'Column unavailable')
		signal.throwIfAborted()
		if (this.disposed || !this.article.isConnected || rows.some((row, index) => table.tBodies[0].rows[index] !== row)
			|| rows.length !== table.tBodies[0].rows.length) throw new Error('The row view changed; try again')
		if (result.path !== path) throw new Error('Mismatched column response')
		const values = new Map(result.rows.map(row => [String(row.id), row.html]))
		if (ids.some(id => !values.has(id))) throw new Error('The row scope changed; reload the list')
		const header = document.createElement('th')
		header.dataset.property = path
		header.dataset.sortable = String(result.sortable)
		const input = document.createElement('input')
		input.name = `search.${encodeURIComponent(path).replaceAll('.', '%2E')}`
		input.dataset.propertyFilter = path
		input.setAttribute('aria-label', `Filter ${result.label}`)
		header.append(result.label, input)
		const cells = ids.map(id => {
			const cell = document.createElement('td')
			cell.innerHTML = values.get(id)!
			return cell
		})
		return { cells, header }
	}

	private async add(path: string, signal: AbortSignal): Promise<'added' | 'existing'>
	{
		const source = this.columnSource(path)
		const operation = this.options.addition.begin(source)
		try {
			await this.validateColumn(path, signal)
			signal.throwIfAborted()
			if (this.disposed) throw new Error('List disposed')
			const outcome = operation.commit()
			await this.options.saveColumns()
			this.view.selector.setConfiguration({ usedPaths: this.paths() })
			return outcome
		}
		catch (error) {
			operation.cancel()
			throw error
		}
	}

	begin(intent: SelectionIntent, sample: PointerSample): void
	{
		if (this.disposed || this.drag || this.pending.size) throw new Error('A column operation is pending')
		const path = normalisePath(intent.path)
		const paths = this.paths()
		const suspension = this.pane.suspend({ mobileOnly: true })
		try {
			let drop!: () => void
			const dropped = new Promise<void>(resolve => { drop = resolve })
			const source = this.columnSource(path)
			// Existing columns already have their metadata and cells. Only new drops need admission.
			if (!paths.includes(path)) source.accept = async signal => {
				await dropped
				signal.throwIfAborted()
				await this.validateColumn(path, signal)
			}
			const operation = this.options.addition.beginExternal(source, sample)
			this.drag = { drop, intent, operation, paths, restore: () => suspension.restore() }
		}
		catch (error) {
			suspension.restore()
			throw error
		}
	}

	private columnSource(path: string): ColumnSource
	{
		const result = this.view.selector.search.results.find(result => result.property.path === path)
		const property = result?.property || this.view.selector.context?.properties.find(property => property.path === path)
		const label = result ? [...result.segments.map(segment => segment.label), result.property.label].join('.')
			: property?.label || path
		return {
			id: path,
			create: () => {
				const header = document.createElement('th')
				header.dataset.property = path
				header.dataset.sortable = 'false'
				header.textContent = label
				const cells = [...this.article.querySelectorAll('table.objects tbody tr')]
					.map(() => document.createElement('td'))
				return { cells, header }
			},
			load: async signal => {
				signal.throwIfAborted()
				try { return await this.loadColumn(path, signal) }
				catch (error) {
					if (!this.disposed && !signal.aborted) this.previewError(path)
					throw error
				}
			}
		}
	}

	private async validateColumn(path: string, signal: AbortSignal): Promise<void>
	{
		const form = this.article.querySelector<HTMLFormElement>('form')!
		const query = new URLSearchParams({ column: path, validate: '1' })
		const response = await fetch(`${form.action}?${query}`, {
			signal: AbortSignal.any([signal, this.abort.signal])
		})
		const result = await response.json() as { path?: string; error?: string }
		if (!response.ok || result.path !== path) throw new Error(result.error ?? 'Column unavailable')
	}

	cancel(id: string): void
	{
		if (this.drag?.intent.id !== id) return
		const drag = this.drag
		drag.operation.cancel()
		this.drag = undefined
		drag.restore()
		this.view.selector.setConfiguration({ usedPaths: this.paths() })
	}

	private previewError(path: string): void
	{
		const header = [...this.article.querySelectorAll<HTMLTableCellElement>('thead [data-property]')]
			.find(header => header.dataset.property === path)
		if (!header) return
		for (const row of this.article.querySelectorAll<HTMLTableRowElement>('tbody tr'))
			row.cells[header.cellIndex].textContent = 'Unable to load values'
		if (header.querySelector('.column-retry')) return
		const retry = document.createElement('button')
		retry.type = 'button'
		retry.className = 'column-retry'
		retry.textContent = 'Retry values'
		retry.addEventListener('click', event => {
			event.stopPropagation()
			void this.options.addition.retry(path)
		}, { signal: this.abort.signal })
		header.append(retry)
	}

	dispose(): void
	{
		if (this.disposed) return
		if (this.drag) this.cancel(this.drag.intent.id)
		this.disposed = true
		this.abort.abort()
		this.observer.disconnect()
		this.view.dispose()
		this.pane.remove()
		this.options.addition.dispose()
		this.button.hidden = true
		this.pending.clear()
	}

	async end(id: string, sample: PointerSample): Promise<Outcome>
	{
		const drag = this.drag
		if (!drag || drag.intent.id !== id) throw new Error('Unknown column transport')
		try {
			const finished = drag.operation.finish(sample)
			drag.drop()
			const status = await finished
			if (status !== 'cancelled') await this.options.saveColumns()
			if (this.disposed) return { ...drag.intent, status: 'cancelled' }
			if (this.drag === drag) this.drag = undefined
			this.view.selector.setConfiguration({ usedPaths: this.paths() })
			return { ...drag.intent, status }
		}
		catch (error) {
			drag.operation.cancel()
			return { ...drag.intent, status: 'rejected', message: String(error) }
		}
		finally {
			if (this.drag === drag) this.drag = undefined
			drag.restore()
		}
	}

	async mount(): Promise<boolean>
	{
		const mounted = await this.view.mount()
		if (mounted && !this.disposed) this.button.hidden = false
		return mounted
	}
	move(id: string, sample: PointerSample): void
	{
		if (this.drag?.intent.id === id) this.drag.operation.move(sample)
	}

	paths(): string[]
	{
		if (this.drag) return [...this.drag.paths]
		return [...this.article.querySelectorAll<HTMLElement>('thead [data-property]:not(.column-add-provisional)')]
			.map(header => header.dataset.property!)
	}

	private async remove(path: string, signal: AbortSignal): Promise<'removed'>
	{
		if (!await this.options.addition.remove(path, signal)) throw new Error('Column removal cancelled')
		await this.options.saveColumns()
		this.view.selector.setConfiguration({ usedPaths: this.paths() })
		return 'removed'
	}

	async select(intent: SelectionIntent, signal: AbortSignal): Promise<Outcome>
	{
		const path = normalisePath(intent.path)
		try {
			if (this.drag) throw new Error('A column transport is pending')
			let status: 'added' | 'existing' | 'removed'
			const pending = this.pending.get(path)
			if (pending) {
				await pending
				status = 'existing'
			}
			else {
				const selector = this.view.selector
				const property = selector.context?.properties.find(property => property.path === path)
					|| selector.search.results.find(result => result.property.path === path)?.property
					|| selector.usedProperties.find(property => property.path === path)
				const existing = this.paths().includes(path)
				const operation = existing && property?.kind === 'terminal'
					? this.remove(path, signal) : existing ? Promise.resolve('existing' as const) : this.add(path, signal)
				this.pending.set(path, operation)
				try { status = await operation }
				finally { if (this.pending.get(path) === operation) this.pending.delete(path) }
			}
			signal.throwIfAborted()
			if (this.disposed) throw new Error('List disposed')
			if (status !== 'removed' && this.paths().includes(path)) {
				this.options.addition.reveal(path)
				this.options.addition.highlight(path)
			}
			return { ...intent, status }
		}
		catch (error) {
			return { ...intent, message: error instanceof Error ? error.message : 'Column unavailable', status: 'rejected' }
		}
	}

}
