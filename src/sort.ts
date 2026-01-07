import { Type }               from '@itrocks/class-type'
import { Request }            from '@itrocks/request-response'
import { Option }             from '@itrocks/storage'
import { Sort as SortOption } from '@itrocks/storage'
import { Columns }            from './columns'

export class Sort<T extends object>
{

	getParams(_request: Request, _type: Type, _columns: Columns<T>)
	{
	}

	readOptions(options = new Array<Option>)
	{
		options.push(SortOption)
		return options
	}

}
