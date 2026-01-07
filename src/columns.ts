import { Type }             from '@itrocks/class-type'
import { ListReflectClass } from '@itrocks/list-properties'
import { ReflectProperty }  from '@itrocks/reflect'
import { Request }          from '@itrocks/request-response'
import { Option }           from '@itrocks/storage'

export class Columns<T extends object> implements Iterable<ReflectProperty<T>>
{

	properties = new Array<ReflectProperty<T>>;

	[Symbol.iterator]()
	{
		return this.properties[Symbol.iterator]()
	}

	getParams(_request: Request, type: Type<T>)
	{
		this.properties = new ListReflectClass(type).listProperties()
	}

	readOptions(options = new Array<Option>)
	{
		return options
	}

}
