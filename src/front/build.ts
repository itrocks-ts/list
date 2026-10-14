import { build }                        from '@itrocks/build/build.js'
import { TableColumnReorder }           from '@itrocks/table/column-reorder.js'
import { TableColumnReorderFreeze }     from '@itrocks/table/column-reorder-freeze.js'
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
		const saveColumns = () => {
			const columns = table.tHead?.rows[0].querySelectorAll<HTMLTableCellElement>(':scope > th[data-property]')
			const form    = table.closest('form')
			if (!columns || !form) return
			const properties = Array.from(columns, column => encodeURIComponent(column.dataset.property ?? ''))
			fetch(form.action + '?columns=' + properties.join(','), { keepalive: true }).catch(
				error => console.error('Columns save error:', error)
			)
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
		tableByElement(table, {
			plugins: [
				tableColumnReorder, TableColumnReorderFreeze, TableFeed, TableFreeze, TableFreezeInheritBackground,
				TableFreezeInheritBorder, tableLink
			]
		})
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
			if (!(element instanceof HTMLElement)) return
			const cell = element.closest('table, th')
			if (!(cell instanceof HTMLTableCellElement) || !cell.dataset.property) return
			const form = cell.closest('form')
			if (!form) return
			const reverse = (cell.dataset.sort === '1') ? !cell.dataset.reverse : !!cell.dataset.reverse
			const url     = form.action + '?sort=' + cell.dataset.property + (reverse ? '&reverse' : '')
			xTargetCall(url, 'main')
		})
	}
)
