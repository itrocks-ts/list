import { Type }                from '@itrocks/class-type'
import { Request }             from '@itrocks/request-response'
import { resolvePropertyPath } from '@itrocks/reflect-path'
import { between }             from '@itrocks/sql-functions'
import { equal }               from '@itrocks/sql-functions'
import { greater }             from '@itrocks/sql-functions'
import { greaterOrEqual }      from '@itrocks/sql-functions'
import { less }                from '@itrocks/sql-functions'
import { lessOrEqual }         from '@itrocks/sql-functions'
import { like }                from '@itrocks/sql-functions'
import { notEqual }            from '@itrocks/sql-functions'
import { notLike }             from '@itrocks/sql-functions'
import { Option }              from '@itrocks/storage'
import { SearchType }          from '@itrocks/storage'
import { Columns }             from './columns'
import { dateSearch }          from './date-search'
import { Parameter }           from './parameter'

type Search = { [property: string]: string }

const operators = {
	'!':  notEqual,
	'!=': notEqual,
	'<':  less,
	'<=': lessOrEqual,
	'<>': notEqual,
	'=':  equal,
	'>':  greater,
	'>=': greaterOrEqual
}

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
		const search: SearchType = {}
		for (const [property, value] of Object.entries(this.search)) {
			if (value === '') continue
			const comparison   = value.match(/^(>=|<=|<>|!=|>|<|=|!)(.*)$/s)
			const operator     = comparison ? operators[comparison[1] as keyof typeof operators] : undefined
			const operand      = comparison ? comparison[2].trim() : value
			const propertyType = resolvePropertyPath(type, property).property.type.type
			if (propertyType === Date) {
				search[property] = dateSearch(operand, comparison?.[1])
				continue
			}
			if (/[*?]/.test(operand) && (!operator || operator === notEqual)) {
				const compare    = operator ? notLike : like
				search[property] = compare(operand.replaceAll('*', '%').replaceAll('?', '_'))
				continue
			}
			if (operator) {
				search[property] = operator(operand)
				continue
			}
			const separator = value.indexOf('-')
			if (separator < 0) {
				const text       = propertyType === String
				search[property] = (text ? like(value + '%') : value)
				continue
			}
			const lower = value.slice(0, separator).trim()
			const upper = value.slice(separator + 1).trim()
			if (lower && upper) search[property] = between(lower, upper)
			else if (lower)     search[property] = greaterOrEqual(lower)
			else if (upper)     search[property] = lessOrEqual(upper)
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
