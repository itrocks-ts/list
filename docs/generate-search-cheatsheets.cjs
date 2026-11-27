// Run with Node.js after installing this package's development dependencies.
// node docs/generate-search-cheatsheets.cjs
const { writeFile }                      = require('node:fs/promises')
const { join }                           = require('node:path')
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')

const sheets = {
	fr: {
		title: 'Rechercher dans les colonnes',
		labels: ['À saisir', 'Ce que vous trouvez'],
		intro: 'Saisissez sous le nom de la colonne et appuyez sur Entrée. Une ligne doit satisfaire les critères '
			+ 'de toutes les colonnes renseignées.',
		full: [
			['Saisir et comparer', [
				['Alien', 'Le texte commence par « Alien ». Un nombre seul cherche la valeur exacte.'],
				['=Alien   =A-B   =-10', 'Valeur entière, y compris un texte avec tiret ou le nombre négatif -10.'],
				['!Alien', 'Le texte ne commence pas par « Alien ». Le report donne !titre:Alien.'],
				['-', 'Un tiret seul recherche le texte exact « - ».'],
				['!=Alien   <>Alien   ≠Alien', 'Le texte diffère de la valeur entière « Alien ».'],
				['>10   >=10   <10   <=10', 'Seuil strict ou inclus. Sur une date, le seuil tient compte de la période saisie.']
			]],
			['Utiliser des jokers', [
				['*Alien*   %Alien%', '« Alien » n’importe où. * et % remplacent zéro à plusieurs caractères.'],
				['Alien*   *Alien', 'Commence ou finit par « Alien ». Un joker explicite fixe le motif.'],
				['A?B      A_B', '? et _ remplacent un caractère.'],
				['!*test*   =100%', 'Exclut « test » n’importe où. Avec =, le % est littéral.']
			]],
			['Chercher un intervalle ou une date', [
				['10-20   10-   -20', 'Intervalle inclusif, borne inférieure seule ou borne supérieure seule.'],
				['>=-5 & <=-1', 'Intervalle entre deux nombres négatifs.'],
				['2020   2020-03   6', 'Toute l’année 2020, mars 2020 ou juin de l’année en cours.'],
				[
					['2020-03-09  09/03/2020  09032020', '2020-2022    01/03/2020-09/03/2020'],
					'Un jour ou une période. Avec / ou sans séparateur, suivez l’ordre affiché.'
				],
				['>2020   <=2020   !=2020', 'Après 2020, au plus tard fin 2020 ou en dehors de 2020.'],
				['2020-03-__   20??', 'Tous les jours de mars 2020 ou les années de 2000 à 2099.']
			]],
			['Chercher le vide ou une valeur renseignée', [
				[
					['=   =""    ""', '!   !=     <>'],
					'Chaîne vide sur la première ligne, texte différent de la chaîne vide sur la seconde.'
				],
				[
					['vide     empty', '!vide    !empty'],
					'Vide ou renseigné. Pour un nombre facultatif ou un lien simple, c’est un test de présence (NULL).'
				],
				['!=10 | vide', 'Nombre différent de 10, y compris quand il est absent.'],
				['!?   ?', 'Date vide ou renseignée. _ peut remplacer ?.']
			]],
			['Combiner et protéger', [
				['Alien, Predator   Alien | Predator', 'L’un ou l’autre. La virgule et | signifient OU.'],
				['>=10 & <=20    >=10 + <=20', 'Les deux critères à la fois. & et + signifient ET et passent avant OU.'],
				['(Alien | Predator) & !*test*', 'L’un des deux débuts de texte, en excluant « test » n’importe où.'],
				['"Rock & Roll"   ="Paris, Texas"', 'Les guillemets doubles protègent les signes de combinaison.'],
				[[String.raw`Paris\, Texas`, String.raw`\"   \\`], 'Le signe \\ protège , | & + ( ) " et \\.']
			]]
		],
		minimal: [
			['Saisir et comparer', [
				['Alien', 'Le texte commence par « Alien ». Un nombre seul cherche la valeur exacte.'],
				['=Alien', 'La valeur entière est « Alien ».'],
				['!Alien', 'Le texte ne commence pas par « Alien ».'],
				['!=Alien', 'Le texte diffère de la valeur entière « Alien ».'],
				['>=10', 'La valeur est au moins 10, seuil inclus.'],
				['=-10', 'La valeur est le nombre négatif -10.']
			]],
			['Utiliser des jokers', [
				['*Alien*', '« Alien » n’importe où. Le joker * remplace zéro ou plusieurs caractères.'],
				['A?B', 'Un seul caractère entre A et B, par exemple A1B.']
			]],
			['Chercher un intervalle ou une date', [
				['10-20', 'De 10 à 20 inclus.'],
				['03/2020', 'Tout mars 2020.'],
				['09/03/2020', 'Le 9 mars 2020.'],
				['01/03/2020-09/03/2020', 'Du 1er au 9 mars 2020 inclus.'],
				['2020-2022', 'De 2020 à 2022 inclus.']
			]],
			['Chercher le vide ou une valeur renseignée', [
				['=', 'Le texte est une chaîne vide.'],
				['!=', 'Le texte n’est pas une chaîne vide.'],
				['vide', 'Champ vide. Un nombre facultatif ou un lien simple est absent.'],
				['!vide', 'Champ renseigné.'],
				['!=10, vide', 'Le nombre diffère de 10 ou il est absent.']
			]],
			['Combiner et protéger', [
				['Alien, Predator', 'L’un ou l’autre des deux débuts de texte.'],
				['>=10 & <=20', 'Les deux critères à la fois.'],
				[
					'(Alien, Predator) & !*test*',
					'Groupez les deux débuts de texte avant d’exclure ceux qui contiennent « test ».'
				],
				['"Rock & Roll"', 'Les guillemets gardent le & dans le texte cherché.']
			]]
		]
	},
	en: {
		title: 'Search in columns',
		labels: ['Type this', 'What it finds'],
		intro: 'Enter a condition under the column name and press Enter. A row must meet the conditions in every '
			+ 'column you fill in.',
		full: [
			['Enter and compare values', [
				['Alien', 'Text starts with “Alien”. A number on its own matches that exact value.'],
				['=Alien   =A-B   =-10', 'The whole value, including text with a hyphen or the negative number -10.'],
				['!Alien', 'Text does not start with “Alien”. The general filter shows !title:Alien.'],
				['-', 'A hyphen on its own matches the exact text “-”.'],
				['!=Alien   <>Alien   ≠Alien', 'The whole text differs from “Alien”.'],
				['>10   >=10   <10   <=10', 'Strict or inclusive threshold. For dates it accounts for the period you enter.']
			]],
			['Use wildcards', [
				['*Alien*   %Alien%', '“Alien” anywhere. * and % match zero or more characters.'],
				['Alien*   *Alien', 'Starts or ends with “Alien”. Explicit wildcards set the pattern.'],
				['A?B      A_B', '? and _ match one character.'],
				['!*test*   =100%', 'Excludes “test” anywhere. With =, % is literal.']
			]],
			['Search for a range or date', [
				['10-20   10-   -20', 'Inclusive range, lower bound only, or upper bound only.'],
				['>=-5 & <=-1', 'A range between two negative numbers.'],
				['2020   2020-03   6', 'All of 2020, March 2020 or June this year.'],
				[
					['2020-03-09  09/03/2020  09032020', '2020-2022    01/03/2020-09/03/2020'],
					'A day or period. For slash or compact dates, follow the displayed order.'
				],
				['>2020   <=2020   !=2020', 'After 2020, up to the end of 2020, or outside 2020.'],
				['2020-03-__   20??', 'Every day in March 2020, or the years 2000 to 2099.']
			]],
			['Find empty or populated fields', [
				[
					['=   =""    ""', '!   !=     <>'],
					'Empty text on the first line, text other than the empty string on the second.'
				],
				[
					['empty    vide', '!empty   !vide'],
					'Empty or populated. For an optional number or single link, it checks for NULL.'
				],
				['!=10 | empty', 'A number other than 10, including missing values.'],
				['!?   ?', 'An empty or populated date. _ can replace ?.']
			]],
			['Combine and quote conditions', [
				['Alien, Predator   Alien | Predator', 'Either one. The comma and | mean OR.'],
				['>=10 & <=20    >=10 + <=20', 'Both conditions. & and + mean AND and take precedence over OR.'],
				['(Alien | Predator) & !*test*', 'Either prefix, with “test” excluded anywhere in the text.'],
				['"Rock & Roll"   ="Paris, Texas"', 'Double quotes protect grouping signs.'],
				[[String.raw`Paris\, Texas`, String.raw`\"   \\`], 'Backslash escapes , | & + ( ) " and \\.']
			]]
		],
		minimal: [
			['Enter and compare values', [
				['Alien', 'Text starts with “Alien”. A number on its own matches that exact value.'],
				['=Alien', 'The whole value is “Alien”.'],
				['!Alien', 'Text does not start with “Alien”.'],
				['!=Alien', 'The whole value differs from “Alien”.'],
				['>=10', 'The value is at least 10, including 10.'],
				['=-10', 'The value is the negative number -10.']
			]],
			['Use wildcards', [
				['*Alien*', '“Alien” anywhere. The * wildcard matches any number of characters.'],
				['A?B', 'Exactly one character between A and B, for example A1B.']
			]],
			['Search for a range or date', [
				['10-20', 'From 10 to 20 inclusive.'],
				['03/2020', 'All of March 2020.'],
				['09/03/2020', '9 March 2020 (day/month/year).'],
				['01/03/2020-09/03/2020', 'From 1 through 9 March 2020.'],
				['2020-2022', 'From 2020 through 2022.']
			]],
			['Find empty or populated fields', [
				['=', 'The text is an empty string.'],
				['!=', 'The text contains at least one character.'],
				['empty', 'An empty field. For an optional number or single link, the value is missing.'],
				['!empty', 'A populated field.'],
				['!=10, empty', 'The number differs from 10 or is missing.']
			]],
			['Combine and quote conditions', [
				['Alien, Predator', 'Either prefix.'],
				['>=10 & <=20', 'Both conditions at once.'],
				['(Alien, Predator) & !*test*', 'Group both prefixes before excluding text containing “test”.'],
				['"Rock & Roll"', 'Double quotes keep the & inside the text you search for.']
			]]
		]
	}
}

