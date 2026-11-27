# Session state dependency binding

## Integration with the it.rocks framework

The [it.rocks framework](https://github.com/itrocks-ts/framework) binds the `listSessionDependsOn` callbacks
in `src/custom-list.ts`
through `src/dependencies.ts:bind()`.
It delegates explicit saved-list loading to [`custom-list`](https://github.com/itrocks-ts/custom-list)
and records the modification marker separately from the list settings.
`listDependsOn({ view })` includes its breadcrumb view in the full list response.

## Integration outside the it.rocks framework

`listSessionDependsOn(overrides: Partial<ListSessionDependencies>)` from `@itrocks/list/session-state`
merges callbacks without removing unspecified defaults. Both callbacks default to no operation.

```ts
import { listSessionDependsOn } from '@itrocks/list/session-state'

listSessionDependsOn({
	prepare: async request => { /* Apply a requested saved configuration before loading the list. */ },
	changed: (request, type) => { /* Mark the active configuration modified. */ }
})
```

`prepare(request: action-request.Request): Promise<Response | void>` runs before session restoration.
A returned [`request-response.Response`](https://github.com/itrocks-ts/request-response) ends the request early.
`changed(request: request-response.Request, type: Type): void` runs after a changed state is persisted.
This compares consecutive applied settings, never the saved file, and ignores empty filter placeholders.

No callback changes the data source, mandatory record scope or path authorisation.

`listDependsOn({ view })` from `@itrocks/list` accepts an asynchronous request-scoped callback returning
`{ template, ...data }` or `undefined`. Its default returns `undefined`.
The full list template includes this view inside the article, after applied settings are persisted.
Feed pages, column JSON and column-only persistence responses do not render this view.
The host owns the supplied template and its data; the list does not depend on the host's view package.

`listDependsOn({ selection })` can supply a header fragment, optional `footer` and `footerSummary` fragments before
and after the selection actions, and a handler for updates. The view callback receives the request, effective list
criteria and result count. `resolveListSearch` from `@itrocks/list/search` captures the criteria from the routed HTML
list action, including its mandatory scope and path authorisation.

`listDependsOn({ columnsView })` supplies a renderer for selected cells and an optional view fragment for the full
list. The callback receives the list type and its first applied sort entry, if any. Its `output(column, cell)`
callback can return HTML, including an empty string, or `undefined` to use the standard renderer. The same callback
applies to the initial list, feed rows, and cells added by the column selector. The optional `view` follows the
usual `{ template, ...data }` contract. The optional `sort` replaces the storage sort for the initial list and
feed rows while retaining the applied sort and direction in the interface. The callback leaves the selection,
search and scope unchanged.
