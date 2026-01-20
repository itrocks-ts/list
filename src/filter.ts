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
			this.search[property] = ''
		}
		for (const [property, search] of Object.entries(request.data.search ?? {})) {
			if (!(property in this.search)) continue
			this.search[property] = search
		}
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
