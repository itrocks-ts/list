
export type SearchExpression = { value: string } | {
	operator: 'AND' | 'OR'
	operands: SearchExpression[]
}

export function searchExpression(input: string): SearchExpression
{
	// Preserve ordinary input exactly, including spaces used by existing scalar criteria.
	if (!/[,|&+()"\\]/.test(input)) return { value: input }
	return new SearchParser(input).parse()
}

class SearchParser
{

	private position = 0

	constructor(private readonly input: string) {}

	private and(): SearchExpression
	{
		const operands = [this.primary()]
		while (this.take('&+')) operands.push(this.primary())
		return (operands.length === 1) ? operands[0] : { operator: 'AND', operands }
	}

	private fail(message: string): never
	{
		throw new SyntaxError(`${message} at position ${this.position + 1}`)
	}

	private or(): SearchExpression
	{
		const operands = [this.and()]
		while (this.take(',|')) operands.push(this.and())
		return (operands.length === 1) ? operands[0] : { operator: 'OR', operands }
	}

	parse(): SearchExpression
	{
		const expression = this.or()
		this.space()
		if (this.position !== this.input.length) this.fail('Unexpected character')
		return expression
	}

	private primary(): SearchExpression
	{
		if (this.take('(')) {
			const expression = this.or()
			if (!this.take(')')) {
				this.fail('Missing closing parenthesis')
			}
			return expression
		}
		let value  = ''
		let length = 0
		let quoted = false
		let seen   = false
		while (this.position < this.input.length) {
			const character = this.input[this.position]
			if (!quoted && ',|&+()'.includes(character)) break
			this.position ++
			if (
				(character === '\\')
				&& (this.position < this.input.length)
				&& ',|&+()"\\'.includes(this.input[this.position])
			) {
				value += this.input[this.position ++]
				length = value.length
				seen   = true
			}
			else if (character === '"') {
				quoted = !quoted
				seen   = true
			}
			else {
				value += character
				if (quoted || character.trim()) length = value.length
				seen ||= !!character.trim()
			}
		}
		if (quoted) this.fail('Unclosed quote')
		if (!seen)  this.fail('Missing criterion')
		return { value: value.slice(0, length) }
	}

	private space(): void
	{
		while ((this.position < this.input.length) && /\s/.test(this.input[this.position])) {
			this.position ++
		}
	}

	private take(characters: string): boolean
	{
		this.space()
		if ((this.position === this.input.length) || !characters.includes(this.input[this.position])) {
			return false
		}
		this.position ++
		return true
	}

}
