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

##### `html(request: Request<T>, scope?: SearchType<T>): Promise<HtmlResponse>`

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

##### `json(request: Request<T>, scope?: SearchType<T>): Promise<JsonResponse>`

Builds a JSON response from the objects returned by the configured data source.

The returned
[`JsonResponse`](https://github.com/itrocks-ts/core-responses#jsonresponse)
contains those objects. Unlike `html()`, this method does not process the HTML list's
filters, sorting, pagination, templates or count.

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

### Mandatory scopes

Both `html()` and `json()` accept an optional application scope as a `SearchType<T>`. Build
the scope from trusted application state rather than passing request data through directly.

For `html()`, the scope is merged after user filters, so it takes precedence if both define
the same property. The resulting search is passed to both `dataSource().select()` and
`dataSource().count()` without replacing list loading, sorting, pagination, metadata,
templates or the configured data source.

For `json()`, the scope is passed directly to `dataSource().search()`.

## Typical use cases

- Back‑office list screens for any business entity (users, products, orders…).
- Filterable / searchable tables built on top of
  [@itrocks/table](https://github.com/itrocks-ts/table).
- JSON list endpoints consumed by SPA or mobile applications.

## Projected HTML columns

HTML lists, feed pages and visible-column requests use the configured `DataSource.select()` implementation. The JSON
action retains the full-entity `search()` contract. Mandatory scope overrides user filters and applies to projection,
visible-id reloads and count. Singular columns require a capable projection adapter. Direct collection columns load
their values through the configured entity reader for the projected visible row ids.

Columns are canonical root-relative paths. The list uses public reflection to resolve metadata and supplies each
projected value to the existing HTML transformer of its final property. Singular object columns request their finite
representative scalar closure, including nested representative relations. Singular rendering performs no lazy read.
Absent relationships render empty cells; ignored scalar conversions render `Unavailable`;
missing representative fields fail explicitly. Plural paths through a relationship and paths with unknown multiplicity
are refused before SQL.

Direct collections display representative values separated by commas. A collection decorated with
[`@Component()`](https://github.com/itrocks-ts/composition) displays up to eight representative values separated by
commas. From nine values, it displays the count followed by the translated plural name of the destination type.
Component collections never render a nested table in a list cell. The optional
`@MultipleOutput('commas' | 'lines')` property decorator from `@itrocks/list/multiple-output` controls ordinary
collections; `'lines'` displays them as a list.
`multipleOutputOf(type, property)` returns the effective mode and inherits explicit property metadata. For example:

```ts
import { MultipleOutput } from '@itrocks/list/multiple-output'

class Movie {
	@MultipleOutput('lines')
	genres!: Genre[]
}
```

`@itrocks/list/projection` exports `ListColumn`, `representationFields` and `listRepresentationDependsOn`. Custom output
transformations must declare every input through the `fields(type, ancestors, property?)` resolver when their inputs
differ from `representativeOf(type)`. Return relative paths, or `undefined` to use the standard metadata. An object
property/type transformer other than public `storeOutput` is refused before querying unless the resolver declares its
fields. This check also applies to nested representative relations. A custom global representative callback must provide
a resolver as part of its composition; arbitrary callback internals are not inferred. Cyclic representative expansion is
rejected. The hook does not change SQL construction or object reconstruction. Object heading sort expands to
representative scalar paths followed by object identity; storage adds the root tie-breaker.

`listDependsOn({ access })` accepts an asynchronous request-scoped adapter returning `{ root?, authorise(path) }`. The
framework binds configured metadata roots and checks selected paths, representative fields, filters and ordering.
Without a configured root the ordinary list remains available, with no selector command. Never retain request state in
the dependency hook. The configured data source remains responsible for storage and mandatory record scope.

`GET /<business-route>/list?column=<path>&rowIds=<comma-separated-identifiers>` uses the HTML action and returns a JSON
column descriptor with rendered cells keyed by root id. It intersects visible ids with the current filters and mandatory
scope, makes one projection and performs no count. Invalid selections return 400. Full entity JSON remains available
through `/list/json`. Column configuration saves use the established `columns` parameter and return 204.

The browser entry `@itrocks/list/property-select.js` exports `ListPropertySelect`, with explicit metadata, table
addition, column persistence and narrow pane ports. The framework mounts it only on compatible lists and disposes it on
navigation. It reserves pending paths, confirms accepted additions, reveals/highlights duplicates without moving focus,
and checks row identity before insertion. Failed selection leaves the context intact. It loads only currently visible
row ids; changing the row view while loading rejects the obsolete response with a retry message. Click requests await
their data before committing a new column. Desktop drags create immediate placeholder columns through the public
table external transaction. The header contains each
label and its filter together, so it uses the table addition plugin's single-header contract.

`npm test` runs the server contracts; `test/property-select.test.mjs` covers projection, representation, scope, path
configuration, filters and ordering. Real framework/browser proof is tracked by the property-select L2-LIST delivery.

## Selector session state

The public `@itrocks/list/selector-state` entry exports `SessionStateStore`, `SelectorStateAction`, `selectorStateKey`
and the composition hook `listStateDependsOn({ transaction })`. The injected function runs an operation against the
request's authoritative session snapshot and resolves only after durable save. No session is retained by the binding.
`SessionStateStore` implements the selector's read/write/remove port with revision checks and removal tombstones in
`session.propertySelect`, separate from `session.list`. The framework supplies the HTTP adapter transaction.

`selectorStateKey(request)` uses the router-resolved route, identifying ids and list action. Query and format arguments
do not affect it. The rendered article supplies this opaque key to the browser. `GET`, `PUT` and `DELETE` at
`/property-select/state/json` authorise the target list on every request; conflicts return 409 and ended sessions 410.
Writes echo the opaque `X-Property-Select-Session` token returned by a read. It cannot identify or authenticate a user;
it prevents a mounted selector from writing its old state into a new session.

The public browser `@itrocks/list/selector-state.js` exports `HttpStateStore`, using same-origin credentials and
no-store requests. `ListSelectorOptions.advice` supplies configured destinations. List column changes refresh used
paths; only a confirmed new addition feeds the selector's recents. The browser displays recoverable persistence errors.

## External column transport

The list consumer supplies immediate cells, authorises admission and loads the current visible ids through the same
projection/rendering route used for click additions. `validate=1` on a `column` request checks representation and
permission without selecting records; it prevents unsupported object and nested plural paths from being confirmed
on drop.
Admission is independent of the optional values request. A slow or failed values request leaves valid drops accepted;
failed cells expose `Retry values` without another addition or recent entry.

Pending paths and the active drag are reserved before asynchronous work. Used paths retain their committed order
throughout the drag, and configuration saves exclude provisional cells. New accepted drops feed recents; moves and
cancellations do not. Row-view changes and view disposal cancel transport. The desktop pane stays open, and capture is
owned by the selector's surviving source controller. The consumer imports no home implementation, SQL or hydration code.

The consumer requests `pane.suspend({ mobileOnly: true })` only when a source gesture has been recognised. The pane
host owns its responsive breakpoint. The token is restored after acceptance and column persistence, or after
cancellation/rejection; it never focuses the search field. View disposal removes the registration and invalidates late
restoration. Custom pane adapters may implement the same optional suspension argument without importing `home`.
