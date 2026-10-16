import { Type }      from '@itrocks/class-type'
import { Request }   from '@itrocks/request-response'
import { Option }    from '@itrocks/storage'
import { Columns }   from './columns'
import { Parameter } from './parameter'

type Search = { [property: string]: string }

export class Filter<T extends object> extends Parameter
{

	search: Search = {}

	constructor(public columns: Columns<T>)
	{
		super()
	}

	getParams(request: Request)
	{
		for (const property of this.columns.map(property => property.name)) {
			this.search[property] ??= ''
		}
		if ('reset' in request.data) this.search = Object.fromEntries(Object.keys(this.search).map(path => [path, '']))
		const apply = (value: unknown, prefix = '') => {
			if (!value || typeof value !== 'object' || Array.isArray(value)) return
			for (const [name, child] of Object.entries(value)) {
				let decoded: string
				try { decoded = decodeURIComponent(name) }
				catch { continue }
				const path = prefix ? `${prefix}.${decoded}` : decoded
				if (typeof child === 'string' && Object.hasOwn(this.search, path)) this.search[path] = child
				else apply(child, path)
			}
		}
		apply(request.data.search)
		for (const [name, value] of Object.entries(request.data))
			if (name.startsWith('search.') && typeof value === 'string') apply({ [name.slice(7)]: value })
	}

	readOptions(options = new Array<Option>)
	{
		return options
	}

	searchObject(type: Type)
	{
		const search: Search = {}
		for (const [property, value] of Object.entries(this.search)) {
			if (value === '') continue
			search[property] = value
		}
		return Object.setPrototypeOf(search, type.prototype)
	}

	serialize()
	{
		return this.search
	}

	unserialize(data: Search)
	{
		this.search = data
	}

}
