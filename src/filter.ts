import { Type }      from '@itrocks/class-type'
import { Request }   from '@itrocks/request-response'
import { Option }    from '@itrocks/storage'
import { Parameter } from './parameter'

export class Filter extends Parameter
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
