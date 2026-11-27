// Run with Node.js after installing this package's development dependencies.
// node docs/generate-search-cheatsheets.cjs
const { writeFile }                      = require('node:fs/promises')
const { join }                           = require('node:path')
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')

const sheets = {
	fr: {
		title: 'Rechercher dans les colonnes',
		intro: [
			'Saisissez un critère sous le nom de la colonne, puis appuyez sur Entrée.',
			'Si vous remplissez plusieurs colonnes, toutes leurs conditions doivent être remplies.'
		],
		labels: ['À saisir', 'Ce que vous trouvez'],
		sections: [
			['Saisir et comparer', [
				['Alien', 'Le texte qui commence par « Alien ». Un nombre seul cherche la valeur exacte.'],
				['=Alien', 'La valeur entière « Alien ». Pour une valeur avec un tiret, tapez =A-B.'],
				[
					'>10   >=10   <10   <=10',
					'Plus grand, au moins, plus petit, au plus. Pour chercher moins dix exactement, tapez =-10.'
				],
				['!=Alien   <>Alien   !Alien', 'Les valeurs différentes de « Alien ». Les trois signes ont le même effet.']
			]],
			['Remplacer des caractères', [
				['*Alien*', 'Le texte qui contient « Alien ». * remplace zéro, un ou plusieurs caractères.'],
				['A?B', 'Un seul caractère à la place de ?, comme dans A1B ou A2B.'],
				['!*test*', 'Le texte qui ne contient pas « test ». Vous pouvez aussi écrire !=*test* ou <>*test*.']
			]],
			['Chercher un intervalle ou une date', [
				['10-20   10-   -20', 'De 10 à 20, à partir de 10, ou jusqu’à 20. Les bornes sont incluses.'],
				['2020   2020-03   6', 'Toute l’année 2020, mars 2020, ou juin de l’année en cours.'],
				[
					'2020-03-09   09/03/2020',
					'Le 9 mars 2020. L’exemple avec / est en jour/mois. Avec / ou sans séparateurs, suivez l’ordre affiché'
					+ ' dans la liste.'
				],
				[
					'2020-2022   01/03/2020-09/03/2020',
					'De 2020 à 2022, ou du 1er au 9 mars inclus en jour/mois. Une borne peut être omise, comme dans 2020-.'
				],
				['>2020   <=2020   !2020', 'Après 2020, jusqu’à fin 2020, ou en dehors de 2020.'],
				[
					'2020-03-??   20??',
					'Tous les jours de mars 2020, ou les années de 2000 à 2099. Pour les dates, % peut aussi s’utiliser'
					+ ' comme *.'
				]
			]],
			['Chercher une valeur vide', [
				['vide   !vide', 'Une valeur vide ou renseignée. En anglais, écrivez empty ou !empty.'],
				['=   =vide', 'Un texte sans aucun caractère, ou le mot « vide » lui-même.'],
				['!?   ?', 'Dans une colonne de dates, une date vide ou renseignée.']
			]],
			['Combiner et protéger', [
				['Alien, Predator   Alien | Predator', 'L’un ou l’autre. La virgule et | signifient OU.'],
				['>=10 & <=20   >=10 + <=20', 'Les deux à la fois. & et + signifient ET et passent avant OU.'],
				[
					'(Alien | Predator) & !*test*',
					'Les parenthèses regroupent les choix. Ici, l’un des deux débuts de texte sans « test ».'
				],
				[
					'"Rock & Roll"   ="Paris, Texas"',
					'Les guillemets doubles protègent les signes de combinaison. Ajoutez = pour chercher le texte entier.'
				],
				[
					[String.raw`Paris\, Texas`, String.raw`\"   \\`],
					'Le signe \\ protège , | & + ( ) " et \\. Une apostrophe reste un caractère ordinaire.'
				]
			]]
		]
	},
	en: {
		title: 'Search in columns',
		intro: [
			'Type a condition under the column name, then press Enter.',
			'If you fill in several columns, a row must meet all their conditions.'
		],
		labels: ['Type this', 'What it finds'],
		sections: [
			['Enter and compare values', [
				['Alien', 'Text starting with “Alien”. A number on its own matches that exact value.'],
				['=Alien', 'The whole value “Alien”. To match a value with a hyphen, type =A-B.'],
				[
					'>10   >=10   <10   <=10',
					'Greater than, at least, less than, or at most. To match negative ten exactly, type =-10.'
				],
				['!=Alien   <>Alien   !Alien', 'Values other than “Alien”. All three signs do the same thing.']
			]],
			['Replace characters with wildcards', [
				['*Alien*', 'Text containing “Alien”. * stands for zero, one, or several characters.'],
				['A?B', 'Exactly one character in place of ?, as in A1B or A2B.'],
				['!*test*', 'Text without “test”. You can also type !=*test* or <>*test*.']
			]],
			['Search for a range or date', [
				['10-20   10-   -20', 'From 10 to 20, from 10 onward, or up to 20. Both ends are included.'],
				['2020   2020-03   6', 'All of 2020, March 2020, or June of the current year.'],
				[
					'2020-03-09   09/03/2020',
					'9 March 2020. The slash example uses day/month order. With slashes or no separators, follow the order'
					+ ' shown in the list.'
				],
				[
					'2020-2022   01/03/2020-09/03/2020',
					'2020 through 2022, or 1 through 9 March in day/month order. You can leave one end open, as in 2020-.'
				],
				['>2020   <=2020   !2020', 'After 2020, up to the end of 2020, or outside 2020.'],
				['2020-03-??   20??', 'Every day in March 2020, or the years 2000 to 2099. For dates, % also works like *.']
			]],
			['Find empty values', [
				['empty   !empty', 'A blank or filled-in value. In French, use vide or !vide.'],
				['=   =empty', 'Text with zero characters, or the word “empty” itself.'],
				['!?   ?', 'In a date column, a blank or filled-in date.']
			]],
			['Combine and quote conditions', [
				['Alien, Predator   Alien | Predator', 'Either one. The comma and | mean OR.'],
				['>=10 & <=20   >=10 + <=20', 'Both at once. & and + mean AND and are applied before OR.'],
				['(Alien | Predator) & !*test*', 'Parentheses group the choices. Here, either starting word without “test”.'],
				[
					'"Rock & Roll"   ="Paris, Texas"',
					'Double quotes protect the signs used to combine conditions. Add = to match the whole value.'
				],
				[
					[String.raw`Paris\, Texas`, String.raw`\"   \\`],
					'A backslash protects , | & + ( ) " and \\. Apostrophes can be typed as usual.'
				]
			]]
		]
	}
}

