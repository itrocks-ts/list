const { Representative } = require('@itrocks/class-view')
const { Component, Composite } = require('@itrocks/composition')
const list = require('../../../property-select/docs/orchestration/environment/list/fixture.cjs')
module.exports.ready = (async () => {
	await list.ready
	Component()(list.Invoice.prototype, 'lines')
	Composite()(list.Line.prototype, 'invoice')
	Representative('number')(list.Invoice)
})()
