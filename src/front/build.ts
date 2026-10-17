import { build }                        from '@itrocks/build/build.js'
import { TableColumnAdd }               from '@itrocks/table/column-add.js'
import { TableColumnReorderFreeze }     from '@itrocks/table/column-reorder-freeze.js'
import { TableColumnReorder }           from '@itrocks/table/column-reorder.js'
import { TableFeed }                    from '@itrocks/table/feed.js'
import { TableFreeze }                  from '@itrocks/table/freeze.js'
import { TableFreezeInheritBackground } from '@itrocks/table/freeze/inherit-background.js'
import { TableFreezeInheritBorder }     from '@itrocks/table/freeze/inherit-border.js'
import { TableLink }                    from '@itrocks/table/link.js'
import { tableByElement }               from '@itrocks/table/table.js'
import { xTargetCall }                  from '@itrocks/xtarget/xtarget.js'

build<HTMLTableElement>(
	'article[data-action="list"] > form > table.objects',
	table => {
		let saving = Promise.resolve()
		const request = (query: URLSearchParams, signal?: AbortSignal): Promise<Response> => {
			const form = table.closest('form')!
			const result = saving.then(() => fetch(`${form.action}?${query}`, { keepalive: true, signal }))
			saving = result.then(() => {}, () => {})
			return result
		}
		const saveColumns = (): Promise<void> => {
			const columns = table.tHead?.rows[0].querySelectorAll<HTMLTableCellElement>(
				':scope > th[data-property]:not(.column-add-provisional)'
			)
			const form    = table.closest('form')
			if (!columns || !form) return Promise.resolve()
			const properties = Array.from(columns, column => column.dataset.property ?? '')
			return request(new URLSearchParams({ columns: properties.join(',') })).then(response => {
				if (!response.ok) throw new Error('Unable to save columns')
			})
		}
		const tableColumnReorder = new TableColumnReorder({
			isReorderable: header => header.dataset.property !== undefined,
			onRemove:      saveColumns,
			onReorder:     saveColumns
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
				tableColumnReorder, addition, TableColumnReorderFreeze, TableFeed, TableFreeze, TableFreezeInheritBackground,
				TableFreezeInheritBorder, tableLink
			]
		})
		table.dispatchEvent(new CustomEvent('itrocks:list-ready', {
			bubbles: true, detail: { addition, instance, request, saveColumns }
		}))
		table.addEventListener('click', event => {
			const element = event.target
			if ((element instanceof HTMLInputElement) || !(element instanceof HTMLElement)) return
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
