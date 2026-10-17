import assert            from 'node:assert/strict'
import { execFileSync }  from 'node:child_process'
import { mkdtemp }       from 'node:fs/promises'
import { rm }            from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer }  from 'node:net'
import { tmpdir }        from 'node:os'
import { join }          from 'node:path'
import { fileURLToPath } from 'node:url'

// Real framework/list/table integration against the existing synthetic recipe database (default port 13316).
// PS_TOGGLE_URL can target an already running instance of that same recipe.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PS_PLAYWRIGHT_MODULE
	|| '/home/baptiste/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const recipe = fileURLToPath(new URL('../../property-select/docs/orchestration/environment/', import.meta.url))
let directory, environment, browser
let origin = process.env.PS_TOGGLE_URL
const errors = []
const columns = ['number', 'amount', 'issuedAt', 'note', 'active', 'p0',
	'customer.name', 'customer.address.street', 'deliveryAddress.street']
const path = 'customer.address.street'
const row = (page, value = path) => page.locator(`.ps-property[data-path="${value}"]`)
const header = (page, value = path) => page.locator(`th[data-property="${value}"]`)
const main = (page, value = path) => page.locator(`.ps-main[data-path="${value}"]`)
async function ready(url)
{
	for (let attempt = 0; attempt < 100; attempt ++) {
		try { if ((await fetch(url)).ok) return } catch {}
		await new Promise(resolve => setTimeout(resolve, 100))
	}
	throw new Error('The synthetic recipe did not start')
}
async function change(page, action)
{
	const saved = page.waitForResponse(response => response.url().includes('columns='))
	void saved.catch(() => {})
	await action()
	assert.equal((await saved).status(), 204)
}
async function root(page)
{
	await page.locator('.ps-level[data-path=""]').click()
	await page.waitForFunction(() => document.querySelector('.ps-level[aria-current]')?.dataset.path === '')
}
async function open(page)
{
	await page.locator('.add-column:not([hidden])').click()
	await page.locator('.ps-query').waitFor({ state: 'visible' })
}
try {
	if (!origin) {
		directory = await mkdtemp(join(tmpdir(), 'list-column-toggle-'))
		const socket = createServer()
		await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
		const port = socket.address().port
		await new Promise(resolve => socket.close(resolve))
		environment = { ...process.env, PS_ENV_DIRECTORY: directory, PS_APP_PORT: String(port),
			PS_FRAMEWORK_INITIALIZER: join(recipe, 'session/fixture.cjs') }
		execFileSync(process.execPath, [join(recipe, 'control.mjs'), 'app'], { env: environment })
		origin = `http://127.0.0.1:${port}`
	}
	await ready(origin + '/property-select-invoice')
	browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	for (const mobile of [false, true]) {
		const context = await browser.newContext({ hasTouch: mobile, isMobile: mobile, locale: 'fr-FR',
			reducedMotion: mobile ? 'reduce' : 'no-preference',
			viewport: { width: mobile ? 390 : 1000, height: 844 } })
		const page = await context.newPage()
		page.on('pageerror', error => errors.push(error.message))
		await page.goto(origin + '/property-select-invoice')
		await page.locator('.add-column:not([hidden])').waitFor()
		const response = await context.request.get(origin + '/property-select-invoice/list?'
			+ new URLSearchParams({ columns: columns.join(',') }))
		assert.equal(response.status(), 204)
		await page.reload()
		await open(page)
		assert.equal(await page.locator('.right-pane-title-bar > h2').textContent(), 'Ajouter des colonnes')
		assert.equal(await page.locator('.ps-clear').getAttribute('title'), 'Effacer la recherche')
		assert.equal(await page.locator('.ps-clear').getAttribute('aria-label'), 'Effacer la recherche')
		assert.ok(await row(page).evaluate(row => row.classList.contains('ps-used')))
		if (!mobile) {
			// The plus must reveal an existing terminal column without removing or saving it.
			const plus = row(page, 'deliveryAddress.street').locator('.ps-add')
			await row(page, 'deliveryAddress.street').hover()
			await plus.click()
			await page.locator('th.column-add-highlight[data-property="deliveryAddress.street"]').waitFor()
			assert.equal(await header(page, 'deliveryAddress.street').count(), 1)
			assert.equal(await page.locator('th.column-remove-highlight').count(), 0)
			await page.waitForTimeout(400)
			assert.equal(await header(page, 'deliveryAddress.street').count(), 1)
		}
		await page.locator('table.objects').evaluate(table => { table.scrollLeft = 0 })
		const before = await header(page, 'deliveryAddress.street').boundingBox()
		const table = await page.locator('table.objects').boundingBox()
		assert.ok(before.x + before.width > table.x + table.width,
			'The target column starts outside the horizontal viewport')
		const saved = page.waitForResponse(response => response.url().includes('columns='))
		void saved.catch(() => {})
		if (mobile) await main(page, 'deliveryAddress.street').tap()
		else await main(page, 'deliveryAddress.street').click()
		await page.locator('th.column-remove-highlight[data-property="deliveryAddress.street"]')
			.waitFor({ state: mobile ? 'attached' : 'visible' })
		const flash = await header(page, 'deliveryAddress.street').evaluate(cell => {
			const table = cell.closest('table')
			const rect = cell.getBoundingClientRect(), bounds = table.getBoundingClientRect()
			return { animation: getComputedStyle(cell).animationName,
				left: rect.left, right: rect.right, scroll: table.scrollLeft, tableRight: bounds.right,
				marked: [...table.rows].every(row => row.cells[cell.cellIndex]
					.classList.contains('column-remove-highlight')) }
		})
		assert.ok(flash.marked)
		assert.ok(flash.scroll > 0 && flash.right <= flash.tableRight + 1)
		assert.equal(flash.animation, mobile ? 'none' : 'itrocks-column-remove-flash')
		await header(page, 'deliveryAddress.street').waitFor({ state: 'detached' })
		assert.equal((await saved).status(), 204)
		assert.equal(await row(page, 'deliveryAddress.street').count(), 1)
		assert.equal(await row(page, 'deliveryAddress.street').evaluate(row => row.classList.contains('ps-used')), false)
		// Restore a removed root row through a real activation, without losing its ordered path segments.
		await change(page, () => main(page, 'deliveryAddress.street').click())
		await page.locator('.ps-used[data-path="deliveryAddress.street"]').waitFor()
		await change(page, () => main(page).click())
		await header(page).waitFor({ state: 'detached' })
		assert.equal(await row(page).count(), 1)
		await row(page).locator('button[data-path="customer.address"]').click()
		await page.waitForFunction(() =>
			document.querySelector('.ps-level[aria-current]')?.dataset.path === 'customer.address')
		assert.equal(await header(page).count(), 0, 'Intermediate segments navigate without adding columns')
		await root(page)
		assert.equal(await row(page).count(), 0, 'Navigation discards unused temporary rows')
		await main(page, 'customer').click()
		await main(page, 'customer.address').click()
		await change(page, () => main(page).click())
		await root(page)
		await page.locator('.ps-used[data-path="customer.address.street"]').waitFor()
		await change(page, () => main(page).click())
		assert.equal(await row(page).count(), 1)
		await page.locator('.ps-query').fill('unmatched-toggle-query')
		await page.waitForFunction(() => document.querySelector('.property-select').dataset.searchStatus !== 'loading')
		await page.locator('.ps-clear').click()
		assert.equal(await row(page).count(), 0, 'Search discards unused temporary rows')
		// Direct fields remain available and support native keyboard activation as well as touch.
		await change(page, async () => {
			if (mobile) await main(page, 'note').tap()
			else { await main(page, 'note').focus(); await page.keyboard.press('Enter') }
		})
		assert.equal(await header(page, 'note').count(), 0)
		assert.equal(await row(page, 'note').count(), 1)
		await change(page, async () => {
			if (mobile) await main(page, 'note').tap()
			else { await main(page, 'note').focus(); await page.keyboard.press('Space') }
		})
		await header(page, 'note').waitFor()
		// Recreate and remove a nested column, then verify both list lifecycle transitions.
		await main(page, 'customer').click()
		await main(page, 'customer.address').click()
		await change(page, () => main(page).click())
		await root(page)
		await page.locator('.ps-used[data-path="customer.address.street"]').waitFor()
		await change(page, () => main(page).click())
		assert.equal(await row(page).count(), 1)
		await page.reload()
		await open(page)
		assert.equal(await header(page).count(), 0)
		assert.equal(await row(page).count(), 0, 'Refresh never restores a removed temporary row')
		await main(page, 'customer').click()
		await main(page, 'customer.address').click()
		await change(page, () => main(page).click())
		await root(page)
		await page.locator('.ps-used[data-path="customer.address.street"]').waitFor()
		await change(page, () => main(page).click())
		assert.equal(await row(page).count(), 1)
		await page.goto(origin + '/country')
		await page.goto(origin + '/property-select-invoice')
		await open(page)
		assert.equal(await row(page).count(), 0, 'Leaving and reopening the list discards temporary rows')
		assert.equal(await header(page).count(), 0, 'Removed columns remain absent in session configuration')
		console.log(`PASS real list: ${mobile ? 'touch/reduced motion' : 'desktop/keyboard'}, horizontal reveal, red flash,`
			+ ' toggle, temporary rows, navigation, search, refresh and re-entry')
		await context.close()
	}
	assert.deepEqual(errors, [])
}
finally {
	await browser?.close()
	if (environment) {
		execFileSync(process.execPath, [join(recipe, 'control.mjs'), 'stop-app'], { env: environment })
		await rm(directory, { recursive: true, force: true })
	}
}
