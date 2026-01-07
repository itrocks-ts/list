import { Request } from '@itrocks/request-response'
import { Limit }   from '@itrocks/storage'
import { Option }  from '@itrocks/storage'

export class Feed
{

	static DEFAULT_LIMIT       = 50
	static DEFAULT_LINE_HEIGHT = 30
	static DEFAULT_OFFSET      = 0

	limit      = Feed.DEFAULT_LIMIT
	lineHeight = Feed.DEFAULT_LINE_HEIGHT
	offset     = Feed.DEFAULT_OFFSET
	template   = __dirname + '/feed.html'

	getParams(request: Request)
	{
		const header  = request.headers['xhr-info']
		const xhrInfo = header ? JSON.parse(header) : {}
		this.limit = xhrInfo.targetHeight
			? Math.ceil(xhrInfo.targetHeight / this.lineHeight)
		: (xhrInfo.visibleRows ?? Feed.DEFAULT_LIMIT)
		this.offset = +request.data.offset
	}

	readOptions(options = new Array<Option>)
	{
		options.push(new Limit(this.limit, this.offset))
		return options
	}

}
