import type { Type }           from '@itrocks/class-type'
import { resolvePropertyPath } from '@itrocks/reflect-path'
import type { ListView }       from './access'
import type { ListColumn }     from './projection'

const fieldPart   = /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u
const quotedValue = /[\s"]|^(?:!=|<>|[!=<>]=?)?'/

export function escapeFilterText(text: string): string
{
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function filterAliases(type: Type, columns: Iterable<Pick<ListColumn, 'label' | 'name'>>): Map<string, string>
{
	const labels = new Map<string, string[]>()
	for (const { label, name } of columns) {
		const alias = label.toLowerCase()
		if (!alias.split('.').every(part => fieldPart.test(part))) continue
		labels.set(alias, [...(labels.get(alias) ?? []), name])
	}

	const aliases = new Map<string, string>()
	for (const [alias, names] of labels) {
		if ((names.length !== 1) || (alias === names[0])) continue
		try {
			// A real property path always takes precedence over a translated label.
			resolvePropertyPath(type, alias)
		}
		catch {
			aliases.set(alias, names[0])
		}
	}

	return aliases
}

export function filterEntries(search: Record<string, string>, aliases: ReadonlyMap<string, string>)
{
	const labels = new Map([...aliases].map(([alias, path]) => [path, alias]))
	return Object.entries(search)
		.filter(([, value]) => value !== '')
		.map(([path, value]) => ({
			field: labels.get(path) ?? path,
			value: quotedValue.test(value) ? '"' + value.replace(/[\\"]/g, '\\$&') + '"' : value
		}))
}

export function filterSummary(search: Record<string, string>, aliases: ReadonlyMap<string, string>): ListView
{
	const entries = filterEntries(search, aliases)
	const items   = entries.map(({ field, value }, index) => ({
		caption: escapeFilterText(field + ':'),
		space:   (index + 1 < entries.length) ? ' ' : '',
		value:   escapeFilterText(value)
	}))

	return { criteria: items.length ? { items } : undefined, template: './filter-summary.html' }
}
