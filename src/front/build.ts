import { build }                        from '@itrocks/build/build.js'
import { TableColumnAdd }               from '@itrocks/table/column-add.js'
import { TableColumnReorderFreeze }     from '@itrocks/table/column-reorder-freeze.js'
import { TableColumnReorder }           from '@itrocks/table/column-reorder.js'
import type { ColumnWidth }             from '@itrocks/table/column-resize.js'
import { TableColumnResize }            from '@itrocks/table/column-resize.js'
import { TableFeed }                    from '@itrocks/table/feed.js'
import { TableFreeze }                  from '@itrocks/table/freeze.js'
import { TableFreezeInheritBackground } from '@itrocks/table/freeze/inherit-background.js'
import { TableFreezeInheritBorder }     from '@itrocks/table/freeze/inherit-border.js'
import { TableLink }                    from '@itrocks/table/link.js'
import { tableByElement }               from '@itrocks/table/table.js'
import { xTargetCall }                  from '@itrocks/xtarget/xtarget.js'
import './column-filter.js'
import './search-focus.js'
import './toolbar.js'

build<HTMLTableElement>(
	'article[data-action="list"] > form > table.objects',
	table => {
		const headers         = [...table.querySelectorAll<HTMLTableCellElement>('thead th[data-property]')]
		const persistedWidths = new Map<string, number>()
		const pendingWidths   = new Map<string, Promise<Response>>()
		let persistedColumns  = headers.map(header => header.dataset.property).join(',')
		for (const header of headers) {
			if (header.dataset.columnWidth) {
				persistedWidths.set(header.dataset.property!, Number(header.dataset.columnWidth))
			}
		}
		let saving = Promise.resolve()
		const request = (query: URLSearchParams, signal?: AbortSignal, method = 'GET'): Promise<Response> => {
			const form   = table.closest('form')!
			const result = saving.then(() => fetch(`${form.action}?${query}`, { keepalive: true, method, signal }))
			saving = result.then(() => {}, () => {})
			void result.then(response => {
				if (response.ok && query.has('columns') && (query.get('columns') !== persistedColumns)) {
					persistedColumns = query.get('columns')!
					const paths = new Set(persistedColumns.split(','))
					for (const path of persistedWidths.keys()) {
						if (!paths.has(path)) persistedWidths.delete(path)
					}
					table.dispatchEvent(new CustomEvent('itrocks:list-change', { bubbles: true }))
				}
			}, () => {})
			return result
		}
		const saveColumns = (paths?: readonly string[]): Promise<void> => {
			const columns = table.tHead?.rows[0].querySelectorAll<HTMLTableCellElement>(
				':scope > th[data-property]:not(.column-add-provisional)'
			)
			const form    = table.closest('form')
			if (!columns || !form) return Promise.resolve()
			const properties = paths ?? Array.from(columns, column => column.dataset.property ?? '')
			return request(new URLSearchParams({ columns: properties.join(',') })).then(response => {
				if (!response.ok) throw new Error('Unable to save columns')
			})
		}
		const saveWidth = (header: HTMLTableCellElement, width: ColumnWidth) => {
			const path   = header.dataset.property!
			const query  = new URLSearchParams({ resizeColumn: path, columnWidth: String(width) })
			const result = request(query, undefined, 'POST')
			pendingWidths.set(path, result)
			void result.then(response => {
				if (response.status !== 204) throw new Error('Unable to save column width')
				const previous = persistedWidths.get(path) ?? 'auto'
				if (width === 'auto') persistedWidths.delete(path)
				else persistedWidths.set(path, width)
				if (width !== previous) {
					table.dispatchEvent(new CustomEvent('itrocks:list-change', { bubbles: true }))
				}
			}).catch(error => {
				if (pendingWidths.get(path) === result) {
					resize.setWidth(header, persistedWidths.get(path) ?? 'auto')
				}
				console.error(error)
			}).finally(() => {
				if (pendingWidths.get(path) === result) pendingWidths.delete(path)
			})
		}
		const resize = new TableColumnResize({
			identify: header => header.dataset.property,
			isInResizeZone: (header, y) => {
				const filter = header.querySelector(':scope > input[data-property-filter]')
				if (!filter) return true
				const bottom     = filter.getBoundingClientRect().top
				const lineHeight = parseFloat(getComputedStyle(header).lineHeight)
				return (y < bottom) && (!Number.isFinite(lineHeight) || (y >= bottom - lineHeight))
			},
			isResizable: header => table.hasAttribute('data-column-resize') && (header.dataset.property !== undefined),
			onChange:    saveWidth
		})
		const tableColumnReorder = new TableColumnReorder({
			isReorderable: header => header.dataset.property !== undefined,
			onRemove:      () => saveColumns(),
			onReorder:     () => saveColumns()
		})
		const tableLink = new TableLink({
			call: url => xTargetCall(url, 'main'),
			id:   (element: Element) => {
				const input = element.closest('tr')?.querySelector<HTMLInputElement>(':scope > th.select > input[name=id]')
				if (input) return { element: input as Element, value: input.value }
			}
		})
		const addition = new TableColumnAdd({ identify: header => header.dataset.property })
		const instance = tableByElement(table, {
			plugins: [
				tableColumnReorder, resize, addition, TableColumnReorderFreeze, TableFeed, TableFreeze,
				TableFreezeInheritBackground, TableFreezeInheritBorder, tableLink
			]
		})
		table.dispatchEvent(new CustomEvent('itrocks:list-ready', {
			bubbles: true, detail: { addition, instance, request, saveColumns, settled: () => saving }
		}))
		table.addEventListener('click', event => {
			const element = event.target
			if (!(element instanceof HTMLElement) || element.closest('input, button, label')) return
			const cell = element.closest('table, th')
			if (!((cell instanceof HTMLTableCellElement) && cell.classList.contains('select'))) return
			const input = cell.querySelector<HTMLInputElement>('input[type=checkbox]')
			if (!input) return
			input.click()
			input.focus()
		})
		table.tHead?.addEventListener('click', event => {
			const element = event.target
			if (!(element instanceof HTMLElement) || element.closest('input, button')) return
			const cell = element.closest('table, th')
			if (!(cell instanceof HTMLTableCellElement) || !cell.dataset.property
				|| cell.dataset.sortable === 'false') return
			const form = cell.closest('form')
			if (!form) return
			const reverse = (cell.dataset.sort === '1') ? !cell.dataset.reverse : !!cell.dataset.reverse
			const url     = form.action + '?sort=' + cell.dataset.property + (reverse ? '&reverse' : '')
			xTargetCall(url, 'main')
		})
	}
)
