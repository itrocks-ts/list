import { Type }             from '@itrocks/class-type'
import { ListReflectClass } from '@itrocks/list-properties'
import { Request }          from '@itrocks/request-response'
import { Option }           from '@itrocks/storage'
import { dataSource }       from '@itrocks/storage'
import { Identifiers }      from '@itrocks/storage'
import { ProjectionCell }   from '@itrocks/storage'
import { ProjectionResult } from '@itrocks/storage'
import { SearchType }       from '@itrocks/storage'
import { Selection }        from '@itrocks/storage'
import { Sort }             from '@itrocks/storage'
import { Parameter }        from './parameter'
import { ListColumn }       from './projection'

export class Columns<T extends object> extends Parameter implements Iterable<ListColumn>
{

	private configured = false
	properties: ListColumn[] = [];

	[Symbol.iterator]()
	{
		return this.properties[Symbol.iterator]()
	}

	getParams(request: Request, type: Type<T>)
	{
		const data = request.data.columns
		if (data !== undefined) {
			const names = (Array.isArray(data) ? data : [data]).flatMap(
				property => (typeof property === 'string') ? (property ? property.split(',') : []) : property
			)
			if (names.every((name): name is string => typeof name === 'string') && new Set(names).size === names.length) {
				try {
					const properties = names.map(name => new ListColumn(type, name))
					this.properties = properties
					this.configured = true
				}
				catch { /* Invalid saved requests preserve the previous configuration. */ }
			}
		}
		if (!this.configured && !this.length)
			this.properties = new ListReflectClass(type).listProperties().map(property =>
				new ListColumn(type, String(property.name)))
		this.configured = true
	}

	get length()
	{
		return this.properties.length
	}

	map<R>(callback: (value: ListColumn) => R): R[]
	{
		return this.properties.map(callback)
	}

	async projected(result: ProjectionResult)
	{
		if (result.columns.some((column, index) => column.path !== this.properties[index]?.name)
			|| result.columns.length !== this.length) throw new Error('Projection columns do not match the list')
		return Promise.all(result.rows.map(async row => ({
			id: row.rootId,
			properties: await Promise.all(row.cells.map(async (cell, index) => ({
				outputOptionalContainer: await this.properties[index].output(cell)
			})))
		})))
	}

	readOptions(options = new Array<Option>)
	{
		return options
	}

	remove(name: string)
	{
		this.properties = this.properties.filter(property => property.name !== name)
	}

	serialize()
	{
		return this.properties.map(property => property.name)
	}

	unserialize(data: string[], type: Type<T>)
	{
		this.properties = data.flatMap(name => {
			try { return [new ListColumn(type, name)] }
			catch { return [] }
		})
		this.configured = true
	}

	unshift(property: ListColumn)
	{
		return this.properties.unshift(property)
	}

}

export async function projectColumns<T extends object>(
	type: Type<T>, columns: readonly ListColumn[], search: SearchType<T>, options: Option[]
): Promise<ProjectionResult<T>>
{
	const singular = columns.filter(column => !column.multiple)
	const selections: Selection[] = singular.map(column => column.selection())
	const parents = [...new Set(columns.flatMap(column => column.component?.parent ? [column.component.parent] : []))]
		.filter(path => !singular.some(column => column.name === path))
	selections.push(...parents.map(path => ({ path, objectFields: [] })))
	const result = await dataSource().select(type, selections, search, options)
	if (!columns.some(column => column.multiple)) return result
	const projectedColumns = columns.map(column => ({ path: column.name, kind: column.multiple ? 'scalar' as const :
		result.columns[singular.indexOf(column)].kind }))
	if (!result.rows.length) return { ...result, columns: projectedColumns }
	const ids = result.rows.map(row => row.rootId)
	const direct = columns.filter(column => column.multiple && !column.component)
	const objects = direct.length ? await dataSource().search(type, search, [new Identifiers(ids)]) : []
	const byId = new Map(objects.map(object => [String(object.id), object]))
	const components = new Map<string, Map<string, ProjectionCell[]>>()
	for (const path of new Set(columns.flatMap(column => column.component ? [column.component.path] : []))) {
		const grouped = columns.filter(column => column.component?.path === path)
		const component = grouped[0].component!
		const parentIds = result.rows.map(row => {
			if (!component.parent) return row.rootId
			const index = singular.findIndex(column => column.name === component.parent)
			const cell = row.cells[index < 0 ? singular.length + parents.indexOf(component.parent) : index]
			return cell.kind === 'value' ? (cell.value as { id: string | number } | null)?.id : undefined
		})
		const selectedIds = [...new Set(parentIds.filter((id): id is string | number => id !== undefined))]
		const selections = new Map<string, Selection>([
			[component.inverse, { path: component.inverse, objectFields: [] }]
		])
		for (const column of grouped) selections.set(column.component!.column.name, column.component!.column.selection())
		const names = [...selections.keys()]
		const values = selectedIds.length ? await dataSource().select(component.type, [...selections.values()],
			{ [component.inverse]: selectedIds }, [new Sort([])]) : undefined
		for (const column of grouped) {
			const byParent = new Map<string, ProjectionCell[]>()
			for (const row of values?.rows ?? []) {
				const owner = row.cells[0]
				if (owner.kind !== 'value' || !owner.value) continue
				const id = String((owner.value as { id: string | number }).id)
				let cells = byParent.get(id)
				if (!cells) byParent.set(id, cells = [])
				cells.push(row.cells[names.indexOf(column.component!.column.name)])
			}
			components.set(column.name, new Map(result.rows.map((row, index) =>
				[String(row.rootId), byParent.get(String(parentIds[index])) ?? []])))
		}
	}
	return {
		rootType: type,
		columns: projectedColumns,
		rows: await Promise.all(result.rows.map(async row => {
			const object = byId.get(String(row.rootId))
			const cells = await Promise.all(columns.map(async column => {
				if (!column.multiple) return row.cells[singular.indexOf(column)]
				if (column.component) return { kind: 'value' as const,
					value: components.get(column.name)!.get(String(row.rootId)) ?? [] }
				const value = object ? await object[column.name as keyof T] : []
				return { kind: 'value' as const, value: value ?? [] } satisfies ProjectionCell
			}))
			return { rootId: row.rootId, cells }
		}))
	}
}
