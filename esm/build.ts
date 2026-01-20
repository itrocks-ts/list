import { build }                        from '../../build/build.js'
import { TableFeed }                    from '../../table/feed.js'
import { TableFreeze }                  from '../../table/freeze.js'
import { TableFreezeInheritBackground } from '../../table/freeze/inherit-background.js'
import { TableFreezeInheritBorder }     from '../../table/freeze/inherit-border.js'
import { TableLink }                    from '../../table/link.js'
import { tableByElement }               from '../../table/table.js'
import { xTargetCall }                  from '../../xtarget/xtarget.js'

build<HTMLTableElement>(
	'article[data-action="list"] > form > table.objects',
	table => {
		const tableLink = new TableLink({
			call: url => xTargetCall(url, 'main'),
			id:   (element: Element) => {
				const input = element.closest('tr')?.querySelector<HTMLInputElement>(':scope > th.select > input[name=id]')
				if (input) return { element: input as Element, value: input.value }
			}
		})
		tableByElement(table, {
			plugins: [TableFeed, TableFreeze, TableFreezeInheritBackground, TableFreezeInheritBorder, tableLink]
		})
		table.addEventListener('click', event => {
			const element = event.target
			if (!(element instanceof HTMLElement)) return
			const cell = element.closest('table, th')
			if (!(cell instanceof HTMLTableCellElement) || !cell.classList.contains('select')) return
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
