import { PropertySelectView }      from '@itrocks/property-select/front/property-select.js'
import type { ConsumerPort }       from '@itrocks/property-select/property-select.js'
import type { MetadataProvider }   from '@itrocks/property-select/property-select.js'
import { normalisePath }           from '@itrocks/property-select/property-select.js'
import type { Outcome }            from '@itrocks/property-select/property-select.js'
import type { SelectionIntent }    from '@itrocks/property-select/property-select.js'
import { TableColumnAdd }          from '@itrocks/table/column-add.js'

export type PaneHandle = {
	close(): void
	open(): void
	remove(): void
	subscribe(listener: (state: { present: boolean; open: boolean; suspended: boolean }) => void): () => void
	suspend(): { restore(): void }
}
export type ListSelectorOptions = {
	addition: TableColumnAdd
	metadata: MetadataProvider
	mountSelector(content: HTMLElement, title: string): PaneHandle
	saveColumns(): Promise<void>
	templateUrl?: string
}
type ColumnResponse = { label: string; path: string; rows: { html: string; id: string | number }[] }

export class ListPropertySelect implements ConsumerPort
{

	private readonly abort = new AbortController()
	private readonly button: HTMLButtonElement
	private disposed = false
	private readonly observer: MutationObserver
	private readonly pane: PaneHandle
	private readonly pending = new Map<string, Promise<'added' | 'existing'>>()
	readonly view: PropertySelectView

	constructor(private readonly article: HTMLElement, private readonly options: ListSelectorOptions)
	{
		const content = document.createElement('div')
		this.button = article.querySelector<HTMLButtonElement>('.add-column')!
		this.pane = options.mountSelector(content, 'Add columns')
		this.view = new PropertySelectView(content, {
			consumer: this, metadata: options.metadata, root: article.dataset.propertyRoot!,
			stateMode: 'instance', usedPaths: this.paths()
		}, { templateUrl: options.templateUrl })
		this.observer = new MutationObserver(() => this.view.selector.setConfiguration({ usedPaths: this.paths() }))
		this.observer.observe(article.querySelector('thead')!, { childList: true, subtree: true })
		this.button.addEventListener('click', () => this.pane.open(), { signal: this.abort.signal })
	}

	private async add(path: string, signal: AbortSignal): Promise<'added' | 'existing'>
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
		const label = document.createElement('span')
		label.className = 'label'
		label.textContent = result.label
		const input = document.createElement('input')
		input.name = `search.${encodeURIComponent(path).replaceAll('.', '%2E')}`
		input.dataset.propertyFilter = path
		input.setAttribute('aria-label', `Filter ${result.label}`)
		header.append(label, input)
		const cells = ids.map(id => {
			const cell = document.createElement('td')
			cell.innerHTML = values.get(id)!
			return cell
		})
		const outcome = await this.options.addition.add({ create: () => ({ cells, header }), id: path })
		await this.options.saveColumns()
		this.view.selector.setConfiguration({ usedPaths: this.paths() })
		return outcome
	}

	begin(): void
	{
		throw new Error('Column transport is not configured')
	}
	cancel(): void
	{
	}

	dispose(): void
	{
		if (this.disposed) return
		this.disposed = true
		this.abort.abort()
		this.observer.disconnect()
		this.view.dispose()
		this.pane.remove()
		this.options.addition.dispose()
		this.button.hidden = true
		this.pending.clear()
	}

	async end(): Promise<Outcome>
	{
		throw new Error('Column transport is not configured')
	}

	async mount(): Promise<boolean>
	{
		const mounted = await this.view.mount()
		if (mounted && !this.disposed) this.button.hidden = false
		return mounted
	}
	move(): void
	{
	}

	paths(): string[]
	{
		return [...this.article.querySelectorAll<HTMLElement>('thead [data-property]')]
			.map(header => header.dataset.property!)
	}

	async select(intent: SelectionIntent, signal: AbortSignal): Promise<Outcome>
	{
		const path = normalisePath(intent.path)
		try {
			let status: 'added' | 'existing'
			const pending = this.pending.get(path)
			if (pending) {
				await pending
				status = 'existing'
			}
			else if (this.paths().includes(path)) status = 'existing'
			else {
				const operation = this.add(path, signal)
				this.pending.set(path, operation)
				try { status = await operation }
				finally { if (this.pending.get(path) === operation) this.pending.delete(path) }
			}
			signal.throwIfAborted()
			if (this.disposed) throw new Error('List disposed')
			this.options.addition.reveal(path)
			this.options.addition.highlight(path)
			return { ...intent, status }
		}
		catch (error) {
			return { ...intent, message: error instanceof Error ? error.message : 'Column unavailable', status: 'rejected' }
		}
	}

}
