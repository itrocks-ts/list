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
	element => {
		const tableLink = new TableLink({
			call: url => xTargetCall(url, 'main'),
			href: 'action',
			id:   (element: Element) => {
				const input = element.closest('tr')?.querySelector<HTMLInputElement>(':scope > th.select > input[name=id]')
				if (input) return { element: input as Element, value: input.value }
			}
		})
		tableByElement(element, {
			plugins: [TableFeed, TableFreeze, TableFreezeInheritBackground, TableFreezeInheritBorder, tableLink]
		})
		element.addEventListener('click', event => {
			const element = event.target
			if (!(element instanceof HTMLTableCellElement) || !element.classList.contains('select')) return
			const input = element.querySelector<HTMLInputElement>('input[type=checkbox]')
			if (!input) return
			input.click()
			input.focus()
		})
	}
)
