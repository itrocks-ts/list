import assert            from 'node:assert/strict'
import { readFile }      from 'node:fs/promises'
import { createServer }  from 'node:http'
import { createRequire } from 'node:module'
import { resolve }       from 'node:path'
import { fileURLToPath } from 'node:url'

// Actual browser modules and gestures; the HTTP fixture supplies synthetic records and session state.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PS_PLAYWRIGHT_MODULE
	|| '/home/baptiste/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const packages = fileURLToPath(new URL('../../', import.meta.url))
const template = await readFile(resolve(packages, 'property-select/front/property-select.html'), 'utf8')
const properties = ['number', 'amount', 'city', 'note', ...Array.from({ length: 30 }, (_, index) => `field${index}`)]
const context = { path: '', label: 'Fixture', type: 'Fixture', properties: properties.map((name, order) => ({
	kind: 'terminal', label: name === 'city' ? 'ville' : name, name, order, path: name
})) }
const initial = { advice: [], contexts: [context], errors: [], generation: 'fixture-session',
	record: { revision: 0, state: { branch: [], current: 0, query: '', recent: [],
		scroll: { 'properties::': { left: 0, top: 100000 } }, version: 1 } }, template }
const requests = [], errors = []
const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url, 'http://localhost')
		if (url.pathname.startsWith('/@itrocks/')) {
			const path = resolve(packages, url.pathname.slice('/@itrocks/'.length))
			if (!path.startsWith(packages)) throw new Error('Invalid asset')
			response.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript')
			response.end(await readFile(path))
			return
		}
		if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return }
		requests.push(request.url)
		if (url.pathname === '/property-select/state/json') {
			response.setHeader('X-Property-Select-Session', 'fixture-session')
			response.end(JSON.stringify({ revision: 1 }))
			return
		}
		if (url.searchParams.has('columns') && !url.searchParams.has('column')) { response.writeHead(204).end(); return }
		if (url.searchParams.has('column')) {
			const path = url.searchParams.get('column')
			if (path === 'field0') { response.writeHead(503).end('Unavailable'); return }
			const result = { label: path === 'city' ? 'ville' : path, path, sortable: true }
			if (!url.searchParams.has('validate')) {
				await new Promise(resolve => setTimeout(resolve, 350))
				result.rows = url.searchParams.get('rowIds').split(',').map(id => ({ id, html: `${path}-${id}` }))
			}
			response.setHeader('Content-Type', 'application/json')
			response.end(JSON.stringify(result))
			return
		}
		if (url.pathname !== '/fixture/list' || url.search) {
			response.writeHead(500).end('Unexpected request'); return
		}
		response.setHeader('Content-Type', 'text/html')
		response.end(`<!doctype html><html><head>
			<link rel="stylesheet" href="/@itrocks/list/list.css">
			<script type="importmap">{"imports":{"@itrocks/":"/@itrocks/"}}</script>
			<style>body { margin:30px; font-family:sans-serif } table.objects { display:block; width:650px; height:240px;
				overflow:auto; border-collapse:collapse } th,td { min-width:120px; height:30px; border:1px solid #ccc }
				th.select { min-width:40px } #pane { position:absolute; left:750px; top:30px; width:300px; height:400px }
				#pane > div { height:100% } .ps-properties { height:160px; overflow:auto } input { width:100px }
				.column-reorder { opacity:.8 }</style></head><body>
			<article data-action="list" data-property-root="/fixture" data-selector-key="/fixture/list"
				data-selector-bootstrap="${encodeURIComponent(JSON.stringify(initial))}">
				<button class="add-column" hidden type="button">+</button>
				<form action="/fixture/list"><table class="objects">
					<colgroup><col data-freeze><col><col></colgroup><thead><tr class="properties">
					<th class="select">ID</th><th data-property="number">number</th><th data-property="amount">amount</th>
				</tr></thead><tbody>${Array.from({ length: 80 }, (_, index) => `<tr>
					<th class="select"><input name="id" value="${index + 1}"></th>
					<td>number-${index + 1}</td><td>amount-${index + 1}</td></tr>`).join('')}</tbody></table></form>
			</article><aside id="pane" hidden></aside>
			<script type="module">
				import { bindListPane } from '/@itrocks/framework/property-select-list.js'
				const pane = document.querySelector('#pane')
				bindListPane((owner, content) => {
					pane.replaceChildren(content)
					return { close() { pane.hidden = true }, open() { pane.hidden = false },
						remove() { pane.replaceChildren() }, subscribe() { return () => {} },
						suspend() { return { restore() {} } } }
				})
				await import('/@itrocks/list/build.js')
			</script></body></html>`)
	}
	catch (error) { errors.push(String(error)); response.writeHead(500).end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
	browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
	page.on('pageerror', error => errors.push(error.message))
	await page.goto(`http://127.0.0.1:${server.address().port}/fixture/list`)
	await page.locator('.add-column:not([hidden])').waitFor()
	await page.waitForTimeout(150)
	assert.deepEqual(requests, ['/fixture/list'], 'Opening the list needs one application request')
	await page.locator('.add-column').click()
	await page.waitForTimeout(100)
	assert.deepEqual(requests, ['/fixture/list'], 'Restoring a clamped selector scroll needs no request')
	await page.locator('.ps-main[data-path="city"]').click()
	await page.locator('th[data-property="city"]').waitFor()
	assert.equal(await page.locator('tbody tr:first-child td:last-child').textContent(), '\u00a0')
	assert.equal(await page.locator('th[data-property="city"]').textContent(), 'ville')
	const filter = page.locator('th[data-property="city"] input[name="search.city"]')
	assert.equal(await filter.count(), 1)
	await page.waitForTimeout(130)
	assert.equal(await filter.isVisible(), true, 'Search appears before values arrive')
	await filter.fill('pending')
	await page.waitForFunction(() =>
		document.querySelector('tbody tr:last-child td:last-child')?.textContent === 'city-80')
	assert.equal(await filter.inputValue(), 'pending')
	assert.equal(requests.filter(url => url.startsWith('/fixture/list?')).length, 1)
	assert.equal(requests.filter(url => url.includes('rowIds=')).length, 1)
	assert.ok(requests.find(url => url.includes('rowIds=')).includes('columns='))
	assert.equal(new URL(requests.find(url => url.includes('rowIds=')), 'http://fixture').searchParams
		.get('rowIds').split(',').length, 80, 'Fill every row through the current fetch position')
	requests.length = 0
	await page.locator('.ps-check[data-path="city"]').click()
	await page.locator('th[data-property="city"].column-remove-highlight').waitFor()
	assert.equal(requests.length, 1, 'Removal saves immediately during the red flash')
	await page.locator('th[data-property="city"]').waitFor({ state: 'detached' })
	await page.waitForTimeout(80)
	assert.equal(requests.length, 1, 'Removal only saves columns')
	assert.ok(requests[0].includes('columns='))
	await page.locator('.ps-main[data-path="city"]').click()
	await page.locator('th[data-property="city"]').waitFor()
	await page.waitForFunction(() =>
		document.querySelector('tbody tr:last-child td:last-child')?.textContent === 'city-80')
	requests.length = 0
	const header = await page.locator('th[data-property="city"]').boundingBox()
	const target = await page.locator('th[data-property="number"]').boundingBox()
	await page.mouse.move(header.x + 30, header.y + 15)
	await page.mouse.down()
	await page.mouse.move(target.x + 10, target.y + 15, { steps: 10 })
	assert.deepEqual(requests, [], 'Moving does not request anything before drop')
	await page.mouse.up()
	await page.waitForTimeout(120)
	assert.equal(requests.length, 1)
	assert.ok(requests[0].includes('columns='), 'Move only saves column order')
	requests.length = 0
	const moved = await page.locator('th[data-property="city"]').boundingBox()
	await page.mouse.move(moved.x + 30, moved.y + 15)
	await page.mouse.down()
	await page.mouse.move(moved.x + 30, 8, { steps: 10 })
	await page.mouse.up()
	await page.waitForTimeout(120)
	assert.equal(await page.locator('th[data-property="city"]').count(), 0)
	assert.equal(requests.length, 1)
	assert.ok(requests[0].includes('columns='), 'Remove only saves column order')
	requests.length = 0
	const beforeHidden = await page.locator('table').evaluate(table => ({
		left: table.scrollLeft, width: table.scrollWidth
	}))
	await page.locator('.ps-main[data-path="note"]').scrollIntoViewIfNeeded()
	const source = await page.locator('.ps-main[data-path="note"]').boundingBox()
	await page.mouse.move(source.x + 20, source.y + 12)
	await page.mouse.down()
	await page.mouse.move(source.x - 30, source.y + 12, { steps: 5 })
	await page.locator('th[data-property="note"]').waitFor({ state: 'attached' })
	assert.equal(await page.locator('th[data-property="note"]').isVisible(), false)
	assert.equal(await page.locator('colgroup col[hidden]').count(), 1)
	assert.equal(await page.locator('th[data-property="note"]').evaluate(header =>
		header.classList.contains('column-add-provisional')), false)
	assert.equal(await page.locator('tbody tr:first-child td:last-child').textContent(), '\u00a0')
	await page.waitForFunction(() =>
		document.querySelector('tbody tr:last-child td:last-child').textContent === 'note-80')
	assert.equal(requests.filter(url => url.includes('rowIds=')).length, 1, 'Values load while the pointer is held')
	assert.equal(await page.locator('th[data-property="note"]').evaluate(header =>
		header.classList.contains('column-reorder')), true, 'Loaded header remains in the table drag')
	assert.deepEqual(await page.locator('table').evaluate(table => ({
		left: table.scrollLeft, width: table.scrollWidth
	})), beforeHidden, 'Hidden creation and loaded values cause no zoom or scroll')
	assert.equal(await page.locator('th[data-property="note"]').isVisible(), false)
	assert.equal(await page.locator('th[data-property="note"]').evaluate(header =>
		header.classList.contains('column-add-highlight') || header.classList.contains('column-add-opening')), false)
	// Enter beyond the existing cells so this scenario keeps the newly appended position.
	const viewport = await page.locator('table').boundingBox()
	await page.mouse.move(viewport.x + viewport.width - 5, viewport.y + 15, { steps: 10 })
	await page.locator('th[data-property="note"]').waitFor({ state: 'visible' })
	const note = await page.locator('th[data-property="note"]').boundingBox()
	await page.mouse.move(note.x + note.width / 2, note.y + 15, { steps: 10 })
	const indicator = await page.locator('th[data-property="note"]').evaluate(header => ({
		adding: header.classList.contains('adding'), moving: header.classList.contains('moving'),
		mask: getComputedStyle(header, '::before').maskImage,
		color: getComputedStyle(header, '::before').backgroundColor
	}))
	assert.equal(indicator.adding, true)
	assert.equal(indicator.moving, false)
	assert.ok(indicator.mask.includes('column-add.svg'), JSON.stringify(indicator))
	assert.equal(indicator.color, 'rgb(47, 137, 67)')
	await page.mouse.up()
	await page.waitForTimeout(150)
	assert.equal(requests.filter(url => url.startsWith('/fixture/list?')).length, 1,
		'Dropping at the created position does not save or load again')
	assert.ok(requests.find(url => url.includes('rowIds=')).includes('columns='))
	// A new column follows the same addition, then saves only its changed order at drop.
	requests.length = 0
	await page.locator('.ps-main[data-path="city"]').scrollIntoViewIfNeeded()
	const city = await page.locator('.ps-main[data-path="city"]').boundingBox()
	await page.mouse.move(city.x + 20, city.y + 12)
	await page.mouse.down()
	await page.mouse.move(city.x - 30, city.y + 12, { steps: 5 })
	await page.waitForFunction(() => [...document.querySelectorAll('tbody tr:last-child td')]
		.some(cell => cell.textContent === 'city-80'))
	const first = await page.locator('th[data-property="number"]').boundingBox()
	await page.mouse.move(first.x + 10, first.y + 15, { steps: 10 })
	await page.mouse.up()
	await page.waitForTimeout(150)
	assert.equal(requests.filter(url => url.includes('rowIds=')).length, 1)
	assert.equal(requests.filter(url => url.startsWith('/fixture/list?')).length, 2,
		'A changed order needs one configuration save, without reloading the values')
	const order = await page.locator('thead [data-property]').evaluateAll(headers =>
		headers.map(header => header.dataset.property))
	assert.equal(order[0], 'city')
	assert.equal(new URL(requests.at(-1), 'http://fixture').searchParams.get('columns'), order.join(','))
	// Outside drops use the table's normal removal, before or after entering, including late values.
	for (const entered of [false, true]) for (const loaded of [false, true]) {
		requests.length = 0
		await page.locator('.ps-main[data-path="field1"]').scrollIntoViewIfNeeded()
		const source = await page.locator('.ps-main[data-path="field1"]').boundingBox()
		await page.mouse.move(source.x + 20, source.y + 12)
		await page.mouse.down()
		await page.mouse.move(source.x - 30, source.y + 12, { steps: 5 })
		await page.locator('th[data-property="field1"]').waitFor({ state: 'attached' })
		if (entered) {
			const target = await page.locator('th[data-property="number"]').boundingBox()
			await page.mouse.move(target.x + 20, target.y + 15, { steps: 5 })
			await page.locator('th[data-property="field1"]').waitFor({ state: 'visible' })
		}
		if (loaded) await page.waitForFunction(() => [...document.querySelectorAll('tbody tr:last-child td')]
			.some(cell => cell.textContent === 'field1-80'))
		await page.mouse.move(700, 10, { steps: 5 })
		await page.mouse.up()
		await page.locator('th[data-property="field1"]').waitFor({ state: 'detached' })
		await page.waitForTimeout(450)
		assert.equal(await page.locator('th[data-property="field1"]').count(), 0)
		assert.equal(await page.locator('colgroup col[hidden]').count(), 0)
		assert.equal(requests.filter(url => url.includes('rowIds=')).length, 1)
		assert.equal(requests.filter(url => url.includes('columns=') && !url.includes('rowIds=')).length, 1,
			'Outside drop saves removal exactly once through the standard header callback')
		assert.equal(new URL(requests.at(-1), 'http://fixture').searchParams.get('columns')?.includes('field1'), false)
	}
	requests.length = 0
	await page.locator('.ps-main[data-path="field0"]').click()
	await page.locator('td.column-add-error').first().waitFor()
	const failed = await page.locator('td.column-add-error').evaluateAll(cells => cells.map(cell => ({
		background: getComputedStyle(cell).backgroundColor, outline: getComputedStyle(cell).outlineStyle,
		text: cell.textContent
	})))
	assert.equal(failed.length, 80)
	assert.ok(failed.every(cell => cell.text === '\u00a0' && cell.outline === 'none'
		&& cell.background !== 'rgba(0, 0, 0, 0)'), JSON.stringify(failed[0]))
	assert.equal(await page.locator('.column-retry').count(), 0)
	assert.equal(await page.locator('th[data-property="field0"] input').isVisible(), true)
	assert.equal(await page.locator('td.column-add-error.column-add-highlight').count(), 0)
	await page.waitForTimeout(1200)
	assert.equal(requests.filter(url => new URL(url, 'http://fixture').searchParams.get('column') === 'field0').length,
		1, 'A failed load never retries automatically')
	assert.deepEqual(errors, [])
	console.log('PASS hidden drag addition, single load, green indicator and standard outside removal')
}
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