const basename    = 'column-search-cheatsheet'
const packageName = '@itrocks/list'

const pageSize = [595.28, 841.89]
const margin   = 36
const layouts  = {
	full:    { codeSize: 9.8, inputWidth: 222, lineHeight: 11.7, rowGap: 3.2, sectionGap: 16, textSize: 10 },
	minimal: { codeSize: 10.1, inputWidth: 213, lineHeight: 12.8, rowGap: 4.6, sectionGap: 18, textSize: 10.6 }
}
const edition = {
	en: { full: 'Complete reference', minimal: 'Essentials' },
	fr: { full: 'Fiche complète', minimal: 'L’essentiel' }
}
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

function wrapSentences(text, font, size, width, segmenter, separate)
{
	if (separate) {
		return Array.from(segmenter.segment(text))
			.flatMap(({ segment }) => wrap(segment.trim(), font, size, width))
	}

	const lines = []
	let rest    = wrap(text, font, size, width)
	let start   = 0
	for (const { index } of segmenter.segment(text)) {
		if (!index) continue
		const before = wrap(text.slice(start, index).trim(), font, size, width)
		const after  = wrap(text.slice(index).trimStart(), font, size, width)
		if (before.length + after.length > rest.length) continue
		lines.push(...before)
		rest  = after
		start = index
	}
	return [...lines, ...rest]
}

