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
