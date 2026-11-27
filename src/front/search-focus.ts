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

		form.querySelector<HTMLInputElement>('.search-submit')?.addEventListener('pointerdown', event => {
			if (event.isPrimary && event.button === 0 && focusedColumn(form)) {
				event.preventDefault()
			}
		})
		form.addEventListener('submit', event => {
			const submitter = event.submitter
			column = (!submitter || submitter.matches('.search-submit'))
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

build<HTMLButtonElement, 'click'>('.list-filter > button[data-focus-column-filter]', 'click', function () {
	this.closest('article[data-action="list"]')
		?.querySelector<HTMLInputElement>(':scope > form input[data-property-filter]:enabled')?.focus()
})

build<HTMLButtonElement, 'click'>('.list-filter > .list-filter-reset', 'click', function () {
	const form = this.closest('article[data-action="list"]')?.querySelector<HTMLFormElement>(':scope > form')
	if (!form) return
	const reset = form.querySelector<HTMLButtonElement>('button[name="reset"]')
	if (reset) {
		form.requestSubmit(reset)
	}
})
