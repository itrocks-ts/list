import assert       from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readdir }  from 'node:fs/promises'
import test         from 'node:test'

test('delivered server imports declare their direct runtime dependencies', async () => {
	const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
	const missing = new Set()
	for (const file of await readdir(new URL('../cjs/', import.meta.url))) {
		if (!file.endsWith('.js')) continue
		const source = await readFile(new URL(`../cjs/${file}`, import.meta.url), 'utf8')
		for (const match of source.matchAll(/require\(['"](@itrocks\/[^/'"]+)(?:\/[^'"]*)?['"]\)/g))
			if (!manifest.dependencies[match[1]]) missing.add(match[1])
	}
	assert.deepEqual([...missing].sort(), [])
})
