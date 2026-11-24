import { build } from '@itrocks/build/build.js'

const bound = new WeakSet<HTMLFormElement>()

export function focusedColumn(form: HTMLFormElement): HTMLInputElement | undefined
{
	const active = document.activeElement
	if (active instanceof HTMLInputElement && active.form === form && active.hasAttribute('data-property-filter')) {
		return active
	}
}

build<HTMLFormElement, 'call'>({
	callback: form => {
		if (bound.has(form)) return
		bound.add(form)
		let column: string | undefined

		form.addEventListener('submit', event => {
			const submitter = event.submitter
			column = (!submitter || submitter.matches('.search-submit, .search-menu .search'))
				? focusedColumn(form)?.name.slice('search.'.length)
				: undefined
		}, { capture: true })
		form.addEventListener('formdata', event => {
			if (column) {
				event.formData.set('focusListColumn', column)
				column = undefined
			}
		})

		const field = form.dataset.focusColumn
		delete form.dataset.focusColumn
		if (!field) return
		const input = form.elements.namedItem('search.' + field)
		if (!(input instanceof HTMLInputElement)) return
		input.focus()
		input.select()
	},
	priority: 2000,
	selector: 'article[data-action="list"] > form'
})
