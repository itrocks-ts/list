import { build } from '@itrocks/build/build.js'

const bound    = new WeakSet<HTMLInputElement>()
const selector = 'article[data-action="list"] > form input[data-property-filter]'
const measure  = document.createElement('canvas').getContext('2d')

export function highlightColumnFilter(input: HTMLInputElement): void
{
	input.toggleAttribute('data-filter-value', !!input.value)
	if (!input.value || !measure) return

	measure.font = getComputedStyle(input).font
	input.style.setProperty('--list-filter-text-width', `${measure.measureText(input.value).width}px`)
	positionHighlight(input)
}

function positionHighlight(input: HTMLInputElement): void
{
	input.style.setProperty('--list-filter-text-offset', `${-Math.abs(input.scrollLeft)}px`)
}

build<HTMLInputElement>(selector, input => {
	if (!bound.has(input)) {
		bound.add(input)
		input.addEventListener('input', () => highlightColumnFilter(input))
		input.addEventListener('scroll', () => positionHighlight(input))
	}
	highlightColumnFilter(input)
})

document.fonts.addEventListener('loadingdone', () => {
	document.querySelectorAll<HTMLInputElement>(selector).forEach(highlightColumnFilter)
})
