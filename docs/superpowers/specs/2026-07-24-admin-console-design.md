# Admin Console Design

## Goal

Build an in-mini-program admin console for trusted operations against the CloudBase database.
Only the designated administrator OpenID can access the console or execute admin operations.
The first version should support safe CRUD across the app's known database collections, with an audit trail for writes.

## Current context

- The CloudBase environment is `cloudbase-d7gx0ikiwa58549a4`.
- Database rules are locked down with `read: false` and `write: false`, so all app access already goes through cloud functions.
- Existing cloud functions use `wx-server-sdk` and validate callers from the `users` collection.
- Existing functional collections are:
  - `users`
  - `projects`
  - `categories`
  - `family_assets`
  - `asset_changes`
- Existing pages do not include an admin entry in the tab bar.

## Chosen approach

Use a new `admin` cloud function as the only database access layer for admin operations.
The mini-program admin page will never call `wx.cloud.database()` directly.

This keeps the database rules closed and prevents users from bypassing server-side checks.
The admin function will hard-code the allowed admin OpenID in server-side code for the first version.
That is intentionally simpler and safer than storing the admin OpenID in editable database config, because a bad edit could lock out the only admin.

## Non-goals

- Do not build a separate web admin site.
- Do not expose raw CloudBase credentials.
- Do not loosen database security rules.
- Do not support arbitrary collection names outside the explicit allowlist.
- Do not make `admin_audit_logs` editable from the admin console in the first version.

## Security model

The admin cloud function must check the caller before every action:

1. Read `cloud.getWXContext().OPENID`.
2. Compare it with the single configured `ADMIN_OPENID`.
3. Throw `ADMIN_DENIED` if the caller is not the admin.

The admin page can hide itself from non-admin users, but this is only a convenience.
The cloud function is the source of truth for authorization.

Allowed data collections for CRUD:

- `users`
- `projects`
- `categories`
- `family_assets`
- `asset_changes`

Read-only admin-system collections:

- `admin_audit_logs`

Disallowed:

- Any collection not listed above.
- Updating or deleting `admin_audit_logs`.

## Cloud function API

Create `cloudfunctions/admin`.

Supported actions:

```js
{ action: 'check' }
```

Returns whether the current user is admin.

```js
{ action: 'listCollections' }
```

Returns the allowed CRUD collection list and read-only collection list.

```js
{
  action: 'query',
  collection: 'projects',
  keyword: '华泰',
  limit: 20,
  offset: 0
}
```

Returns a paginated list. `limit` is capped at 50.
For `projects`, keyword search should match `name` first because that is the practical user need.
For other collections, first version may support `_id` exact lookup plus default paginated listing.

```js
{
  action: 'get',
  collection: 'projects',
  id: 'document-id'
}
```

Returns one document by `_id`.

```js
{
  action: 'create',
  collection: 'projects',
  data: { ... }
}
```

Creates one document. `data` must be a plain object.

```js
{
  action: 'update',
  collection: 'projects',
  id: 'document-id',
  data: { ... }
}
```

Partially updates one document. `data` must be a plain object and must not include `_id`.

```js
{
  action: 'set',
  collection: 'projects',
  id: 'document-id',
  data: { ... }
}
```

Overwrites one document. This is dangerous and must require explicit confirmation in the page.

```js
{
  action: 'remove',
  collection: 'projects',
  id: 'document-id'
}
```

Deletes one document. This is dangerous and must require explicit confirmation in the page.

## Audit logging

Create `admin_audit_logs`.

For every write action (`create`, `update`, `set`, `remove`), write an audit document:

```js
{
  operatorOpenid: '...',
  action: 'update',
  collection: 'projects',
  documentId: '...',
  before: { ... },
  after: { ... },
  createdAt: db.serverDate()
}
```

For `create`, `before` is `null`.
For `remove`, `after` is `null`.

The write operation and audit write should run in a transaction when CloudBase supports the target operation in the transaction path.
If a transaction is not practical for a specific operation, the admin function should still fetch `before`, execute the write, then write the audit log immediately after.

## Mini-program UI

Add a hidden admin page:

- `miniprogram/pages/admin/admin`

Do not add it to the tab bar.
Add it to `app.json` so it can be opened by path.
Add a hidden entry by long-pressing the “家庭理财” title on the home page.
This entry only navigates to the admin route; the cloud function remains the authorization source of truth.

Entry behavior:

- The page calls `admin.check` on load.
- If not admin, show a simple no-permission state.
- If admin, show the console.

Console layout:

1. Collection picker.
2. Query controls:
   - `_id` input for exact lookup.
   - Keyword input for supported keyword search.
   - Query button.
3. Result list:
   - Show `_id` and compact JSON preview.
   - Tap to open full JSON editor.
4. Actions:
   - Create document.
   - Update selected document.
   - Set/overwrite selected document.
   - Delete selected document.

JSON editor:

- Use a textarea containing formatted JSON.
- Validate JSON before submitting.
- Show readable error messages for invalid JSON.

Danger confirmations:

- `set` requires confirming text such as `确认覆盖`.
- `remove` requires confirming text such as `确认删除`.
- Before delete, fetch and show the current document snapshot.

## Error handling

Map known errors to readable messages:

- `ADMIN_DENIED`: 无管理员权限
- `COLLECTION_NOT_ALLOWED`: 集合不允许操作
- `DOCUMENT_ID_REQUIRED`: 请输入文档 ID
- `DOCUMENT_NOT_FOUND`: 文档不存在
- `JSON_INVALID`: JSON 格式不正确
- `DATA_INVALID`: 数据必须是对象
- `UNKNOWN_ACTION`: 未知操作

Unknown errors should still show a generic failure toast and log details to console.

## Testing strategy

Cloud function tests:

- Non-admin caller is denied for every action.
- Admin caller can list allowed collections.
- Disallowed collection names are rejected.
- Query caps `limit` at 50.
- Create writes the document and audit log.
- Update rejects `_id` in payload, updates the document, and writes before/after audit.
- Set overwrites the document and writes before/after audit.
- Remove deletes the document and writes before/null audit.
- `admin_audit_logs` cannot be updated or deleted.

Mini-program tests:

- Admin page calls `admin.check` on load.
- Non-admin state hides CRUD controls.
- Collection picker triggers query.
- Invalid JSON blocks submission.
- Update calls the admin cloud API with parsed JSON.
- Set and remove require explicit confirmation.

Workflow verification:

- Existing test suite passes.
- Changed cloud function deployment detects and deploys `admin`.
- Preview upload and QR generation run after merging to the default branch.

## Open implementation notes

- The actual admin OpenID must be filled into `cloudfunctions/admin/index.js` during implementation.
- The user has said "只有我这个 openid"; if the exact value is not already available from the live `login` result or prior configuration, ask the user before implementation.
- First version optimizes for safe operations, not advanced querying.
