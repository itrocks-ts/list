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
	kind: name === 'city' ? 'relation' : 'terminal', label: name, name, order, path: name
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
	await page.locator('.add-column:not([hidden])').click()
	await page.locator('.ps-main[data-path="city"]').click()
	await page.waitForFunction(() => document.querySelector('tbody tr:last-child td:last-child')?.textContent === 'city-80')
	const original = await page.locator('thead [data-property]').evaluateAll(headers =>
		headers.map(header => header.dataset.property))
	for (const path of ['amount', 'city']) {
		const row = page.locator(`.ps-property[data-path="${path}"]`)
		const header = page.locator(`th[data-property="${path}"]`)
		for (const control of ['.ps-check', '.ps-check-cell', '.ps-main']) {
			requests.length = 0
			await row.locator(control).click({ position: { x: 2, y: 2 } })
			await page.locator(`th[data-property="${path}"].column-remove-highlight`).waitFor()
			assert.equal(await row.locator('.ps-check').isChecked(), false)
			assert.equal(await row.evaluate(node => node.classList.contains('ps-used')), false)
			assert.equal(await row.locator('.ps-locate').boundingBox(), null)
			await row.locator(control).click({ position: { x: 2, y: 2 } })
			await page.locator(`th[data-property="${path}"].column-add-highlight`).waitFor()
			assert.equal(await row.locator('.ps-check').isChecked(), true)
			assert.equal(await header.evaluate(node => node.classList.contains('column-remove-highlight')), false)
			await page.waitForTimeout(400)
			assert.deepEqual(await page.locator('thead [data-property]').evaluateAll(headers =>
				headers.map(header => header.dataset.property)), original)
			assert.equal(requests.filter(url => url.includes('columns=')).length, 0)
			console.log('PASS immediate uncheck and cancellation', path, control)
		}
	}
	// With no second click, removal still completes and a later click restores its former neighbours.
	await page.locator('.ps-check[data-path="amount"]').click()
	await page.locator('th[data-property="amount"]').waitFor({ state: 'detached' })
	await page.locator('.ps-check[data-path="amount"]').click()
	await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll(
		'thead [data-property]:not(.column-add-provisional)'
	)].map(header => header.dataset.property)) === JSON.stringify(expected), original)
	assert.deepEqual(errors, [])
	console.log('PASS completed removal and neighbour restoration')
}
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
