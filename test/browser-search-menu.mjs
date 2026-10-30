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
		<input data-property-filter="title" name="search.title" value="Movie"></th>`)
	.replace('{./feed.html}', `<tr><th class="select"><input name="id" type="checkbox" value="1"></th>
		<td>Movie</td></tr>`)
	.replace('app://(type.@route)/list', '/fixture/list')
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
		response.setHeader('Content-Type', 'text/html')
		if (url.searchParams.has('offset')) { response.end('<table><tbody></tbody></table>'); return }
		response.end(`<!doctype html><html><head>
			<link rel="stylesheet" href="/@itrocks/list/list.css">
			<script type="importmap">{"imports":{"@itrocks/":"/@itrocks/"}}</script>
			<style>body { margin:20px; font:14px sans-serif } input { box-sizing:border-box }
				#outside { position:fixed; right:20px; top:20px }</style>
			</head><body><main>${article}</main><button id="outside">Outside</button>
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
	const menu    = page.locator('.search-menu')
	const reset   = menu.locator('.reset')
	const count   = () => page.evaluate(() => window.submissions.length)
	const width   = await page.locator('th.select').first().evaluate(cell => cell.getBoundingClientRect().width)
	assert.equal(await menu.isVisible(), false)
	await trigger.click()
	assert.equal(await count(), 1, 'A short click submits once')
	assert.equal(await page.evaluate(() => window.submissions[0]['search.title']), 'Movie')
	assert.equal(await page.locator('input[name=select]').isChecked(), false)
	await page.locator('input[data-property-filter]').press('Enter')
	assert.equal(await count(), 2, 'Enter in a filter searches')
	await trigger.click({ button: 'right' })
	await menu.waitFor({ state: 'visible' })
	assert.deepEqual((await menu.locator('button').allTextContents()).map(text => text.trim()),
		['Search', 'Reset search filters'])
	assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
	assert.equal(await count(), 2, 'Right-click never submits')
	assert.equal(await page.locator('th.select').first().evaluate(cell => cell.getBoundingClientRect().width), width)
	await menu.locator('.search').click()
	assert.equal(await count(), 3, 'Menu search submits once')
	await trigger.click({ button: 'right' })
	await reset.click()
	assert.equal(await count(), 4)
	assert.equal(await page.evaluate(() => window.submissions.at(-1).reset), 'reset')
	assert.equal(await menu.isVisible(), false)
	await trigger.focus()
	await trigger.press('ArrowDown')
	await menu.locator('.search').press('ArrowDown')
	assert.equal(await reset.evaluate(button => button === document.activeElement), true)
	await reset.press('Escape')
	assert.equal(await trigger.evaluate(button => button === document.activeElement), true)
	await trigger.press('Shift+F10')
	await menu.waitFor({ state: 'visible' })
	await page.locator('#outside').click()
	await menu.waitFor({ state: 'hidden' })
	const rect = await trigger.boundingBox()
	const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
	await page.mouse.move(x, y)
	await page.mouse.down()
	await menu.waitFor({ state: 'visible' })
	await page.mouse.up()
	assert.equal(await count(), 4, 'Releasing a mouse long press never submits')
	await page.keyboard.press('Escape')
	const cdp = await page.context().newCDPSession(page)
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
	await menu.waitFor({ state: 'visible' })
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
	assert.equal(await count(), 4, 'Releasing a touch long press never submits')
	await reset.tap()
	assert.equal(await count(), 5, 'Touch reset submits once')
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
	await page.waitForTimeout(600)
	assert.equal(await menu.isVisible(), false, 'A cancelled touch never opens a menu')
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + 30, y + 30)
	await page.waitForTimeout(600)
	assert.equal(await menu.isVisible(), false, 'Movement cancels the long press')
	await page.mouse.up()
	await trigger.click()
	assert.equal(await count(), 6, 'Normal clicks still work after a long press')
	await page.evaluate(() => {
		const form = document.querySelector('form')
		const parent = form.parentNode
		form.remove()
		parent.append(form)
	})
	await trigger.click({ button: 'right' })
	await reset.click()
	assert.equal(await count(), 7, 'Reinsertion does not duplicate event handlers')
	await page.setViewportSize({ width: 360, height: 640 })
	await trigger.click({ button: 'right' })
	const bounds = await menu.boundingBox()
	assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 360, 'The menu fits the mobile viewport')
	await page.screenshot({ path: '/tmp/list-search-menu-mobile.png' })
	assert.deepEqual(errors, [])
	console.log('Search menu: click, Enter, right-click, mouse/touch long press, reset, keyboard, dismissal and width OK')
}
finally {
	await browser?.close()
	await new Promise(resolve => server.close(resolve))
	if (errors.length) console.error(errors)
}
