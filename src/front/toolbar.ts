import { build } from '@itrocks/build/build.js'

const toolbars = new Map<HTMLElement, () => void>()

function actionsWidth(actions: HTMLElement): number
{
	const items = [...actions.children].filter(item => item.getClientRects().length)
	const style = getComputedStyle(actions)

	return inlineEdges(style)
		+ gapWidth(style, items.length)
		+ items.reduce((width, item) => width + item.getBoundingClientRect().width, 0)
}

function contentWidth(element: HTMLElement, style: CSSStyleDeclaration): number
{
	const range = document.createRange()
	range.selectNodeContents(element)
	return range.getBoundingClientRect().width + inlineEdges(style)
}

function filterWidth(filter: HTMLElement): number
{
	const icon        = filter.querySelector<HTMLElement>('.list-filter-icon')
	const filterStyle = getComputedStyle(filter)
	let width         = inlineEdges(filterStyle)
	if (!icon) return width

	const text = filter.querySelector<HTMLElement>('.list-filter-text')
	const row  = icon.parentElement!

	width += icon.getBoundingClientRect().width
	const rowStyle = row === filter ? filterStyle : getComputedStyle(row)
	if (row !== filter) {
		width += inlineEdges(rowStyle)
	}
	if (text) {
		const textStyle = getComputedStyle(text)
		width += gapWidth(rowStyle, 2) + Math.max(contentWidth(text, textStyle), pixels(textStyle.minWidth))
	}
	const resetWidth = filter.querySelector('.list-filter-reset')?.getBoundingClientRect().width ?? 0
	if (resetWidth) {
		width += gapWidth(filterStyle, 2) + resetWidth
	}
	return width
}

function gapWidth(style: CSSStyleDeclaration, items: number): number
{
	return Math.max(0, items - 1) * pixels(style.columnGap)
}

function inlineEdges(style: CSSStyleDeclaration): number
{
	return pixels(style.paddingInlineStart) + pixels(style.paddingInlineEnd)
		+ pixels(style.borderInlineStartWidth) + pixels(style.borderInlineEndWidth)
}

function pixels(value: string): number
{
	return Number.parseFloat(value) || 0
}

function watchToolbar(toolbar: HTMLElement): void
{
	if (toolbars.has(toolbar)) return
	const actions = toolbar.querySelector<HTMLElement>(':scope > .general.actions')!
	const add     = toolbar.querySelector<HTMLButtonElement>(':scope > .add-column')!
	const count   = toolbar.querySelector<HTMLElement>(':scope > .summary')!
	const filter  = toolbar.querySelector<HTMLElement>(':scope > .list-filter')!
	const abort   = new AbortController()
	let frame: number | undefined

	function update(): void
	{
		frame = undefined
		const style     = getComputedStyle(toolbar)
		const available = toolbar.getBoundingClientRect().width - inlineEdges(style)
		const gaps      = (add.hidden ? 2 : 3) * pixels(style.getPropertyValue('--list-toolbar-gap'))
		const required  = actionsWidth(actions) + filterWidth(filter) + contentWidth(count, getComputedStyle(count))
			+ add.getBoundingClientRect().width + gaps

		toolbar.toggleAttribute('data-filter-row', required > available)
	}

	function schedule(): void
	{
		frame ??= requestAnimationFrame(update)
	}

	const resize = new ResizeObserver(schedule)
	for (const element of [toolbar, add, count, ...actions.children]) {
		resize.observe(element)
	}
	const mutations = new MutationObserver(schedule)
	mutations.observe(toolbar, {
		attributeFilter: ['data-filled', 'hidden'], characterData: true, childList: true, subtree: true
	})

	for (const event of ['focusin', 'focusout', 'input']) {
		toolbar.addEventListener(event, schedule, { signal: abort.signal })
	}
	document.fonts.addEventListener('loadingdone', schedule, { signal: abort.signal })
	toolbars.set(toolbar, () => {
		if (frame !== undefined) {
			cancelAnimationFrame(frame)
		}
		abort.abort()
		mutations.disconnect()
		resize.disconnect()
	})
	update()
}

build<HTMLElement>('article[data-action="list"] > header > .list-toolbar', watchToolbar)

new MutationObserver(() => {
	for (const [toolbar, dispose] of toolbars) {
		if (toolbar.isConnected) continue
		dispose()
		toolbars.delete(toolbar)
	}
}).observe(document.body, { childList: true, subtree: true })
