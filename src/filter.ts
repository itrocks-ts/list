import { Type }                from '@itrocks/class-type'
import { representativeOf }    from '@itrocks/class-view'
import { resolvePropertyPath } from '@itrocks/reflect-path'
import { Request }             from '@itrocks/request-response'
import { AND }                 from '@itrocks/sql-functions'
import { OR }                  from '@itrocks/sql-functions'
import { and }                 from '@itrocks/sql-functions'
import { between }             from '@itrocks/sql-functions'
import { equal }               from '@itrocks/sql-functions'
import { greater }             from '@itrocks/sql-functions'
import { greaterOrEqual }      from '@itrocks/sql-functions'
import { less }                from '@itrocks/sql-functions'
import { lessOrEqual }         from '@itrocks/sql-functions'
import { like }                from '@itrocks/sql-functions'
import { notEqual }            from '@itrocks/sql-functions'
import { notLike }             from '@itrocks/sql-functions'
import { or }                  from '@itrocks/sql-functions'
import { Option }              from '@itrocks/storage'
import { SearchType }          from '@itrocks/storage'
import { Columns }             from './columns'
import { dateSearch }          from './date-search'
import { Parameter }           from './parameter'
import { SearchExpression }    from './search-expression'
import { searchExpression }    from './search-expression'

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

function searchValue(propertyType: unknown, expression: SearchExpression): unknown
{
	if (!('value' in expression)) {
		const combine = (expression.operator === 'AND') ? and : or
		return combine(...expression.operands.map(operand => searchValue(propertyType, operand) ?? or()))
	}
	const value      = expression.value
	const comparison = value.match(/^(>=|<=|<>|!=|>|<|=|!)(.*)$/s)
	const operator   = comparison ? operators[comparison[1] as keyof typeof operators] : undefined
	const operand    = comparison ? comparison[2].trim() : value
	if (propertyType === Date) {
		return dateSearch(operand, comparison?.[1])
	}
	if (/[*?]/.test(operand) && (!operator || operator === notEqual)) {
		const compare = operator ? notLike : like
		return compare(operand.replaceAll('*', '%').replaceAll('?', '_'))
	}
	if (operator) {
		return operator(operand)
	}
	const separator = value.indexOf('-')
	if (separator < 0) {
		const text = (propertyType === String)
		return (text ? like(value + '%') : value)
	}
	const lower = value.slice(0, separator).trim()
	const upper = value.slice(separator + 1).trim()
	if (lower && upper) return between(lower, upper)
	if (lower)          return greaterOrEqual(lower)
	if (upper)          return lessOrEqual(upper)
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
		const search: SearchType   = {}
		const groups: SearchType[] = []
		const expand = (property: string, expression: SearchExpression, ancestors: readonly Type[] = []): SearchType => {
			const resolved = resolvePropertyPath(type, property)
			if (!resolved.target) {
				const value = searchValue(resolved.property.type.type, expression)
				return { [property]: value ?? or() }
			}
			if (!('value' in expression)) {
				const operator = (expression.operator === 'AND') ? AND : OR
				return { [operator]: expression.operands.map(operand => expand(property, operand, ancestors)) }
			}
			if (ancestors.includes(resolved.target)) throw new Error(`Cyclic search representation: ${property}`)
			const branch = [...ancestors, resolved.target]
			return {
				[OR]: representativeOf(resolved.target).map(name => expand(`${property}.${String(name)}`, expression, branch))
			}
		}
		for (const [property, value] of Object.entries(this.search)) {
			if (value === '') continue
			let expression: SearchExpression
			try { expression = searchExpression(value) }
			catch (error) {
				if (!(error instanceof SyntaxError)) throw error
				search[property] = or()
				continue
			}
			const resolved = resolvePropertyPath(type, property)
			if (resolved.target) groups.push(expand(property, expression))
			else {
				const criterion = searchValue(resolved.property.type.type, expression)
				if (criterion !== undefined) search[property] = criterion
			}
		}
		if (groups.length) search[AND] = groups
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
