import { Type }               from '@itrocks/class-type'
import { Request }            from '@itrocks/request-response'
import { Reverse }            from '@itrocks/sort'
import { sortOf }             from '@itrocks/sort'
import { Option }             from '@itrocks/storage'
import { PropertyPath }       from '@itrocks/storage'
import { Sort as SortOption } from '@itrocks/storage'
import { Columns }            from './columns'
import { Parameter }          from './parameter'

interface Sorted {
	[key: string]: boolean
}

interface Sortable {
	reverse: boolean
	sort?:   number
}

export class Sort<T extends object> extends Parameter
{

	columns: Columns<T> & Sortable[]
	sorted?: Sorted

	constructor(columns: Columns<T>)
	{
		super()
		this.columns = columns as Columns<T> & Sortable[]
	}

	getParams(request: Request, type: Type<T>)
	{
		let sortProperties: string[]  | undefined
		let sortReverse:    boolean[] | undefined

		if (this.sorted) {
			sortProperties = Object.keys(this.sorted)
			sortReverse    = Object.values(this.sorted)
		}
		else {
			for (const option of this.readOptions()) {
				if (option instanceof SortOption) {
					sortProperties = option.properties.map(property => '' + property)
					sortReverse    = option.properties.map(property => property instanceof Reverse)
				}
			}
			if (!sortProperties || !sortReverse) {
				sortProperties = sortOf(type).map(property => '' + property)
				sortReverse    = sortOf(type).map(property => property instanceof Reverse)
			}
		}

		if (typeof request.data.sort === 'string'
			&& !this.columns.properties.some(column => column.name === request.data.sort && column.multiple)) {
			const reverse = 'reverse' in request.data
			const sort    = request.data.sort
			const index   = sortProperties.indexOf(sort)
			if (index >= 0) {
				sortProperties.splice(index, 1)
				sortReverse.splice(index, 1)
			}
			sortProperties.unshift(sort)
			sortReverse.unshift(reverse)
			this.sorted = undefined
		}

		if (!this.sorted) {
			this.sorted = {}
			for (const index in sortProperties) {
				this.sorted[sortProperties[index]] = sortReverse[index]
			}
		}

		for (const column of this.columns) {
			const sortIndex = sortProperties.indexOf(column.name.toString())
			column.reverse  = !!sortReverse[sortIndex]
			column.sort     = column.multiple ? undefined : (sortIndex + 1) || undefined
		}
	}

	readOptions(options = new Array<Option>)
	{
		options.push(this.sortOption())
		return options
	}

	serialize()
	{
		// Session object merges do not preserve key order; array entries preserve sort priority.
		return this.sorted && Object.entries(this.sorted)
	}

	sortOption(): SortOption | Type<SortOption>
	{
		if (!this.sorted) return SortOption
		const properties = new Array<PropertyPath>
		for (const [propertyName, reverse] of Object.entries(this.sorted)) {
			const column = this.columns.properties.find(column => column.name === propertyName)
			if (column?.multiple) continue
			for (const path of column?.sortPaths() ?? [propertyName])
				properties.push(reverse ? new Reverse(path) : path)
		}
		return new SortOption(properties)
	}

	unserialize(data: [string, boolean][])
	{
		this.sorted = Object.fromEntries(data)
	}

}
