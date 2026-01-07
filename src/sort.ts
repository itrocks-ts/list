import { Type }               from '@itrocks/class-type'
import { Request }            from '@itrocks/request-response'
import { PropertyPath }       from '@itrocks/sort'
import { Reverse }            from '@itrocks/sort'
import { sortOf }             from '@itrocks/sort'
import { Option }             from '@itrocks/storage'
import { Sort as SortOption } from '@itrocks/storage'
import { Columns }            from './columns'

interface Sortable {
	reverse?: boolean
	sort?:    number
}

export class Sort<T extends object>
{

	getParams(_request: Request, type: Type, columns: Columns<T>)
	{
		let sortProperties: PropertyPath[] | undefined
		for (const option of this.readOptions()) {
			if (option instanceof SortOption) {
				sortProperties = option.properties
			}
		}
		sortProperties        ??= sortOf(type)
		const sortPropertyNames = sortProperties.map(property => '' + property)
		for (const column of columns) {
			const sortIndex = sortPropertyNames.indexOf(column.name) + 1;
			(column as Sortable).reverse = !!(sortIndex && (sortProperties[sortIndex - 1] instanceof Reverse));
			(column as Sortable).sort    = sortIndex ? sortIndex : undefined
		}
	}

	readOptions(options = new Array<Option>)
	{
		options.push(SortOption)
		return options
	}

}
