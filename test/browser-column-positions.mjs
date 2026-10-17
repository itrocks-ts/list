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
					const listeners = new Set()
					const notify = () => listeners.forEach(listener => listener({
						present: true, open: !pane.hidden, suspended: false
					}))
					window.fixturePane = {
						close() { pane.hidden = true; notify() },
						open() { pane.hidden = false; notify() },
						remove() { pane.replaceChildren(); listeners.clear() },
						subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
						suspend() { return { restore() {} } }
					}
					return window.fixturePane
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
	const origin = `http://127.0.0.1:${server.address().port}`
	const order = () => page.locator('thead [data-property]:not(.column-add-provisional)')
		.evaluateAll(headers => headers.map(header => header.dataset.property))
	const toggle = async (path, expected) => {
		await page.locator(`.ps-main[data-path="${path}"]`).click()
		await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll(
			'thead [data-property]:not(.column-add-provisional)'
		)].map(header => header.dataset.property)) === JSON.stringify(expected), expected)
		assert.deepEqual(await order(), expected)
	}
	const reset = async () => {
		await page.goto(`${origin}/fixture/list`)
		await page.locator('.add-column:not([hidden])').click()
		await toggle('city', ['number', 'amount', 'city'])
		await toggle('note', ['number', 'amount', 'city', 'note'])
	}
	await reset()
	await toggle('amount', ['number', 'city', 'note'])
	await toggle('amount', ['number', 'amount', 'city', 'note'])
	console.log('PASS reinsert immediately after the left neighbour')

	await reset()
	await toggle('amount', ['number', 'city', 'note'])
	await toggle('number', ['city', 'note'])
	await toggle('amount', ['amount', 'city', 'note'])
	console.log('PASS reinsert before the right neighbour when the left one is absent')

	await reset()
	await toggle('amount', ['number', 'city', 'note'])
	await toggle('number', ['city', 'note'])
	await toggle('city', ['note'])
	await toggle('amount', ['note', 'amount'])
	console.log('PASS append when neither neighbour remains')

	await reset()
	await toggle('amount', ['number', 'city', 'note'])
	await page.evaluate(() => fixturePane.close())
	await page.locator('.add-column').click()
	await toggle('amount', ['number', 'city', 'note', 'amount'])
	console.log('PASS closing the pane forgets the previous position')

	await reset()
	await page.locator('.ps-main[data-path="amount"]').click()
	await page.locator('th[data-property="amount"].column-remove-highlight').waitFor()
	await page.evaluate(() => fixturePane.close())
	await page.waitForFunction(() => !document.querySelector('th[data-property="amount"]'))
	await page.locator('.add-column').click()
	await toggle('amount', ['number', 'city', 'note', 'amount'])
	console.log('PASS closing during the flash does not retain the position')
	assert.deepEqual(errors, [])
}
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
