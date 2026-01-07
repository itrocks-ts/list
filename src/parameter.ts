import { Request } from '@itrocks/request-response'
import { Option }  from '@itrocks/storage'
import { Type }    from '@itrocks/class-type'

export abstract class Parameter
{

	abstract getParams(request: Request, type?: Type): void

	readOptions(options = new Array<Option>)
	{
		return options
	}

	serialize(): any
	{}

	unserialize(_data: any, _type: Type)
	{}

}
