[![npm version](https://img.shields.io/npm/v/@itrocks/list?logo=npm)](https://www.npmjs.org/package/@itrocks/list)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/list)](https://www.npmjs.org/package/@itrocks/list)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/list?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/list)
[![issues](https://img.shields.io/github/issues/itrocks-ts/list)](https://github.com/itrocks-ts/list/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# list

Generic action-based object list navigation in HTML and JSON.

*This documentation was written by an artificial intelligence and may contain errors or approximations.
It has not yet been fully reviewed by a human. If anything seems unclear or incomplete,
please feel free to contact the author of this package.*

## Installation

```bash
npm i @itrocks/list
```

## Usage

`@itrocks/list` exposes a single `List` action that you can plug into your
existing [@itrocks/action](https://github.com/itrocks-ts/action) workflow.

The `List` action is meant to be attached to a domain class (for example an
`User` entity) and is responsible for rendering either an HTML list page or a
JSON payload depending on the requested format.

```ts
import { List } from '@itrocks/list'
import { Request } from '@itrocks/action-request'

// The domain object you want to list
class User {
	/* ... */
}

// Create an action instance for this domain
const listUsers = new List<User>()

// In your controller / route handler
async function usersHtml (request: Request<User>) {
	return listUsers.html(request)
}

async function usersJson (request: Request<User>) {
	return listUsers.json(request)
}
```

The request object is typically created by
[@itrocks/action-request](https://github.com/itrocks-ts/action-request) from
an incoming HTTP request.

## API

### `class List<T extends object = object> extends Action<T>`

Main entry point of the module. It extends
[@itrocks/action](https://github.com/itrocks-ts/action)'s `Action` class and
adds list‑oriented behaviors.

#### Type parameter

- `T` – The domain object type you want to list (for example `User`).

#### Properties

- `lineHeight: number` – Estimated height of a row in pixels. This is mainly
  used by the front‑end to compute scrollable area and virtualisation.

#### Methods

##### `html(request: Request<T>): Promise<HtmlResponse>`

Builds an HTML response for the list view.

The returned
[`HtmlResponse`](https://github.com/itrocks-ts/core-responses#htmlresponse)
contains the rendered table along with paging, filters and actions configured
through your `Action` stack.

Typical usage is to call this method from a route that should return HTML:

```ts
fastify.get('/users', async (req, reply) => {
	const request = toActionRequest<User>(req) // project helper
	const response = await listUsers.html(request)
	reply
		.status(response.status)
		.headers(response.headers)
		.type('text/html')
		.send(response.body)
})
```

##### `json(request: Request<T>): Promise<JsonResponse>`

Builds a JSON representation of the same list data.

The returned
[`JsonResponse`](https://github.com/itrocks-ts/core-responses#jsonresponse)
typically contains the current page of results, meta‑data (page, page size,
total count) and any additional information configured via your
`Action`/`List` setup.

This is useful for API‑only endpoints, asynchronous front‑end components or
infinite‑scroll lists.

```ts
fastify.get('/api/users', async (req, reply) => {
	const request = toActionRequest<User>(req)
	const response = await listUsers.json(request)
	reply
		.status(response.status)
		.headers(response.headers)
		.send(response.body)
})
```

## Typical use cases

- Back‑office list screens for any business entity (users, products, orders…).
- Filterable / searchable tables built on top of
  [@itrocks/table](https://github.com/itrocks-ts/table).
- JSON list endpoints consumed by SPA or mobile applications.
