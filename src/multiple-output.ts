import { ObjectOrType } from '@itrocks/class-type'
import { decorate }     from '@itrocks/decorator/property'
import { decoratorOf }  from '@itrocks/decorator/property'

export type MultipleOutputMode = 'commas' | 'lines'

const MULTIPLE_OUTPUT = Symbol('multiple-output')

export function MultipleOutput<T extends object>(mode: MultipleOutputMode)
{
	return decorate<T>(MULTIPLE_OUTPUT, mode)
}

export function multipleOutputOf<T extends object>(target: ObjectOrType<T>, property: keyof T): MultipleOutputMode
{
	return decoratorOf<MultipleOutputMode | undefined, T>(target, property, MULTIPLE_OUTPUT) ?? 'commas'
}