function drawExample(page, example, x, y, fonts, { codeSize, inputWidth })
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

async function render(language, sheet, variant)
{
	const pdf = await PDFDocument.create({ updateMetadata: false })
	const segmenter = new Intl.Segmenter(language, { granularity: 'sentence' })
	pdf.setLanguage(language)
	pdf.setTitle(sheet.title + ' - ' + edition[language][variant])

	const fonts = {
		body:   await pdf.embedFont(StandardFonts.Helvetica),
		bold:   await pdf.embedFont(StandardFonts.HelveticaBold),
		code:   await pdf.embedFont(StandardFonts.Courier),
		symbol: await pdf.embedFont(StandardFonts.Symbol)
	}
	const page   = pdf.addPage(pageSize)
	const layout = layouts[variant]
	const { inputWidth, lineHeight, rowGap, sectionGap, textSize } = layout
	const width  = page.getWidth() - 2 * margin
	const bodyX  = margin + inputWidth + 9
	let   y      = page.getHeight() - 46
	page.drawText(sheet.title, { x: margin, y, font: fonts.bold, size: 26, color: ink })

	y -= 19
	page.drawText(edition[language][variant], { x: margin, y, font: fonts.bold, size: 11, color: accent })
	y -= 17
	for (const line of wrap(sheet.intro, fonts.body, 10.5, width)) {
		page.drawText(line, { x: margin, y, font: fonts.body, size: 10.5, color: ink })
		y -= 13
	}

	y -= 7
	page.drawRectangle({ x: margin, y: y - 9, width, height: 19, color: tint })
	page.drawText(sheet.labels[0], { x: margin + 7, y: y - 2, font: fonts.bold, size: 9, color: accent })
	page.drawText(sheet.labels[1], { x: bodyX, y: y - 2, font: fonts.bold, size: 9, color: accent })
	y -= 12

	for (const [heading, rows] of sheet[variant]) {
		y -= sectionGap
		page.drawText(heading, { x: margin, y, font: fonts.bold, size: 12, color: accent })
		y -= 4

		for (const [examples, explanation] of rows) {
			const code = Array.isArray(examples) ? examples : [examples]
			const body = wrapSentences(
				explanation, fonts.body, textSize, width - inputWidth - 9, segmenter, variant === 'minimal'
			)
			page.drawLine({
				start: { x: margin, y },
				end: { x: margin + width, y },
				thickness: 0.45,
				color: rule
			})
			code.forEach((line, index) => drawExample(page, line, margin + 7, y - 11 - index * lineHeight, fonts, layout))
			body.forEach((line, index) => page.drawText(line, {
				x: bodyX, y: y - 11 - index * lineHeight, font: fonts.body, size: textSize, color: ink
			}))
			y -= Math.max(code.length, body.length) * lineHeight + rowGap
		}
	}

	if (y < 45) throw new Error(`Content exceeds one A4 page: ${language}/${variant} (${y.toFixed(1)} pt)`)
	page.drawText(packageName, { x: margin, y: 24, font: fonts.body, size: 8, color: accent })

	const suffix   = variant === 'minimal' ? '.minimal' : ''
	const filename = join(__dirname, `${basename}${suffix}.${language}.pdf`)
	await writeFile(filename, await pdf.save())
}

Promise.all(Object.entries(sheets).flatMap(([language, sheet]) =>
	Object.keys(layouts).map(variant => render(language, sheet, variant))
))
	.catch(error => {
		console.error(error.message)
		process.exitCode = 1
	})
