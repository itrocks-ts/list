import assert            from 'node:assert/strict'
import { execFileSync }  from 'node:child_process'
import { existsSync }    from 'node:fs'
import { mkdtemp, rm }   from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer }  from 'node:net'
import { tmpdir }        from 'node:os'
import { join }          from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PS_PLAYWRIGHT_MODULE
	|| '/home/baptiste/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const recipe = fileURLToPath(new URL('../../property-select/docs/orchestration/environment/', import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 'list-component-batch-'))
const pause = () => new Promise(resolve => setTimeout(resolve, 100))
async function port()
{
	const server = createServer()
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const port = server.address().port
	await new Promise(resolve => server.close(resolve))
	return String(port)
}
const environment = { ...process.env, PS_ENV_DIRECTORY: directory, PS_APP_PORT: await port(),
	PS_DATABASE_PORT: await port(), PS_FRAMEWORK_INITIALIZER: fileURLToPath(new URL('./fixtures/component-batch.cjs',
		import.meta.url)) }
const origin = `http://127.0.0.1:${environment.PS_APP_PORT}`
const control = command => execFileSync(process.execPath, [join(recipe, 'control.mjs'), command],
	{ env: environment, stdio: 'pipe' })
let browser
let appStarted = false
try {
	control('database')
	let connected = false
	for (let attempt = 0; attempt < 100; attempt ++) {
		try {
			execFileSync('mysqladmin', ['--no-defaults', `--socket=${directory}/mysql.sock`, '-u', 'root', 'ping'],
				{ stdio: 'pipe' })
			connected = true
			break
		}
		catch { await pause() }
	}
	assert.ok(connected, `Database did not start: ${directory}`)
	control('reset')
	control('app')
	appStarted = true
	let ready = false
	for (let attempt = 0; attempt < 100; attempt ++) {
		try { if ((await fetch(origin + '/property-select-invoice')).ok) { ready = true; break } }
		catch {}
		await pause()
	}
	assert.ok(ready, `Application did not start: ${directory}`)
	browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
	const errors = [], requests = []
	page.on('pageerror', error => errors.push(error.message))
	page.on('request', request => {
		const url = new URL(request.url())
		if (url.searchParams.has('column') || url.searchParams.has('loadColumns') || url.searchParams.has('columns'))
			requests.push(url)
	})
	const observations = async () => (await page.request.get(origin + '/property-select-observation/probe/json')).json()
	const headers = () => page.locator('thead [data-property]')
	const values = path => page.locator(`th[data-property="${path}"]`).evaluate(header =>
		[...header.closest('table').tBodies[0].rows].map(row => ({
			id: row.querySelector('input[name=id]').value, value: row.cells[header.cellIndex].textContent
		})))
	const open = async () => {
		await page.locator('.add-column:not([hidden])').click()
		await page.locator('.ps-group[data-path="lines"]').waitFor({ state: 'visible' })
	}
	const group = () => page.locator('.ps-group[data-path="lines"]')
	const startFrames = () => page.evaluate(() => {
		window.batchFrames = []
		window.watchBatch = true
		const sample = () => {
			if (!window.watchBatch) return
			const headers = [...document.querySelectorAll('th[data-property^="lines."]')]
			const times = name => headers.flatMap(header => header.getAnimations()
				.filter(animation => animation.animationName === name && animation.startTime !== null)
				.map(animation => animation.startTime))
			window.batchFrames.push({
				checked: document.querySelectorAll('.ps-component .ps-check:checked').length,
				green: headers.filter(header => header.classList.contains('column-add-highlight')).length,
				red: headers.filter(header => header.classList.contains('column-remove-highlight')).length,
				greenTimes: times('itrocks-column-add-flash'), redTimes: times('itrocks-column-remove-flash')
			})
			requestAnimationFrame(sample)
		}
		requestAnimationFrame(sample)
	})
	const endFrames = async colour => {
		await page.waitForTimeout(400)
		const frames = await page.evaluate(() => { window.watchBatch = false; return window.batchFrames })
		assert.ok(frames.some(frame => frame[colour] === 3), 'Every group column flashes')
		assert.ok(frames.every(frame => frame[colour] === 0 || frame[colour] === 3), 'No partial group flash')
		assert.ok(frames.every(frame => frame.checked === 0 || frame.checked === 3), 'Checkboxes change together')
		const timings = frames.map(frame => frame[`${colour}Times`]).filter(times => times.length === 3)
		assert.ok(timings.length, 'Real CSS animations were observed')
		assert.ok(timings.every(times => Math.max(...times) - Math.min(...times) < 1),
			'All group animations start at the same time')
	}
	await page.goto(origin + '/property-select-invoice')
	await open()
	const before = (await observations()).length
	let first = requests.length
	await startFrames()
	await group().locator('.ps-main').click()
	await page.waitForFunction(() => document.querySelector('.ps-group[data-path="lines"] input')?.checked)
	await endFrames('green')
	assert.equal(requests.length - first, 1, 'One request adds every missing component column')
	assert.equal(requests.at(-1).searchParams.get('loadColumns').split(',').length, 3)
	assert.equal((await observations()).slice(before).filter(query => /^SELECT/i.test(query.sql)).length, 2,
		'One root-scope query and one component query load all fields for every visible row')
	const labels = await values('lines.label')
	assert.equal(labels.find(row => row.id === '1').value, 'Recipe A, Recipe B, Recipe A')
	assert.ok(!labels.some(row => row.id === '2'), 'Mandatory list scope excludes inactive roots')
	assert.equal((await values('lines.quantity')).find(row => row.id === '1').value, '2, 1, 2')
	assert.equal((await values('lines.invoice')).find(row => row.id === '1').value, 'REC-001, REC-001, REC-001')
	assert.equal(await page.locator('.column-add-error').count(), 0)
	first = requests.length
	const beforeRemoval = (await observations()).length
	await startFrames()
	await group().locator('.ps-main').click()
	await page.locator('th[data-property="lines.label"]').waitFor({ state: 'detached' })
	await page.locator('th[data-property="lines.quantity"]').waitFor({ state: 'detached' })
	await page.locator('th[data-property="lines.invoice"]').waitFor({ state: 'detached' })
	await endFrames('red')
	assert.equal(requests.length - first, 1, 'One request saves every group removal')
	assert.equal((await observations()).length, beforeRemoval, 'Removal performs no data query')
	await page.reload()
	await open()
	assert.equal(await headers().count(), 2, 'Group removal survives reload')
	await page.request.get(origin + '/property-select-invoice/list?columns=number,amount,lines.label')
	await page.reload()
	await open()
	first = requests.length
	await group().locator('.ps-main').click()
	await page.waitForFunction(() => document.querySelector('.ps-group[data-path="lines"] input')?.checked)
	await page.waitForFunction(() => [...document.querySelectorAll('th[data-property^="lines."]')].length === 3
		&& !document.querySelector('th[data-property^="lines."].column-add-loading'))
	assert.equal(requests.length - first, 1)
	assert.deepEqual(new Set(requests.at(-1).searchParams.get('loadColumns').split(',')),
		new Set(['lines.invoice', 'lines.quantity']), 'Already present columns are excluded from the batch')
	await page.reload()
	assert.equal(await headers().count(), 5, 'Added group columns survive reload')
	assert.equal((await values('lines.label')).find(row => row.id === '1').value, 'Recipe A, Recipe B, Recipe A')
	// Deliver responses before and after the animation deadline, for individual and group clicks.
	await page.request.get(origin + '/property-select-invoice/list?columns=number,amount')
	await page.reload()
	await open()
	let timing
	const departures = []
	await page.route('**/property-select-invoice/list?*', async route => {
		const current = timing
		const snapshot = await page.evaluate(({ paths, selected }) => ({
			checked: document.querySelectorAll('.ps-component .ps-check:checked').length,
			flashes: paths.filter(path => document.querySelector(`th[data-property="${path}"]`)
				?.classList.contains(selected ? 'column-add-highlight' : 'column-remove-highlight')).length
		}), current)
		const departure = { ...snapshot, replied: false, started: Date.now(), elapsed: 0 }
		departures.push(departure)
		const response = await route.fetch()
		await new Promise(resolve => setTimeout(resolve, current.delay))
		await route.fulfill({ response })
		departure.replied = true
		departure.elapsed = Date.now() - departure.started
	})
	for (const grouped of [true, false]) for (const delay of [40, 700]) for (const selected of [true, false]) {
		const paths = grouped ? ['lines.invoice', 'lines.label', 'lines.quantity'] : ['lines.label']
		timing = { delay, paths, selected }
		const count = requests.length
		const reply = page.waitForResponse(response => response.url().startsWith(origin + '/property-select-invoice/list?'))
		const button = grouped ? group().locator('.ps-main')
			: page.locator('.ps-component[data-path="lines.label"] .ps-check')
		await button.click()
		assert.equal(await page.locator('.ps-component .ps-check:checked').count(), selected ? paths.length : 0,
			'Checkboxes reflect the click before the response')
		await page.waitForTimeout(120)
		const departure = departures.at(-1)
		assert.equal(requests.length - count, 1, 'Exactly one request per individual or group click')
		assert.deepEqual({ checked: departure.checked, flashes: departure.flashes },
			{ checked: selected ? paths.length : 0, flashes: paths.length },
			'Checkboxes and animations are already updated when the request leaves')
		if (selected && delay === 40) {
			await reply
			await page.waitForFunction(() => !document.querySelector('th[data-property="lines.label"]')
				?.classList.contains('column-add-loading'))
			assert.equal(await page.locator('tbody tr:first-child td.column-add-values-hidden').count(), paths.length,
				`Early data stays masked until the animation finishes (reply ${departure.elapsed} ms)`)
		}
		await page.waitForTimeout(300)
		if (!selected) {
			for (const path of paths) assert.equal(await page.locator(`th[data-property="${path}"]`).count(), 0,
				'Front-end deletion finishes without waiting for the response')
		}
		else assert.equal(await page.locator('thead .column-add-highlight').count(), 0,
			'The addition flash ends without waiting for values')
		if (delay === 700) assert.equal(departure.replied, false, 'Animation finishes before the delayed response')
		await reply
		if (selected) {
			await page.waitForFunction(() => !document.querySelector('th[data-property="lines.label"]')
				?.classList.contains('column-add-loading'))
			assert.equal(await page.locator('tbody .column-add-values-hidden').count(), 0)
			assert.equal((await values('lines.label')).find(row => row.id === '1').value,
				'Recipe A, Recipe B, Recipe A')
			assert.equal(await page.locator('thead .column-add-highlight').count(), 0, 'Late values never restart the flash')
		}
	}
	await page.unroute('**/property-select-invoice/list?*')
	assert.deepEqual(errors, [])
	console.log('PASS real MySQL + HTTP + browser: one group request, two batched SELECTs, loaded values, scope, '
		+ 'immediate checkboxes, early/late responses, independent animations/deletion and reload')
}
finally {
	await browser?.close()
	if (appStarted || existsSync(join(directory, 'mysql.pid'))) control('stop')
	await rm(directory, { recursive: true, force: true })
}
