import { Type }      from '@itrocks/class-type'
import { Request }   from '@itrocks/request-response'
import { routeOf }   from '@itrocks/route'
import { Parameter } from './parameter'

interface Container
{
	[s: string]: any
}

export function load(list: Container, request: Request, type: Type)
{
	if (!request.session.list) return {}
	const serialized: Container = request.session.list[routeOf(type)]
	if (!serialized) return {}
	for (const key of Object.keys(list)) {
		const parameter = list[key]
		if (!(parameter instanceof Parameter) || !serialized[key]) continue
		parameter.unserialize(serialized[key], type)
	}
}

export function save(list: Container, request: Request, type: Type)
{
	if (!request.session.list) {
		request.session.list = {}
	}
	const serialized: Container = {}
	for (const key of Object.keys(list)) {
		const parameter = list[key]
		if (!(parameter instanceof Parameter)) continue
		serialized[key] = parameter.serialize()
	}
	request.session.list[routeOf(type)] = serialized
}
