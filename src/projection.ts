import { Type }                from '@itrocks/class-type'
import { representativeOf }    from '@itrocks/class-view'
import { HtmlContainer }       from '@itrocks/core-transformers'
import { storeOutput }         from '@itrocks/core-transformers'
import { displayOf }           from '@itrocks/property-view'
import { ReflectPropertyPath } from '@itrocks/reflect-path'
import { resolvePropertyPath } from '@itrocks/reflect-path'
import { ProjectionCell }      from '@itrocks/storage'
import { Selection }           from '@itrocks/storage'
import { SelectionError }      from '@itrocks/storage'
import { applyTransformer }    from '@itrocks/transformer'
import { HTML }                from '@itrocks/transformer'
import { OUTPUT }              from '@itrocks/transformer'
import { resolveTransformer }  from '@itrocks/transformer'

type RepresentationProperty = ReturnType<typeof resolvePropertyPath>['property']

export type RepresentationDependencies = {
	fields?: (type: Type, ancestors: readonly Type[], property?: RepresentationProperty) => readonly string[] | undefined
}

const dependencies: RepresentationDependencies = {}

export function listRepresentationDependsOn(overrides: Partial<RepresentationDependencies>): void
{
	Object.assign(dependencies, overrides)
}

export function representationFields(
	type: Type, ancestors: readonly Type[] = [], property?: RepresentationProperty
): string[]
{
	if (ancestors.includes(type)) throw new SelectionError('unsupported-selection', 'Cyclic object representation')
	const branch = [...ancestors, type]
	const fields = dependencies.fields?.(type, branch, property)
	if (!fields && property && resolveTransformer(property.class.type, property.name, HTML, OUTPUT) !== storeOutput)
		throw new SelectionError('unsupported-selection', 'Undeclared custom object representation')
	return (fields ?? representativeOf(type).map(String)).flatMap(path => {
		const resolved = resolvePropertyPath(type, path)
		if (resolved.targetMultiplicity !== 'one')
			throw new SelectionError('unsupported-selection', path)
		return resolved.target
			? representationFields(resolved.target, branch, resolved.property).map(field => `${path}.${field}`) : [path]
	})
}

export class ListColumn
{

	readonly field: string
	readonly fields?: readonly string[]
	readonly label: string
	readonly property: ReturnType<typeof resolvePropertyPath>['property']
	reverse = false
	search = ''
	sort?: number

	constructor(readonly root: Type, readonly name: string)
	{
		this.field = encodeURIComponent(name).replaceAll('.', '%2E')
		const resolved = resolvePropertyPath(root, name)
		if (resolved.targetMultiplicity !== 'one') {
			throw new SelectionError(
				resolved.targetMultiplicity === 'many' ? 'multiple-values' : 'unsupported-selection',
				name
			)
		}
		this.property = new ReflectPropertyPath(root, name as never)
		this.label = resolved.segments.map(property => displayOf(property.class.type, property.name)).join(' › ')
		if (resolved.target) this.fields = representationFields(resolved.target, [], resolved.property)
	}

	async output(cell: ProjectionCell): Promise<string>
	{
		if (cell.kind === 'absent') return ''
		if (cell.kind === 'unloaded') return '<span class="unavailable">Unavailable</span>'
		if (this.fields && this.fields.some(field => !cell.loadedFields?.includes(field)))
			throw new SelectionError('unsupported-selection', this.name)
		return await applyTransformer(
			cell.value, this.property.class.type, this.property.name, HTML, OUTPUT, new HtmlContainer(false)
		)
	}

	selection(): Selection
	{
		return this.fields ? { path: this.name, objectFields: this.fields } : this.name
	}

	sortPaths(): string[]
	{
		return this.fields ? [...this.fields.map(field => `${this.name}.${field}`), this.name] : [this.name]
	}

}
