# List state stored in the session

The `List.html()` action stores display parameters in the server-side session. Sorting, columns, and the other list
properties that extend `Parameter` share this persistence mechanism. It does not rely on `localStorage` or on a cookie
that directly contains the values: the cookie identifies the session, whose contents depend on the store configured by
the application.

## Normal loading and saving cycle

For every normal HTML render, `List.html()` performs these operations in order:

1. `load()` looks for state in `request.session.list[routeOf(type)]`;
2. each `List` property that is a `Parameter` receives its value through `unserialize()`;
3. `getParams()` applies request parameters or initializes missing values;
4. `save()` calls `serialize()` on every `Parameter` and replaces the route state in the session;
5. the search and rendering operations use this final state.

The dedicated column-order request follows the shorter path described in its section. It stops after saving and does
not run the search and rendering steps.

The `routeOf(type)` key isolates preferences for each domain class. The stored structure resembles this example:

```ts
request.session.list[routeOf(type)] = {
	columns: ['name', 'email', 'createdAt'],
	feed: undefined,
	filter: { name: 'Alice', email: '', createdAt: '' },
	sort: { name: false, createdAt: true }
}
```

The keys in `sort` follow their priority order. Their boolean value is `true` for descending order and `false` for
ascending order.

## Column sorting

Clicking a header builds a request to the form action with `sort=<property>` and, for descending order, the `reverse`
parameter. The response replaces the `main` target.

After loading the session, `Sort.getParams()` behaves as follows:

- when `Sort.sorted` comes from the session, its keys and boolean values define the sort priority and direction;
- without session state, it first uses a storage `Sort` option, then the metadata returned by `sortOf(type)`;
- when the request contains `sort`, the requested property moves to the first position and takes the supplied
  direction, while the remaining criteria retain their previous order.

`Sort.serialize()` then stores the ordered object in the session. On the next render, this object is used instead of
values obtained from storage options or reflection.

## Column display order

The `TableColumnReorder` plugin moves every cell in a column during a drag. When a drop actually changes its position,
the `onReorder` callback:

1. reads the `th[data-property]` headers in their new DOM order;
2. encodes each property name and joins them into one comma-separated `columns` parameter;
3. sends a discreet `fetch()` request with `keepalive`, without modifying the DOM.

For example, the request conceptually contains:

```text
?columns=name,email,createdAt
```

The server also accepts repeated `columns` parameters for compatibility with the previous format. In both cases,
`Columns.getParams()` splits comma-separated values.

The dedicated request loads the session and applies the new order. It immediately saves all restored `Parameter`
instances, then returns an empty `204` response before `Feed.getParams()`, `Filter.getParams()`, `Sort.getParams()`, or
any `DataSource` access. The table already reordered by the plugin, feed-loaded rows, and scroll position therefore
remain unchanged.

The received value is applied only when it is a complete, duplicate-free permutation of the properties returned by
`ListReflectClass(type).listProperties()`. This validation prevents an incomplete or altered request from hiding or
inventing a column. Even when the value is invalid, the dedicated request saves the previously loaded state, or the
default reflected state when none was loaded, and returns `204` without rendering.

When no new order is supplied, the columns restored by `Columns.unserialize()` are retained. Reflection functions are
used as a fallback only when the session does not contain any columns yet. Finally, `Columns.serialize()` stores the
names in their current order. The drop therefore applies to all subsequent renders of the same list during the current
session.

To render the data, each loaded object is associated with object-bound `ReflectProperty` instances through
`Columns.propertiesOf()`. The feed iterates over these properties in `Columns` order instead of calling
`listProperties()` again on the object. Cells therefore follow the same session state as headers while preserving the
value display transformations.

This mechanism means that a new reflection-defined order does not replace an existing session preference. To restore
the reflected order immediately after metadata changes, remove the relevant list entry from the session or start a new
session.
