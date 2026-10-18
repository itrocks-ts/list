import { inherits }                    from '@itrocks/class-type'
import { Type }                        from '@itrocks/class-type'
import { displayOf as classDisplayOf } from '@itrocks/class-view'
import { representativeOf }            from '@itrocks/class-view'
import { representativeValueOf }       from '@itrocks/class-view'
import { componentOf }                 from '@itrocks/composition'
import { compositeOf }                 from '@itrocks/composition'
import { HtmlContainer }               from '@itrocks/core-transformers'
import { storeOutput }                 from '@itrocks/core-transformers'
import { displayOf }                   from '@itrocks/property-view'
import { ReflectClass }                from '@itrocks/reflect'
import { ReflectProperty }             from '@itrocks/reflect'
import { ReflectPropertyPath }         from '@itrocks/reflect-path'
import { resolvePropertyPath }         from '@itrocks/reflect-path'
import { ProjectionCell }              from '@itrocks/storage'
import { Selection }                   from '@itrocks/storage'
import { SelectionError }              from '@itrocks/storage'
import { tr }                          from '@itrocks/translate'
import { applyTransformer }            from '@itrocks/transformer'
import { HTML }                        from '@itrocks/transformer'
import { OUTPUT }                      from '@itrocks/transformer'
import { resolveTransformer }          from '@itrocks/transformer'
import { multipleOutputOf }            from './multiple-output'

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

	readonly component?: { column: ListColumn; inverse: string; parent: string; path: string; type: Type }
	readonly field: string
	readonly fields?: readonly string[]
	readonly label: string
	readonly multiple: boolean
	readonly property: ReturnType<typeof resolvePropertyPath>['property']
	readonly sortable: boolean
	readonly target?: Type
	reverse = false
	search = ''
	sort?: number

	constructor(readonly root: Type, readonly name: string)
	{
		this.field = encodeURIComponent(name).replaceAll('.', '%2E')
		const resolved = resolvePropertyPath(root, name)
		this.multiple = resolved.targetMultiplicity === 'many'
		this.sortable = !this.multiple
		if (this.multiple && resolved.segments.length > 1) {
			const index = resolved.segments.findIndex(property => property.relation?.targetMultiplicity === 'many')
			const property = resolved.segments[index]
			const target = property?.relation?.target
			if (target && componentOf(property.class.type, property.name) && index < resolved.segments.length - 1) {
				const inverses = Object.keys(new ReflectClass(target).propertyTypes).filter(name => {
					if (!compositeOf(target, name as never)) return false
					const relation = new ReflectProperty(target, name as never).relation
					return relation?.target && inherits(property.class.type, relation.target)
				})
				if (inverses.length === 1) {
					const column = new ListColumn(target, name.split('.').slice(index + 1).join('.'))
					if (!column.multiple) this.component = {
						column, inverse: inverses[0], parent: name.split('.').slice(0, index).join('.'),
						path: name.split('.').slice(0, index + 1).join('.'), type: target
					}
				}
			}
		}
		if (resolved.targetMultiplicity !== 'one' && !(this.multiple && resolved.segments.length === 1)
			&& !this.component) {
			throw new SelectionError(
				resolved.targetMultiplicity === 'many' ? 'multiple-values' : 'unsupported-selection', name
			)
		}
		this.property = new ReflectPropertyPath(root, name as never)
		this.target = resolved.target
		this.label = resolved.segments.map(property => tr(displayOf(property.class.type, property.name))).join('.')
		if (this.component) this.fields = this.component.column.fields
		if (resolved.target && !this.multiple)
			this.fields = representationFields(resolved.target, [], resolved.property)
	}

	async output(cell: ProjectionCell): Promise<string>
	{
		if (cell.kind === 'absent') return ''
		if (cell.kind === 'unloaded') return '<span class="unavailable">Unavailable</span>'
		if (this.component) {
			const cells = cell.value as ProjectionCell[]
			const values = await Promise.all(cells.map(cell => this.component!.column.output(cell)))
			return multipleOutputOf(this.property.class.type, this.property.name) === 'lines'
				? '<ul>' + values.map(value => `<li>${value}</li>`).join('') + '</ul>' : values.join(', ')
		}
		if (this.fields && this.fields.some(field => !cell.loadedFields?.includes(field)))
			throw new SelectionError('unsupported-selection', this.name)
		if (this.multiple && componentOf(this.property.class.type, this.property.name)) {
			const values = cell.value as object[]
			if (values.length >= 9) {
				const name = this.target
					? classDisplayOf(this.target)
					: displayOf(this.property.class.type, this.property.name)
				const plural = name.endsWith('y') ? name.slice(0, -1) + 'ies' : name + 's'
				return `${values.length} ${tr(plural)}`
			}
			return (await Promise.all(values.map(representativeValueOf))).sort().join(', ')
		}
		const mode = this.multiple ? multipleOutputOf(this.property.class.type, this.property.name) : undefined
		const lines = this.multiple && (mode === 'lines')
		return await applyTransformer(
			cell.value, this.property.class.type, this.property.name, HTML, OUTPUT,
			new HtmlContainer(false, !this.multiple || lines)
		)
	}

	selection(): Selection
	{
		if (this.multiple) throw new SelectionError('multiple-values', this.name)
		return this.fields ? { path: this.name, objectFields: this.fields } : this.name
	}

	sortPaths(): string[]
	{
		return this.fields ? [...this.fields.map(field => `${this.name}.${field}`), this.name] : [this.name]
	}

}