const basename    = 'column-search-cheatsheet'
const packageName = '@itrocks/list'

const pageSize   = [595.28, 841.89]
const margin     = 36
const inputWidth = 242
const lineHeight = 11.5
const textSize   = 9.75
const codeSize   = 9.55
const ink        = rgb(0.12, 0.19, 0.20)
const accent     = rgb(0.05, 0.32, 0.29)
const rule       = rgb(0.82, 0.86, 0.85)
const tint       = rgb(0.93, 0.96, 0.95)

function wrap(text, font, size, width)
{
	const lines = []
	let line = ''
	for (const word of text.split(' ')) {
		const next = line ? line + ' ' + word : word
		if (line && font.widthOfTextAtSize(next, size) > width) {
			lines.push(line)
			line = word
		}
		else {
			line = next
		}
	}
	return [...lines, line]
}

function drawExample(page, example, x, y, fonts)
{
	const runs = example.split(/(≠)/).filter(Boolean).map(text => ({
		font: text === '≠' ? fonts.symbol : fonts.code,
		text
	}))
	for (const { font, text } of runs) {
		page.drawText(text, { x, y, font, size: codeSize, color: ink })
		x += font.widthOfTextAtSize(text, codeSize)
	}
	if (x > margin + inputWidth) throw new Error(`Example is too wide: ${example}`)
}

async function render(language, sheet)
{
	const pdf = await PDFDocument.create({ updateMetadata: false })
	pdf.setLanguage(language)
	pdf.setTitle(sheet.title)

	const fonts = {
		body:   await pdf.embedFont(StandardFonts.Helvetica),
		bold:   await pdf.embedFont(StandardFonts.HelveticaBold),
		code:   await pdf.embedFont(StandardFonts.Courier),
		symbol: await pdf.embedFont(StandardFonts.Symbol)
	}
	const page  = pdf.addPage(pageSize)
	const width = page.getWidth() - 2 * margin
	const bodyX = margin + inputWidth + 9
	let   y     = page.getHeight() - 62
	page.drawText(sheet.title, { x: margin, y, font: fonts.bold, size: 28, color: ink })

	y -= 25
	for (const paragraph of sheet.intro) {
		for (const line of wrap(paragraph, fonts.body, 11, width)) {
			page.drawText(line, { x: margin, y, font: fonts.body, size: 11, color: ink })
			y -= 14
		}
		y -= 3
	}

	y -= 7
	page.drawRectangle({ x: margin, y: y - 9, width, height: 19, color: tint })
	page.drawText(sheet.labels[0], { x: margin + 7, y: y - 2, font: fonts.bold, size: 9, color: accent })
	page.drawText(sheet.labels[1], { x: bodyX, y: y - 2, font: fonts.bold, size: 9, color: accent })
	y -= 12

	for (const [heading, rows] of sheet.sections) {
		y -= 16
		page.drawText(heading, { x: margin, y, font: fonts.bold, size: 12, color: accent })
		y -= 4

		for (const [examples, explanation] of rows) {
			const code = Array.isArray(examples) ? examples : [examples]
			const body = wrap(explanation, fonts.body, textSize, width - inputWidth - 9)
			page.drawLine({
				start: { x: margin, y },
				end: { x: margin + width, y },
				thickness: 0.45,
				color: rule
			})
			code.forEach((line, index) => drawExample(page, line, margin + 7, y - 12 - index * lineHeight, fonts))
			body.forEach((line, index) => page.drawText(line, {
				x: bodyX, y: y - 12 - index * lineHeight, font: fonts.body, size: textSize, color: ink
			}))
			y -= Math.max(code.length, body.length) * lineHeight + 4
		}
	}

	if (y < 45) throw new Error(`Content exceeds one A4 page: ${language} (${y.toFixed(1)} pt)`)
	page.drawText(packageName, { x: margin, y: 24, font: fonts.body, size: 8, color: accent })

	const filename = join(__dirname, `${basename}.${language}.pdf`)
	await writeFile(filename, await pdf.save())
}

Promise.all(Object.entries(sheets).map(([language, sheet]) => render(language, sheet)))
	.catch(error => {
		console.error(error.message)
		process.exitCode = 1
	})
