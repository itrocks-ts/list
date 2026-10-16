const { File } = require('@itrocks/class-file')
const { initStoreHtmlTransformers } = require('@itrocks/core-transformers')
const { Representative } = require('@itrocks/class-view')
class Country {}
class City {}
class Invoice {}
for (const type of [Country, City, Invoice]) {
	File(__filename)(type)
	initStoreHtmlTransformers(type)
}
Representative('name')(Country)
Representative('name', 'country')(City)
module.exports = { City, Country, Invoice }
