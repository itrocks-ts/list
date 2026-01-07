import { KeyOf }            from '@itrocks/class-type'
import { Type }             from '@itrocks/class-type'
import { ListReflectClass } from '@itrocks/list-properties'
import { ReflectProperty }  from '@itrocks/reflect'
import { Request }          from '@itrocks/request-response'
import { Option }           from '@itrocks/storage'
import { Parameter }        from './parameter'

export class Columns<T extends object> extends Parameter implements Iterable<ReflectProperty<T>>
{

	properties = new Array<ReflectProperty<T>>;

	[Symbol.iterator]()
	{
		return this.properties[Symbol.iterator]()
	}

	getParams(_request: Request, type: Type<T>)
	{
		if (!this.length) {
			this.properties = new ListReflectClass(type).listProperties()
		}
	}

	get length()
	{
		return this.properties.length
	}

	map(callback: (value: ReflectProperty<T>) => any)
	{
		return this.properties.map(callback)
	}

	readOptions(options = new Array<Option>)
	{
		return options
	}

	remove(propertyName: string)
	{
		for (const property of this.properties) {
			if (property.name !== propertyName) continue
			this.properties.splice(this.properties.indexOf(property), 1)
			return
		}
	}

	serialize()
	{
		return this.properties.map(property => property.name)
	}

	unserialize(data: KeyOf<T>[], type: Type<T>)
	{
		this.properties = data.map(property => new ReflectProperty(type, property))
	}

	unshift(property: ReflectProperty<T>)
	{
		return this.properties.unshift(property)
	}

}
