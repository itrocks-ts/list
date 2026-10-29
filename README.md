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

## Search filters

HTML list filters interpret the first hyphen as an interval separator. Spaces around the bounds are ignored:

- `2000 - 2010` uses inclusive `between(2000, 2010)`.
- `-2010` means less than or equal to 2010.
- `2000-` means greater than or equal to 2000.
- A hyphen with neither bound applies no criterion.

Leading `>`, `>=`, `<`, `<=`, `<>`, `!=` and `!` apply the corresponding comparison.
The prefixes `<>`, `!=` and `!` mean not equal; the equals sign after `!` is optional.
With `*` or `?` in their operand, these three prefixes request `NOT LIKE` instead, using the same wildcard conversion.
A leading `=` requests exact equality, including an empty string. Spaces around explicit comparison operands are ignored.
Explicit operators take precedence over interval syntax, so `>=-10` compares with negative ten and `=A-B` matches `A-B`.

Without an explicit comparison operator, `*` and `?` request `LIKE` for any property type, replacing all `*` with `%`
and all `?` with `_`. The pattern is used as supplied without an extra trailing wildcard. Wildcards take precedence
over interval syntax, so `2000-20??` becomes the pattern `2000-20__`.

Without an operator, wildcard or hyphen, text properties use prefix matching (`Alice` becomes `LIKE 'Alice%'`).
Other property types retain equality. The type of nested properties is resolved from the final property.
Any later hyphens in an interval remain part of the upper bound.
The original text stays in the input and session; feed requests reconstruct the same criterion from session state.
The data source converts the bounds according to the property's type.

### Date filters

Date properties use the dedicated `dateSearch()` implementation in `src/date-search.ts` before ordinary interval
and wildcard processing. Slash and compact dates use the same request-scoped translated `dd/MM/yyyy` format as
the framework's date output. ISO dates always use year-month-day order; a leading four-digit year also permits
`yyyy/MM/dd`.

- Four digits select the whole year; one or two digits select that month in the current year (`6` and `06` both mean June).
- Slash dates accept day/month or month/day according to the display format, with an optional year.
- Month/year and year/month with a four-digit year select that whole month; either slash or hyphen is accepted.
- Hyphen dates use ISO order, including short fields such as `26-3-9`. `2020-03` selects March 2020.
- Six and eight digits are compact local dates, with a two-digit or four-digit year respectively.
- A separated one-, two- or three-digit year is completed using the current decade, century or millennium.
- Date ranges use slash dates, for example `01/03/2020-09/03/2020` in day/month order. Open bounds are inclusive.
- A hyphen between two three- or four-digit years selects all dates from the first January to the last December:
  `2026-2027` includes both whole years. Three-digit years use the current millennium.
  Other hyphens without slash are ISO date separators, so `2026-03` still selects March 2026.
- A leading or trailing hyphen opens the range, including ISO dates: `2026-` starts on 1 January 2026,
  `-2026` ends on 31 December 2026, `6-` starts on 1 June of the current year, and `-2020-02` includes
  all dates up to the end of February 2020. Missing components follow the same date completion rules.

Calendar periods include their full final day. Explicit comparisons use the corresponding beginning or end of the
period: `>2020` starts after 2020, and `<=2020` includes all of 2020. Not-equal comparisons exclude the whole period
through `NOT BETWEEN`.

Date digits may contain `%`, `?` or `*`. Patterns are reordered into SQL year-month-day order, `?` becomes `_` and `*`
becomes `%`. For example `??/03/2020` becomes `2020-03-__%` in day/month order; the final `%` also permits stored times.
Each wildcard counts as one digit while identifying the input format and completing date fields. For example,
`??` selects month patterns in the current year, `????` selects year patterns, and a two-character year such as `**`
is prefixed with the current century before replacing the wildcards. One-character month and day fields are zero-padded.
The prefixes `!`, `!=` and `<>` use `NOT LIKE` for these patterns.
On a date property, `?` alone means a non-empty date (`IS NOT NULL`); `!?`, `!=?` and `<>?` find missing dates (`IS NULL`).
Invalid dates match no rows, without calendar rollover.
Original input text is retained in session and restored for subsequent feed requests.

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
through `/list/json`. Adding `columns=<ordered-paths>` saves the column configuration in the same request.
Configuration-only requests return 204. The browser serialises both kinds of request to preserve the latest order.

