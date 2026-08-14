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

	getParams(request: Request, type: Type<T>)
	{
		const data = request.data.columns
		if (data !== undefined) {
			const propertyNames = (Array.isArray(data) ? data : [data]).flatMap(
				property => (typeof property === 'string') ? property.split(',') : property
			)
			if (propertyNames.every((property): property is string => typeof property === 'string')) {
				const reflected  = new ListReflectClass(type).listProperties()
				const reordered  = propertyNames.map(
					propertyName => reflected.find(property => property.name.toString() === propertyName)
				)
				const properties = reordered.filter((property): property is ReflectProperty<T> => !!property)
				if (
					(propertyNames.length === reflected.length)
					&& (properties.length === reflected.length)
					&& (new Set(properties).size === reflected.length)
				) {
					this.properties = properties
				}
			}
		}
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

	propertiesOf(object: T)
	{
		return this.properties.map(property => new ReflectProperty(object, property.name))
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

	unserialize(data: (keyof T)[], type: Type<T>)
	{
		this.properties = data.map(property => new ReflectProperty(type, property))
	}

	unshift(property: ReflectProperty<T>)
	{
		return this.properties.unshift(property)
	}

}
