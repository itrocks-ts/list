import { build } from '@itrocks/build/build.js'

const bound = new WeakSet<HTMLFormElement>()

build<HTMLFormElement>('article[data-action="list"] > form', form => {
	if (bound.has(form)) return
	const trigger = form.querySelector<HTMLInputElement>('.search-submit')
	const menu    = form.querySelector<HTMLElement>('.search-menu')
	if (!trigger || !menu) return
	bound.add(form)
	const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
	let listeners: AbortController | undefined
	let pointer: { id: number, x: number, y: number } | undefined
	let suppressClick = false
	let timer: ReturnType<typeof setTimeout> | undefined
	const cancel = () => {
		clearTimeout(timer)
		pointer = undefined
	}
	const dismiss = () => {
		if (!menu.matches(':popover-open')) return
		menu.hidePopover()
		trigger.setAttribute('aria-expanded', 'false')
		listeners?.abort()
	}
	const close = () => {
		dismiss()
		trigger.focus()
	}
	const open = () => {
		cancel()
		if (!trigger.isConnected || menu.matches(':popover-open')) return
		// A manual popover stays open when the opening right-click or long press is released.
		menu.showPopover()
		const rect = trigger.getBoundingClientRect()
		menu.style.left = `${Math.max(4, Math.min(rect.left, innerWidth - menu.offsetWidth - 4))}px`
		menu.style.top  = `${Math.max(4, rect.bottom + menu.offsetHeight <= innerHeight - 4
			? rect.bottom : rect.top - menu.offsetHeight)}px`
		trigger.setAttribute('aria-expanded', 'true')
		items[0].focus()
		listeners?.abort()
		listeners = new AbortController()
		const { signal } = listeners
		document.addEventListener('scroll', close, { capture: true, signal })
		window.addEventListener('resize', close, { signal })
		document.addEventListener('pointerdown', event => {
			if ((event.target instanceof Node) && !menu.contains(event.target) && !trigger.contains(event.target)) dismiss()
		}, { signal })
		document.addEventListener('keydown', event => {
			if ((event.key !== 'Escape') || event.defaultPrevented) return
			event.preventDefault()
			close()
		}, { signal })
	}
	menu.addEventListener('toggle', () => {
		if (menu.matches(':popover-open')) return
		trigger.setAttribute('aria-expanded', 'false')
		listeners?.abort()
	})
	menu.addEventListener('click', event => {
		if ((event.target instanceof Element) && event.target.closest('button')) dismiss()
	})
	menu.addEventListener('keydown', event => {
		const index = items.indexOf(document.activeElement as HTMLButtonElement)
		let next: number
		switch (event.key) {
			case 'ArrowDown': next = (index + 1) % items.length; break
			case 'ArrowUp':   next = (index + items.length - 1) % items.length; break
			case 'Home':      next = 0; break
			case 'End':       next = items.length - 1; break
			case 'Escape':    event.preventDefault(); close(); return
			case 'Tab':       close(); return
			default:          return
		}
		event.preventDefault()
		items[next].focus()
	})
	trigger.addEventListener('contextmenu', event => {
		event.preventDefault()
		suppressClick = true
		open()
	})
	trigger.addEventListener('keydown', event => {
		if ((event.key !== 'ArrowDown') && (event.key !== 'ContextMenu')
			&& !((event.key === 'F10') && event.shiftKey)) return
		event.preventDefault()
		open()
	})
	trigger.addEventListener('pointerdown', event => {
		cancel()
		suppressClick = false
		if (!event.isPrimary || (event.button !== 0)) return
		pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
		trigger.setPointerCapture(event.pointerId)
		timer = setTimeout(() => {
			suppressClick = true
			open()
		}, 500)
	})
	trigger.addEventListener('pointermove', event => {
		if (pointer && (pointer.id === event.pointerId)
			&& (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10)) {
			suppressClick = true
			cancel()
		}
	})
	for (const type of ['pointercancel', 'pointerup', 'lostpointercapture']) trigger.addEventListener(type, cancel)
	trigger.addEventListener('click', event => {
		if (!suppressClick || (event.detail === 0)) return
		event.preventDefault()
		event.stopImmediatePropagation()
	}, { capture: true })
})