The browser entry `@itrocks/list/property-select.js` exports `ListPropertySelect`, with explicit metadata, table
addition, column persistence and narrow pane ports. The framework mounts it only on compatible lists and disposes it on
navigation. It reserves pending paths and confirms accepted additions. The checkbox, its cell and the property name
toggle terminal and relation columns. The checkbox clears immediately before the red removal flash. Reselecting during that flash cancels removal,
checks the property again and highlights the retained column green, then saves the restored configuration.
The removal configuration is sent at the initial click, independently of the animation; deleting the cells sends no
additional request.
After a completed removal, a later click returns the column immediately right of its former left neighbour, or left of its former right neighbour if the left one is absent. If neither remains,
it is appended. Neighbours are kept only in this pane instance's memory and cleared on folding, closure or disposal;
they never enter session state. Drag placement continues to follow the drop position.
An explicit addition intention always requests addition: an existing column is revealed and highlighted green without removal.
Property names and checkbox cells toggle the same selection; chevrons and intermediate path segments navigate.
The consumer checks row identity before insertion. Failed selection leaves the context intact. It loads only currently
visible row ids through the current feed position; changing the row view while loading rejects the obsolete response with a
discreet red background. Clicks commit the translated full-path heading and filter locally, before any server response.
One asynchronous request
then saves the column order and loads the values; there is no separate admission request. A new drag calls the same
addition code as a click with `{ effects: false, hidden: true }`, then moves the committed column through the standard
table reorder operation with `{ adding: true, removal: true }`. Its combined request loads values immediately while
cells remain hidden, without width animation, flash or automatic scroll. On first pointer entry, the column appears
with any values already received and uses a green background and plus indicator. An outside drop deletes it through
the standard header-origin removal and saves once, even if the pointer never entered. Cancelling a new addition also
removes it. Dropping inside saves only a changed column order; it never reloads values.
The optional `request(query, signal)` port shares the list persistence queue.
Existing-column moves and removals only save the column configuration. The header contains each label and its filter
together, so it uses the table addition plugin's single-header contract.

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

The initial HTML response carries the configured selector bootstrap, including metadata, template, state revision
and session generation. Mounting consumes this snapshot without application requests or state writes. Metadata is
shared by navigation, suggestions and selection; unchanged column paths do not rebuild suggestions.

The public browser `@itrocks/list/selector-state.js` exports `HttpStateStore`, using same-origin credentials and
no-store requests. Its optional third constructor argument `{ generation, key, record }` supplies the initial read;
subsequent reads, including conflict recovery, use the server. `ListSelectorOptions.advice` supplies configured
destinations. List column changes refresh used paths; only a confirmed new addition feeds the selector's recents.
The browser displays recoverable persistence errors.

## External column transport

The list consumer supplies cells containing a non-breaking space and loads all currently loaded row ids through
one combined configuration/projection request after the local commit. A failed values request leaves the column
in place, with a discreet red background on its data cells. The spaces remain; no error text, retry button or automatic
retry is added. The translated full path comes from the selector's displayed row and available branch metadata.

Pending paths and the active drag are reserved before asynchronous work. Used paths include the new column immediately
and retain their committed order throughout the drag. New accepted drops feed recents; moves and
cancellations do not. Row-view changes and view disposal cancel transport. The desktop pane stays open, and capture is
owned by the selector's surviving source controller. The consumer imports no home implementation, SQL or hydration code.

The consumer requests `pane.suspend({ mobileOnly: true })` only when a source gesture has been recognised. The pane
host owns its responsive breakpoint. The token is restored after acceptance and column persistence, or after
cancellation/rejection; it never focuses the search field. View disposal removes the registration and invalidates late
restoration. Custom pane adapters may implement the same optional suspension argument without importing `home`.

`node test/browser-requests.mjs` checks request counts and real mouse gestures in Chromium with synthetic HTTP data.
It covers initial mount, click placeholders, hidden drag additions, values for 80 loaded rows before entry or drop,
green addition indicators, outside removal before and after entry, terminal toggles and reordering.
`node test/browser-removal-cancel.mjs` checks immediate unchecking and cancellation during the red flash through
checkbox, cell and name clicks, for terminal and relation columns, with an immediate removal save followed by a restored configuration save.
`node test/browser-column-positions.mjs` checks neighbour-based reinsertion in the real table, both fallbacks,
and memory expiry on closure, including closure during a pending removal. It starts its own synthetic HTTP fixture.
Set `PS_PLAYWRIGHT_MODULE` to an installed Playwright module when using a different runtime.

`node test/browser-toggle.mjs` exercises the real framework list against the synthetic recipe database on port 13316
(`PS_DATABASE_PORT` overrides it). It starts and stops its own application instance and checks desktop keyboard, touch,
reduced motion, horizontal reveal, removal and temporary-row transitions. `PS_TOGGLE_URL` reuses an existing instance
of that recipe instead. The synthetic database must already be running; this test never resets it.

## Component column batches

Selecting a component group sends one request with `loadColumns` listing missing paths, `columns` containing the
complete final configuration and `rowIds` identifying visible roots. The response contains `columns`, each with
`path`, `label`, `sortable` and rendered `rows`. Empty `loadColumns` saves group removals without querying records.
Failed batch projections preserve the saved configuration. Checkboxes update optimistically before metadata or HTTP
requests, for both individual selections and groups. The host commits placeholders and starts the shared green flash
before the values request; early values remain masked until the flash finishes, while late values appear immediately.
Removal starts one red flash after publishing the unchecked state, then sends the configuration request. Front-end
columns disappear at the animation deadline even if that request is still pending. Group actions use one HTTP request.

Sub-properties reached through one collection marked `@Component` are projected together when its element type
has one matching `@Composite` back-reference. The list reads visible root identities once, then all requested fields
in one query per component collection, restricted to those identities. Singular ancestors and related object labels
share these queries. Values retain component order and duplicates; these columns are not sortable.
The same projection is used when reloading the list or adding an individual component sub-property.

`test/browser-component-batch.mjs` verifies real browser interactions, HTTP request counts, MySQL query counts,
rendered values, mandatory row scope, partial selection, removal and session restoration. It creates and cleans up
its own temporary database and server using the existing selector integration recipe.
