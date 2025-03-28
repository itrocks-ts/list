import { build }                        from '../../build/build.js'
import { xTargetCall }                  from '../../xtarget/xtarget.js'
import { TableFreeze }                  from '../../table/freeze.js'
import { TableFreezeInheritBackground } from '../../table/freeze/inherit-background.js'
import { TableFreezeInheritBorder }     from '../../table/freeze/inherit-border.js'
import { tableByElement }               from '../../table/table.js'

build<HTMLTableElement>(
	'article[data-action="list"] > form > table.objects',
	element => {
		tableByElement(element, { plugins: [ TableFreeze, TableFreezeInheritBackground, TableFreezeInheritBorder ] })
		element.querySelector(':scope > tbody')?.addEventListener('click', async event =>
		{
			const td = event.target
			if (!(td instanceof HTMLTableCellElement)) return
			const tr = td.closest('tr')
			if (!tr) return
			let select = td.closest('.select')
			if (select) {
				const input = select.querySelector('input')
				if (!input) return
				input.click()
				input.focus()
				return
			}
			const checkBox = tr.querySelector<HTMLInputElement>(':scope > th.select > input[name=id]')
			if (!checkBox) return
			const id = checkBox.value
			if (!id) return
			const form = tr.closest('form')
			if (!form) return
			return xTargetCall(form.getAttribute('action') + '/' + id, 'main')
		})
	}
)
