import { Type }    from '@itrocks/class-type'
import { Request } from '@itrocks/request-response'
import { Option }  from '@itrocks/storage'

export class Filter
{

	getParams(_request: Request)
	{
	}

	readOptions(options = new Array<Option>)
	{
		return options
	}

	searchObject(type: Type)
	{
		return Object.setPrototypeOf({}, type.prototype)
	}

}
