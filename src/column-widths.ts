import type { Request } from '@itrocks/request-response'
import type { Columns } from './columns'
import { Parameter }    from './parameter'

export function isColumnWidth(width: unknown): width is number
{
	return (typeof width === 'number') && Number.isSafeInteger(width) && (width > 0)
}

export class ColumnWidths<T extends object> extends Parameter
{

	private widths = new Map<string, number>()

	constructor(private readonly columns: Columns<T>)
	{
		super()
	}

	getParams(request: Request): boolean
	{
		const paths = new Set(this.columns.map(column => column.name))
		const { columnWidth, resizeColumn } = request.data
		if (resizeColumn !== undefined || columnWidth !== undefined) {
			if ((typeof resizeColumn !== 'string') || !paths.has(resizeColumn)) return false
			if (columnWidth === 'auto') {
				this.widths.delete(resizeColumn)
			}
			else {
				if ((typeof columnWidth !== 'string') || !/^\d+$/.test(columnWidth)) return false
				const width = Number(columnWidth)
				if (!isColumnWidth(width)) return false
				this.widths.set(resizeColumn, width)
			}
		}
		for (const path of this.widths.keys()) {
			if (!paths.has(path)) {
				this.widths.delete(path)
			}
		}
		for (const column of this.columns) {
			column.width = this.widths.get(column.name)
		}
		return true
	}

	serialize(): Record<string, number> | undefined
	{
		return this.widths.size ? Object.fromEntries(this.widths) : undefined
	}

	unserialize(data: unknown)
	{
		this.widths = new Map(
			(data && (typeof data === 'object') && !Array.isArray(data))
				? Object.entries(data).filter((entry): entry is [string, number] => isColumnWidth(entry[1]))
				: []
		)
	}

}
