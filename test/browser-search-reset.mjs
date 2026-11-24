import assert            from 'node:assert/strict'
import { readFile }      from 'node:fs/promises'
import { createServer }  from 'node:http'
import { createRequire } from 'node:module'
import { resolve }       from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PS_PLAYWRIGHT_MODULE
	|| '/home/baptiste/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const packages = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const template = await readFile(new URL('../src/list.html', import.meta.url), 'utf8')
const article = template.split('<!--BEGIN-->')[1].split('<!--END-->')[0]
	.replace(/<!--columns-->[\s\S]*?<!--end-->/, `<th data-property="title">Title
		<input data-property-filter="title" name="search.title" value="{term}"></th>`)
	.replace('{./feed.html}', `<tr><th class="select"><input name="id" type="checkbox" value="1"></th>
		<td>Movie</td></tr>`)
	.replace('app://(type.@route)/list', '/fixture/list')
const filterSummary = `<span class="list-filter-icon" aria-hidden="true"></span>
	<span class="list-filter-text">title:Movie</span>`
const errors = []
const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url, 'http://localhost')
		if (url.pathname.startsWith('/@itrocks/')) {
			const path = resolve(packages, url.pathname.slice('/@itrocks/'.length))
			if (!path.startsWith(packages + '/')) throw new Error('Invalid asset')
			const extension = path.split('.').pop()
			response.setHeader('Content-Type', { css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml' }[extension])
			response.end(await readFile(path))
			return
		}
		if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return }
		response.setHeader('Content-Type', 'text/html; charset=utf-8')
		if (url.searchParams.has('offset')) { response.end('<table><tbody></tbody></table>'); return }
		const empty = url.searchParams.has('empty')
		const list  = article.replace('<!--filterBar-->{{template}}<!--end-->', empty ? '' : filterSummary)
			.replace('{term}', empty ? '' : 'Movie')
		response.end(`<!doctype html><html><head>
			<link rel="stylesheet" href="/@itrocks/list/list.css">
			<meta name="viewport" content="width=device-width, initial-scale=1">
			<script type="importmap">{"imports":{"@itrocks/":"/@itrocks/"}}</script>
			<style>body { margin:20px; font:14px sans-serif } input { box-sizing:border-box }</style>
			</head><body><main>${list}</main>
			<script type="module">
				window.submissions = []
				document.addEventListener('submit', event => {
					event.preventDefault()
					window.submissions.push(Object.fromEntries(new FormData(event.target, event.submitter)))
				})
				await import('/@itrocks/list/build.js')
				window.ready = true
			</script></body></html>`)
	}
	catch (error) { errors.push(String(error)); response.writeHead(500).end(String(error)) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
	browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	const page = await browser.newPage({ viewport: { width: 800, height: 600 }, hasTouch: true })
	page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
	page.setDefaultTimeout(5000)
	await page.goto(`http://127.0.0.1:${server.address().port}/fixture/list`)
	await page.waitForFunction(() => window.ready)
	const trigger = page.locator('.search-submit')
	const column  = page.locator('input[data-property-filter]')
	const reset   = page.getByRole('button', { name: 'Reset search filters' })
	const search  = page.locator('.list-filter-text')
	const submitted = () => page.evaluate(() => window.submissions.at(-1))
	const count     = () => page.evaluate(() => window.submissions.length)
	const onRight   = () => reset.evaluate((button, selector) =>
		button.getBoundingClientRect().left >= document.querySelector(selector).getBoundingClientRect().right,
	'.list-filter-text')
	assert.equal(await search.isVisible(), true)
	assert.equal(await reset.textContent(), '×')
	assert.equal(await onRight(), true)
	assert.equal(await page.locator('.search-menu').count(), 0)
	const appearance = () => trigger.evaluate(button => {
		const style = getComputedStyle(button)
		return {
			background:   style.backgroundColor,
			cell:         getComputedStyle(button.closest('th')).backgroundColor,
			outline:      style.outlineStyle,
			outlineColor: style.outlineColor,
			outlineWidth: style.outlineWidth,
			shadow:       style.boxShadow
		}
	})
	const resting = await appearance()
	await trigger.hover()
	const hovered = await appearance()
	assert.notEqual(hovered.background, resting.background)
	assert.notEqual(hovered.background, hovered.cell)
	await page.mouse.move(0, 0)
	await reset.focus()
	await page.keyboard.press('Tab')
	assert.equal(await trigger.evaluate(button => button.matches(':focus-visible')), true)
	const keyboard = await appearance()
	assert.equal(keyboard.background, hovered.background)
	assert.equal(keyboard.outline, 'solid')
	assert.equal(keyboard.outlineColor, 'rgb(128, 128, 128)')
	assert.equal(keyboard.outlineWidth, '1px')
	assert.equal(keyboard.shadow, 'none')
	await reset.focus()
	await trigger.click()
	const clicked = await appearance()
	assert.equal(clicked.outline, 'none')
	assert.equal(clicked.shadow, 'none')
	assert.equal(await count(), 1, 'A short click submits once')
	assert.equal((await submitted())['search.title'], 'Movie')
	await column.press('Enter')
	assert.equal(await count(), 2, 'Enter in a filter searches')
	assert.equal((await submitted()).reset, undefined)
	assert.equal((await submitted()).focusListColumn, 'title')
	await trigger.click()
	assert.equal((await submitted()).focusListColumn, 'title', 'The magnifier preserves column focus')
	const rect = await trigger.boundingBox()
	const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.waitForTimeout(550)
	assert.equal(await count(), 3, 'Holding the button does not activate it')
	assert.equal(await trigger.getAttribute('aria-expanded'), null)
	await page.mouse.up()
	assert.equal(await count(), 4, 'Releasing the button submits the search once')
	assert.equal((await submitted()).reset, undefined)
	await reset.press('Space')
	assert.equal(await count(), 5, 'The reset button is operable from the keyboard')
	assert.equal((await submitted()).reset, 'reset')
	assert.equal((await submitted()).focusListColumn, undefined)
	await page.setViewportSize({ width: 360, height: 640 })
	assert.equal(await onRight(), true)
	await page.evaluate(() => {
		const article = document.querySelector('main > article')
		article.replaceWith(article.cloneNode(true))
	})
	await reset.tap()
	assert.equal(await count(), 6, 'Tapping the reset button on a new list submits once')
	assert.equal((await submitted()).reset, 'reset')
	await page.goto(`http://127.0.0.1:${server.address().port}/fixture/list?empty`)
	await page.waitForFunction(() => window.ready)
	assert.equal(await reset.isVisible(), false, 'There is no reset button when the filter summary is empty')
	assert.deepEqual(errors, [])
	console.log('Search and reset: submitter, column focus, reset visibility, keyboard, touch and new list OK')
}
finally {
	await browser?.close()
	await new Promise(resolve => server.close(resolve))
	if (errors.length) console.error(errors)
}
