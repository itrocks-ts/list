import { Type }                from '@itrocks/class-type'
import { representativeOf }    from '@itrocks/class-view'
import { isLiteral }           from '@itrocks/property-type'
import { PropertyType }        from '@itrocks/property-type'
import { UnionType }           from '@itrocks/property-type'
import { resolvePropertyPath } from '@itrocks/reflect-path'
import { Request }             from '@itrocks/request-response'
import { AND }                 from '@itrocks/sql-functions'
import { OR }                  from '@itrocks/sql-functions'
import { and }                 from '@itrocks/sql-functions'
import { between }             from '@itrocks/sql-functions'
import { equal }               from '@itrocks/sql-functions'
import { greater }             from '@itrocks/sql-functions'
import { greaterOrEqual }      from '@itrocks/sql-functions'
import { isNotNull }           from '@itrocks/sql-functions'
import { isNull }              from '@itrocks/sql-functions'
import { less }                from '@itrocks/sql-functions'
import { lessOrEqual }         from '@itrocks/sql-functions'
import { like }                from '@itrocks/sql-functions'
import { notEqual }            from '@itrocks/sql-functions'
import { notLike }             from '@itrocks/sql-functions'
import { or }                  from '@itrocks/sql-functions'
import { Option }              from '@itrocks/storage'
import { SearchType }          from '@itrocks/storage'
import { trReverse }           from '@itrocks/translate'
import { columnComparison }    from './front/search-expression'
import { SearchComparison }    from './front/search-expression'
import { SearchExpression }    from './front/search-expression'
import { searchExpression }    from './front/search-expression'
import { Columns }             from './columns'
import { dateSearch }          from './date-search'
import { Parameter }           from './parameter'

type Search = { [property: string]: string }
type Comparison = SearchComparison | '<>' | '≠'

const operators = {
	'!':  notEqual,
	'!=': notEqual,
	'<':  less,
	'<=': lessOrEqual,
	'<>': notEqual,
	'=':  equal,
	'>':  greater,
	'>=': greaterOrEqual,
	'≠':  notEqual
}

function comparisonOperand(propertyType: unknown, value: string): number | string
{
	if (propertyType !== Number || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
		return value
	}
	const number = Number(value)
	return Number.isFinite(number) && (!Number.isInteger(number) || Number.isSafeInteger(number)) ? number : value
}

function criterionValue(propertyType: unknown, value: string, operator?: Comparison): unknown
{
	if (propertyType === Date) {
		const comparison = operator === ':' ? '=' : operator === '≠' ? '!=' : operator
		const trimmed    = value.trim()
		if (trimmed && (comparison === '!=' || comparison === '<>') && trReverse(trimmed.toLowerCase()) === 'empty') {
			return dateSearch('?')
		}
		return dateSearch(value, comparison)
	}

	const compare = operator && operator !== ':' ? operators[operator] : undefined
	if ((!compare || operator === '!') && /[*?%_]/.test(value)) {
		const match = operator === '!' ? notLike : like
		return match(value.replaceAll('*', '%').replaceAll('?', '_'))
	}
	if (operator === '!' && propertyType === String && value) return notLike(value + '%')
	if (compare) return compare(comparisonOperand(propertyType, value))

	const separator = operator === ':' ? -1 : value.indexOf('-')
	if (separator >= 0) {
		const lower = value.slice(0, separator).trim()
		const upper = value.slice(separator + 1).trim()
		if (lower && upper) return between(comparisonOperand(propertyType, lower), comparisonOperand(propertyType, upper))
		if (lower)          return greaterOrEqual(comparisonOperand(propertyType, lower))
		if (upper)          return lessOrEqual(comparisonOperand(propertyType, upper))
		return propertyType === Number ? or() : equal('-')
	}
	if (propertyType !== String) return comparisonOperand(propertyType, value)
	if (!value) return equal('')
	return like((operator === ':' ? value.replaceAll('\\', '\\\\') : value) + '%')
}

function emptyCriterion(value: string, date = false): 'empty' | 'present' | undefined
{
	const alias = value.trim().match(date ? /^(!=|<>|[!≠])?\s*(.+)$/s : /^(!)?\s*(.+)$/s)
	if (alias && trReverse(alias[2].toLowerCase()) === 'empty') return alias[1] ? 'present' : 'empty'
}

function scalarType(type: PropertyType): unknown
{
	if (type instanceof UnionType) {
		const members = type.types.filter(member => !isLiteral(member, null) && !isLiteral(member, undefined))
		if (members.length === 1) return members[0].type
	}
	return type.type
}

function searchValue(propertyType: unknown, expression: SearchExpression): unknown
{
	if (!('value' in expression)) {
		const combine = (expression.operator === 'AND') ? and : or
		return combine(...expression.operands.map(operand => searchValue(propertyType, operand) ?? or()))
	}
	if (expression.comparison !== undefined) {
		return criterionValue(propertyType, expression.value, expression.comparison)
	}
	let   value = expression.value
	const empty = emptyCriterion(value, propertyType === Date)
	if (empty) {
		if (propertyType === Number) return empty === 'empty' ? isNull() : isNotNull()
		value = (empty === 'present' ? '' : '!') + ((propertyType === Date) ? '?' : '?*')
	}
	const comparison = value.match(columnComparison)
	const operand    = comparison ? comparison[2].trim() : value
	return criterionValue(propertyType, operand, comparison?.[1] as Comparison | undefined)
}

export class Filter<T extends object> extends Parameter
{

	search: Search = {}

	constructor(public columns: Columns<T>)
	{
		super()
	}

	protected columnCondition(type: Type, property: string, value: string): SearchType
	{
		let expression: SearchExpression
		try { expression = searchExpression(value) }
		catch (error) {
			if (!(error instanceof SyntaxError)) throw error
			return { [property]: or() }
		}
		return this.condition(type, property, expression)
	}

	protected condition(type: Type, property: string, expression: SearchExpression, ancestors: readonly Type[] = [])
		: SearchType
	{
		const resolved = resolvePropertyPath(type, property)
		if (!resolved.target) {
			const value = searchValue(scalarType(resolved.property.type), expression)
			if (value === undefined && !ancestors.length) return {}
			return { [property]: value ?? or() }
		}
		if (!('value' in expression)) {
			const operator = (expression.operator === 'AND') ? AND : OR
			return { [operator]: expression.operands.map(operand => this.condition(type, property, operand, ancestors)) }
		}
		if (resolved.targetMultiplicity === 'one' && expression.comparison === undefined) {
			const empty = emptyCriterion(expression.value)
			if (empty) return { [property]: empty === 'empty' ? isNull() : isNotNull() }
		}
		if (ancestors.includes(resolved.target)) throw new Error(`Cyclic search representation: ${property}`)
		const branch = [...ancestors, resolved.target]
		return {
			[OR]: representativeOf(resolved.target)
				.map(name => this.condition(type, `${property}.${String(name)}`, expression, branch))
		}
	}

	getParams(request: Request, _type?: Type)
	{
		for (const property of this.columns.map(property => property.name)) {
			this.search[property] ??= ''
		}
		if ('reset' in request.data) {
			this.search = Object.fromEntries(Object.keys(this.search).map(path => [path, '']))
			return
		}
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
		for (const [property, value] of Object.entries(this.search)) {
			if (value === '') continue
			const condition = this.columnCondition(type, property, value)
			if (Object.hasOwn(condition, AND) || Object.hasOwn(condition, OR)) {
				groups.push(condition)
			}
			else {
				Object.assign(search, condition)
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
