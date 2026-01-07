import { Type }               from '@itrocks/class-type'
import { Request }            from '@itrocks/request-response'
import { Reverse }            from '@itrocks/sort'
import { sortOf }             from '@itrocks/sort'
import { Option }             from '@itrocks/storage'
import { Sort as SortOption } from '@itrocks/storage'
import { Columns }            from './columns'
import { Parameter }          from './parameter'

interface Serialized {
	[key: string]: boolean
}

interface Sortable {
	reverse: boolean
	sort?:   number
}

export class Sort<T extends object> extends Parameter
{

	columns: Columns<T> & Sortable[]
	sorted?: Serialized

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

		if (typeof request.data.sort === 'string') {
			const reverse = 'reverse' in request.data
			const sort    = request.data.sort
			const index   = sortProperties.indexOf(sort)
			if (index < 0) return
			sortProperties.splice(index, 1)
			sortProperties.unshift(sort)
			sortReverse.splice(index, 1)
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
			const sortIndex = sortProperties.indexOf(column.name)
			column.reverse  = sortReverse[sortIndex]
			column.sort     = (sortIndex > -1) ? (sortIndex + 1) : undefined
		}
	}

	readOptions(options = new Array<Option>)
	{
		options.push(SortOption)
		return options
	}

	serialize()
	{
		return this.sorted
	}

	unserialize(data: Serialized)
	{
		this.sorted = data
	}

}
