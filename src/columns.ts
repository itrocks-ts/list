import { Type }             from '@itrocks/class-type'
import { ListReflectClass } from '@itrocks/list-properties'
import { Request }          from '@itrocks/request-response'
import { Option }           from '@itrocks/storage'
import { dataSource }       from '@itrocks/storage'
import { Identifiers }      from '@itrocks/storage'
import { ProjectionCell }   from '@itrocks/storage'
import { ProjectionResult } from '@itrocks/storage'
import { SearchType }       from '@itrocks/storage'
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
	const result = await dataSource().select(type, singular.map(column => column.selection()), search, options)
	if (!columns.some(column => column.multiple) || !result.rows.length) return result
	const ids = result.rows.map(row => row.rootId)
	const objects = await dataSource().search(type, search, [new Identifiers(ids)])
	const byId = new Map(objects.map(object => [String(object.id), object]))
	return {
		rootType: type,
		columns: columns.map(column => ({ path: column.name, kind: column.multiple ? 'scalar' :
			result.columns[singular.indexOf(column)].kind })),
		rows: await Promise.all(result.rows.map(async row => {
			const object = byId.get(String(row.rootId))
			const cells = await Promise.all(columns.map(async column => {
				if (!column.multiple) return row.cells[singular.indexOf(column)]
				const value = object ? await object[column.name as keyof T] : []
				return { kind: 'value' as const, value: value ?? [] } satisfies ProjectionCell
			}))
			return { rootId: row.rootId, cells }
		}))
	}
}
