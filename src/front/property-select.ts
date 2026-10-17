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
	request?(query: URLSearchParams, signal: AbortSignal): Promise<Response>
	saveColumns(paths?: readonly string[]): Promise<void>
	templateUrl?: string
}
type ColumnResponse = { label: string; path: string; sortable: boolean;
	rows: { html: string; id: string | number }[] }

export class ListPropertySelect implements ConsumerPort
{

	private readonly abort = new AbortController()
	private readonly button: HTMLButtonElement
	private readonly content = document.createElement('div')
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
	private readonly removals = new Map<string, AbortController>()
	private removedColumns = new Map<string, { left?: string; right?: string }>()
	private readonly unsubscribePane: () => void
	readonly view: PropertySelectView

	constructor(private readonly article: HTMLElement, private readonly options: ListSelectorOptions)
	{
		const content = this.content
		this.button = article.querySelector<HTMLButtonElement>('.add-column')!
		const initial = article.dataset.selectorBootstrap
			? JSON.parse(decodeURIComponent(article.dataset.selectorBootstrap)) as {
				generation: string; record: StateRecord; template: string; translations?: Record<string, string>
			} : undefined
		const translate = (text: string) => initial?.translations?.[text] ?? text
		this.pane = options.mountSelector(content, translate('Add columns'))
		this.unsubscribePane = this.pane.subscribe(state => {
			if (!state.open || !state.present) this.removedColumns = new Map()
		})
		this.view = new PropertySelectView(content, {
			consumer: this, metadata: options.metadata, root: article.dataset.propertyRoot!,
			advice: options.advice, stateKey: article.dataset.selectorKey!, stateMode: 'session',
			stateStore: new HttpStateStore(undefined, undefined, initial && {
				...initial, key: article.dataset.selectorKey!
			}), translate, usedPaths: this.paths()
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
		const query = new URLSearchParams({ column: path, columns: this.paths().join(','), rowIds: ids.join(',') })
		const combined = AbortSignal.any([signal, this.abort.signal])
		const response = this.options.request
			? await this.options.request(query, combined)
			: await fetch(`${form.action}?${query}`, { signal: combined })
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
		const previous = [...table.tHead!.rows[0].cells].find(header => header.dataset.property === path)
		const previousInput = previous?.querySelector<HTMLInputElement>('input[data-property-filter]')
		input.value = previousInput?.value ?? ''
		if (previousInput && document.activeElement === previousInput) requestAnimationFrame(() => {
			if (!input.isConnected || document.activeElement !== document.body) return
			input.focus()
			input.setSelectionRange(previousInput.selectionStart, previousInput.selectionEnd)
		})
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
			signal.throwIfAborted()
			if (this.disposed) throw new Error('List disposed')
			const position = this.removedColumns.get(path)
			if (position) {
				const headers = [...this.article.querySelectorAll<HTMLTableCellElement>(
					'thead [data-property]:not(.column-add-provisional)'
				)]
				const left = headers.find(header => header.dataset.property === position.left)
				const right = headers.find(header => header.dataset.property === position.right)
				const anchor = left ?? right
				if (anchor) {
					let index = anchor.cellIndex + (left ? 1 : 0)
					if (operation.header.cellIndex < index) index --
					operation.moveTo(index)
				}
			}
			const outcome = operation.commit()
			this.removedColumns.delete(path)
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
			const source = this.columnSource(path, dropped)
			const operation = this.options.addition.beginExternal(source, sample)
			this.drag = { drop, intent, operation, paths, restore: () => suspension.restore() }
		}
		catch (error) {
			suspension.restore()
			throw error
		}
	}

	private columnSource(path: string, ready = Promise.resolve()): ColumnSource
	{
		const selector = this.view.selector
		const row = this.content.querySelector<HTMLElement>(`.ps-property[data-path="${CSS.escape(path)}"]`)
		const result = selector.search.results.find(result => result.property.path === path)
		const properties = selector.branchContexts.flatMap(context => context.properties)
		const label = row?.title || selector.usedProperties.find(property => property.path === path)?.label
			|| path.split('.').map((name, index, names) => {
				const prefix = names.slice(0, index + 1).join('.')
				return properties.find(property => property.path === prefix)?.label
					|| result?.segments.find(segment => segment.path === prefix)?.label
					|| (prefix === path ? result?.property.label || row?.querySelector('.ps-main')?.textContent : '') || name
			}).join('.')
		return {
			id: path,
			create: () => {
				const header = document.createElement('th')
				header.dataset.property = path
				header.dataset.sortable = 'false'
				header.textContent = label
				const input = document.createElement('input')
				input.name = `search.${encodeURIComponent(path).replaceAll('.', '%2E')}`
				input.dataset.propertyFilter = path
				input.setAttribute('aria-label', `Filter ${label}`)
				header.append(input)
				const cells = [...this.article.querySelectorAll('table.objects tbody tr')]
					.map(() => {
						const cell = document.createElement('td')
						cell.textContent = '\u00a0'
						return cell
					})
				return { cells, header }
			},
			load: async signal => {
				await ready
				signal.throwIfAborted()
				return this.loadColumn(path, signal)
			}
		}
	}

	cancel(id: string): void
	{
		if (this.drag?.intent.id !== id) return
		const drag = this.drag
		drag.operation.cancel()
		drag.drop()
		this.drag = undefined
		drag.restore()
		this.view.selector.setConfiguration({ usedPaths: this.paths() })
	}

	dispose(): void
	{
		if (this.disposed) return
		if (this.drag) this.cancel(this.drag.intent.id)
		this.disposed = true
		this.abort.abort()
		this.observer.disconnect()
		this.unsubscribePane()
		this.removedColumns.clear()
		this.view.dispose()
		this.pane.remove()
		this.options.addition.dispose()
		this.button.hidden = true
		this.pending.clear()
		for (const removal of this.removals.values()) removal.abort()
		this.removals.clear()
	}

	async end(id: string, sample: PointerSample): Promise<Outcome>
	{
		const drag = this.drag
		if (!drag || drag.intent.id !== id) throw new Error('Unknown column transport')
		try {
			const status = await drag.operation.finish(sample)
			if (status !== 'cancelled') {
				this.removedColumns.delete(drag.intent.path)
				if (status === 'moved') await this.options.saveColumns()
			}
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
			drag.drop()
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
			.filter(path => !this.removals.has(path) || this.removals.get(path)!.signal.aborted)
	}

	private async remove(path: string, signal: AbortSignal): Promise<'existing' | 'removed'>
	{
		const positions = this.removedColumns
		const paths = this.paths()
		const index = paths.indexOf(path)
		const position = { left: paths[index - 1], right: paths[index + 1] }
		const removal = new AbortController()
		this.removals.set(path, removal)
		// Publish the unchecked state before starting the table's removal flash.
		this.view.selector.setConfiguration({ usedPaths: this.paths() })
		try {
			const saving = this.options.saveColumns(this.paths())
			const animation = this.options.addition.remove(path, AbortSignal.any([signal, removal.signal]))
			const [removed] = await Promise.all([animation, saving])
			if (!removed) {
				if (removal.signal.aborted && !signal.aborted && !this.disposed) {
					await this.options.saveColumns(this.paths())
					return 'existing'
				}
				throw new Error('Column removal cancelled')
			}
			if (!this.disposed && positions === this.removedColumns && index >= 0) positions.set(path, position)
			return 'removed'
		}
		catch (error) {
			removal.abort()
			throw error
		}
		finally {
			if (this.removals.get(path) === removal) this.removals.delete(path)
			if (!this.disposed) this.view.selector.setConfiguration({ usedPaths: this.paths() })
		}
	}

	async select(intent: SelectionIntent, signal: AbortSignal): Promise<Outcome>
	{
		const path = normalisePath(intent.path)
		try {
			if (this.drag) throw new Error('A column transport is pending')
			let status: 'added' | 'existing' | 'removed'
			const pending = this.pending.get(path)
			if (pending) {
				const removal = this.removals.get(path)
				if (removal && !removal.signal.aborted) {
					removal.abort()
					this.view.selector.setConfiguration({ usedPaths: this.paths() })
				}
				else if (removal && intent.action !== 'add') {
					await pending
					return this.select(intent, signal)
				}
				const outcome = await pending
				if (removal && outcome === 'removed') return this.select({ ...intent, action: 'add' }, signal)
				status = 'existing'
			}
			else {
				const existing = this.paths().includes(path)
				const operation = existing && (intent.action !== 'add')
					? this.remove(path, signal)
					: existing
						? Promise.resolve('existing' as const)
						: this.add(path, signal)
				this.pending.set(path, operation)
				try { status = await operation }
				finally { if (this.pending.get(path) === operation) this.pending.delete(path) }
			}
			signal.throwIfAborted()
			if (this.disposed) throw new Error('List disposed')
			if (status !== 'removed' && this.paths().includes(path)) {
				this.options.addition.reveal(path)
				if (status === 'existing') this.options.addition.highlight(path)
			}
			return { ...intent, status }
		}
		catch (error) {
			return { ...intent, message: error instanceof Error ? error.message : 'Column unavailable', status: 'rejected' }
		}
	}

}
