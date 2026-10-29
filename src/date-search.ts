import { between }        from '@itrocks/sql-functions'
import { greater }        from '@itrocks/sql-functions'
import { greaterOrEqual } from '@itrocks/sql-functions'
import { isNotNull }      from '@itrocks/sql-functions'
import { isNull }         from '@itrocks/sql-functions'
import { less }           from '@itrocks/sql-functions'
import { lessOrEqual }    from '@itrocks/sql-functions'
import { like }           from '@itrocks/sql-functions'
import { notBetween }     from '@itrocks/sql-functions'
import { notLike }        from '@itrocks/sql-functions'
import { tr }             from '@itrocks/translate'

type DateParts = { day?: string; month?: string; year: string }
type Period    = { lower: Date; upper: Date }

function completeYear(value: string, currentYear: number): string
{
	return (value.length === 4)
		? value
		: (String(currentYear).slice(0, 4 - value.length) + value)
}

function dateParts(value: string, format: string, now: Date): DateParts | undefined
{
	const dayFirst = format.indexOf('d') < format.indexOf('M')
	let day:   string | undefined
	let month: string | undefined
	let year = String(now.getFullYear())
	if (/^[\d?%*]+$/.test(value)) {
		if      (value.length === 4) year = value
		else if (value.length <= 2)  month = value
		else if (value.length === 6 || value.length === 8) {
			day   = value.slice(dayFirst ? 0 : 2, dayFirst ? 2 : 4)
			month = value.slice(dayFirst ? 2 : 0, dayFirst ? 4 : 2)
			year  = value.slice(4)
		}
		else return
	}
	else {
		const slash = value.includes('/')
		const parts = value.split(slash ? '/' : '-').map(part => part.trim())
		if (parts.some(part => !/^[\d?%*]{1,4}$/.test(part))) return
		if (parts.length === 2) {
			if      (parts[0].length === 4) [year, month] = parts
			else if (parts[1].length === 4) [month, year] = parts
			else if (!slash)                [year, month] = parts
			else                            [day, month] = dayFirst ? parts : [...parts].reverse()
		}
		else if (parts.length === 3) {
			if (!slash || parts[0].length === 4) {
				[year, month, day] = parts
			}
			else {
				[day, month] = dayFirst ? parts : [parts[1], parts[0]]
				year = parts[2]
			}
		}
		else return
	}
	if ((month && month.length > 2) || (day && day.length > 2)) return
	return {
		day,
		month,
		year: completeYear(year, now.getFullYear())
	}
}

function datePeriod(value: string, format: string, now: Date): Period | undefined
{
	const parts = dateParts(value, format, now)
	if (!parts || /[^\d]/.test(parts.year + (parts.month ?? '') + (parts.day ?? ''))) return
	const day   = +(parts.day ?? 1)
	const month = +(parts.month ?? 1)
	const year  = +parts.year
	const lower = new Date(0)
	lower.setFullYear(year, month - 1, day)
	lower.setHours(0, 0, 0, 0)
	if (
		(year < 1) || (year > 9999)
		|| (lower.getFullYear() !== year) || (lower.getMonth() !== month - 1) || (lower.getDate() !== day)
	) {
		return
	}
	const next = new Date(lower)
	if      (!parts.month) next.setFullYear(year + 1)
	else if (!parts.day)   next.setMonth(month)
	else                   next.setDate(day + 1)
	return {
		lower,
		upper: new Date(next.getTime() - 1)
	}
}

export function dateSearch(
	value: string, operator = '=', now = new Date(), format = tr('dd/MM/yyyy', { ucFirst: false })
)
{
	value = value.trim()
	if (value === '?') {
		return ['!', '!=', '<>'].includes(operator)
			? isNull()
			: isNotNull()
	}
	if (/[%*?]/.test(value)) {
		const parts = dateParts(value, format, now)
		if (!parts) return []
		const field   = (part: string) => part.padStart(2, '0')
		const pattern = parts.year + (
			!parts.month ? '-%' : (
				'-' + field(parts.month)
				+ (!parts.day ? '-%' : ('-' + field(parts.day) + '%'))
			)
		)
		const compare = ['!', '!=', '<>'].includes(operator) ? notLike : like
		return compare(pattern.replaceAll('*', '%').replaceAll('?', '_'))
	}
	let period: Period | undefined
	const years = value.match(/^(\d{3,4})\s*-\s*(\d{3,4})$/)
	const open  = value.startsWith('-') || value.endsWith('-')
	if (years || open || (value.includes('/') && value.includes('-'))) {
		const index = value.endsWith('-') ? value.length - 1 : value.indexOf('-')
		const left  = years ? completeYear(years[1], now.getFullYear()) : value.slice(0, index).trim()
		const right = years ? completeYear(years[2], now.getFullYear()) : value.slice(index + 1).trim()
		const bound = (part: string) => datePeriod(
			/^\d{3}$/.test(part) ? completeYear(part, now.getFullYear()) : part, format, now
		)
		const lower = left  ? bound(left)?.lower  : undefined
		const upper = right ? bound(right)?.upper : undefined
		if ((left && !lower) || (right && !upper)) return []
		if (lower && upper) period = { lower, upper }
		else if (lower) return greaterOrEqual(lower)
		else if (upper) return lessOrEqual(upper)
	}
	else period = datePeriod(value, format, now)
	if (!period) return []
	switch (operator) {
		case '!': case '!=': case '<>': return notBetween(period.lower, period.upper)
		case '<':  return less(period.lower)
		case '<=': return lessOrEqual(period.upper)
		case '>':  return greater(period.upper)
		case '>=': return greaterOrEqual(period.lower)
		default:   return between(period.lower, period.upper)
	}
}
