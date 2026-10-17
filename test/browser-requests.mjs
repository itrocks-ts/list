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
	kind: 'terminal', label: name, name, order, path: name
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
		if (url.searchParams.has('columns')) { response.writeHead(204).end(); return }
		if (url.searchParams.has('column')) {
			const path = url.searchParams.get('column')
			const result = { label: path, path, sortable: true }
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
			<script type="importmap">{"imports":{"@itrocks/":"/@itrocks/"}}</script>
			<style>body { margin:30px; font-family:sans-serif } table { display:block; width:650px; height:240px;
				overflow:auto; border-collapse:collapse } th,td { min-width:120px; height:30px; border:1px solid #ccc }
				th.select { min-width:40px } #pane { position:absolute; left:750px; top:30px; width:300px; height:400px }
				#pane > div { height:100% } .ps-properties { height:160px; overflow:auto } input { width:100px }
				.column-reorder { opacity:.8 }</style></head><body>
			<article data-action="list" data-property-root="/fixture" data-selector-key="/fixture/list"
				data-selector-bootstrap="${encodeURIComponent(JSON.stringify(initial))}">
				<button class="add-column" hidden type="button">+</button>
				<form action="/fixture/list"><table class="objects">
					<colgroup><col data-freeze><col><col></colgroup><thead><tr>
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
	assert.equal(await page.locator('tbody tr:first-child td:last-child').textContent(), '')
	await page.waitForFunction(() =>
		document.querySelector('tbody tr:last-child td:last-child')?.textContent === 'city-80')
	assert.equal(requests.filter(url => url.includes('rowIds=')).length, 1)
	assert.equal(new URL(requests.find(url => url.includes('rowIds=')), 'http://fixture').searchParams
		.get('rowIds').split(',').length, 80, 'Fill every row through the current fetch position')
	requests.length = 0
	await page.locator('.ps-check[data-path="city"]').click()
	await page.locator('th[data-property="city"].column-remove-highlight').waitFor()
	assert.deepEqual(requests, [], 'Removal waits for the red flash before saving')
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
	const geometry = () => page.evaluate(() => ({
		headers: [...document.querySelectorAll('thead th:not([hidden])')].map(cell => {
			const rect = cell.getBoundingClientRect()
			return { x: rect.x, width: rect.width }
		}),
		width: document.querySelector('table').scrollWidth,
		scroll: document.querySelector('table').scrollLeft
	}))
	const beforeDrag = await geometry()
	await page.locator('.ps-main[data-path="note"]').scrollIntoViewIfNeeded()
	const source = await page.locator('.ps-main[data-path="note"]').boundingBox()
	await page.mouse.move(source.x + 20, source.y + 12)
	await page.mouse.down()
	await page.mouse.move(source.x - 30, source.y + 12, { steps: 5 })
	await page.locator('th[data-property="note"]').waitFor({ state: 'attached' })
	assert.equal(await page.locator('th[data-property="note"]').isVisible(), false)
	assert.equal(await page.locator('colgroup col[hidden]').count(), 1)
	assert.deepEqual(await geometry(), beforeDrag, 'Hidden preview leaves layout and scroll unchanged')
	assert.equal(await page.locator('tbody tr:first-child td:last-child').textContent(), '')
	await page.waitForFunction(() => [...document.querySelectorAll('tbody tr:last-child td')]
		.some(cell => cell.textContent === 'note-80'))
	assert.equal(requests.filter(url => url.startsWith('/fixture/list')).length, 1,
		'Only values are requested while dragging; scrolling may save selector state')
	assert.ok(requests.some(url => url.includes('rowIds=')), 'Values arrive before table entry')
	assert.equal(await page.locator('th[data-property="note"]').isVisible(), false)
	assert.deepEqual(await geometry(), beforeDrag, 'Loaded preview remains hidden without changing layout')
	const saved = page.waitForRequest(request => request.url().includes('columns='))
	void saved.catch(() => {})
	await page.mouse.move(target.x + 30, target.y + 15, { steps: 10 })
	assert.equal(await page.locator('th[data-property="note"]').isVisible(), true)
	assert.equal(await page.locator('colgroup col[hidden]').count(), 0)
	await page.mouse.up()
	await saved
	await page.waitForFunction(() => document.querySelector('th[data-property="note"]')
		&& [...document.querySelectorAll('tbody tr:last-child td')].some(cell => cell.textContent === 'note-80'))
	assert.equal(requests.filter(url => url.includes('rowIds=')).length, 1)
	// Abandon a hidden preview, then one filled after entry while the pointer is still held.
	for (const entered of [false, true]) {
		requests.length = 0
		await page.locator('.ps-main[data-path="city"]').scrollIntoViewIfNeeded()
		const cancelled = await page.locator('.ps-main[data-path="city"]').boundingBox()
		await page.mouse.move(cancelled.x + 20, cancelled.y + 12)
		await page.mouse.down()
		await page.mouse.move(cancelled.x - 30, cancelled.y + 12, { steps: 5 })
		await page.locator('th[data-property="city"]').waitFor({ state: 'attached' })
		assert.equal(await page.locator('th[data-property="city"]').isVisible(), false)
		if (entered) {
			await page.mouse.move(target.x + 30, target.y + 15)
			assert.equal(await page.locator('th[data-property="city"]').isVisible(), true)
			assert.equal(await page.locator('tbody tr:first-child').evaluate(row =>
				row.cells[document.querySelector('th[data-property="city"]').cellIndex].textContent), '')
			await page.waitForFunction(() => [...document.querySelectorAll('tbody tr:last-child td')]
				.some(cell => cell.textContent === 'city-80'))
			assert.equal(await page.locator('th[data-property="city"]').isVisible(), true)
		}
		await page.mouse.move(700, 10)
		await page.mouse.up()
		await page.waitForTimeout(450)
		assert.equal(await page.locator('th[data-property="city"]').count(), 0)
		assert.equal(await page.locator('colgroup col').count(), 4)
		assert.equal(requests.filter(url => url.startsWith('/fixture/list')).length, 1,
			'Abandoned preview only preloads values, without admission or column persistence')
		assert.ok(requests.some(url => url.includes('rowIds=')))
	}
	assert.deepEqual(errors, [])
	console.log('PASS: one initial request; hidden drag preload; reveal on entry; outside cancellation; request budgets')
}
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
