# Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hidden WeChat mini-program admin console that only the configured administrator OpenID can use to safely query and modify the app's known CloudBase collections, with an audit record for every write.

**Architecture:** A new `admin` cloud function is the only admin data gateway. It checks the caller OpenID before dispatching any action, applies a fixed collection allowlist, performs writes and audit inserts in one CloudBase transaction, and returns plain response objects to a hidden mini-program page. The page uses the existing `services/cloud.js` call wrapper, provides collection/query controls and a JSON editor, and never accesses `wx.cloud.database()` directly.

**Tech Stack:** WeChat mini-program JavaScript/WXML/WXSS, `wx-server-sdk`, CloudBase document database transactions, Jest 29, GitHub Actions/CloudBase CLI.

## Global Constraints

- CloudBase environment remains `cloudbase-d7gx0ikiwa58549a4`.
- The only administrator OpenID is stored only in `cloudfunctions/admin/index.js`.
- Database rules remain `{ "read": false, "write": false }`.
- CRUD allowlist is exactly `users`, `projects`, `categories`, `family_assets`, and `asset_changes`.
- `admin_audit_logs` is queryable but cannot be created, updated, overwritten, or removed through the console.
- No arbitrary collection name may reach `db.collection()`.
- Query `limit` defaults to 20 and is capped at 50; `offset` defaults to 0.
- The admin page is registered in `app.json` but is not added to the tab bar.
- `set` and `remove` require explicit confirmation; delete confirmation shows the latest document snapshot.
- Every `create`, `update`, `set`, and `remove` writes an audit record containing operator, action, collection, document ID, before, after, and server timestamp.
- Continue using the existing push-to-`feature/family-finance-projects` workflow for tests, changed-function deployment, mini-program upload, and preview QR generation.

---

## File Map

| File | Responsibility |
|---|---|
| `cloudfunctions/admin/index.js` | Authorize the admin, validate requests, query allowlisted collections, perform transactional writes, and create audit records. |
| `cloudfunctions/admin/index.test.js` | Exercise authorization, validation, queries, CRUD behavior, and audit contents with an in-memory CloudBase mock. |
| `cloudfunctions/admin/package.json` | Declare the cloud function and `wx-server-sdk` runtime dependency. |
| `cloudfunctions/admin/package-lock.json` | Pin the dependency tree deployed by CloudBase. |
| `cloudbaserc.json` | Register the `admin` function so the existing deployment workflow can deploy it. |
| `miniprogram/services/cloud.js` | Expose typed admin request helpers over the existing `callCloud` function. |
| `miniprogram/__tests__/cloud.test.js` | Verify each admin helper sends the exact cloud-function payload. |
| `miniprogram/pages/admin/admin.js` | Manage permission state, collection selection, querying, JSON parsing, CRUD calls, confirmations, and user-visible errors. |
| `miniprogram/pages/admin/admin.wxml` | Render the permission state, collection/query controls, result list, editor, and action buttons. |
| `miniprogram/pages/admin/admin.wxss` | Apply the existing WeUI design system to the console. |
| `miniprogram/pages/admin/admin.json` | Set the page navigation title. |
| `miniprogram/__tests__/admin.test.js` | Verify permission handling, querying, JSON validation, CRUD payloads, and destructive confirmations. |
| `miniprogram/app.json` | Register the hidden `/pages/admin/admin` route without changing the tab bar. |
| `miniprogram/pages/home/home.js` | Provide a hidden long-press navigation handler for the admin route. |
| `miniprogram/pages/home/home.wxml` | Bind the home title long-press gesture to the hidden admin entry. |
| `miniprogram/__tests__/home.test.js` | Verify the hidden entry navigates to `/pages/admin/admin`. |
| `scripts/__tests__/detect-changed-functions.test.js` | Prove changes under `cloudfunctions/admin` are selected for automatic deployment. |

### Task 1: Admin Authorization and Read API

**Files:**
- Create: `cloudfunctions/admin/index.js`
- Create: `cloudfunctions/admin/index.test.js`
- Create: `cloudfunctions/admin/package.json`
- Create: `cloudfunctions/admin/package-lock.json`
- Modify: `cloudbaserc.json`

**Interfaces:**
- Consumes: `cloud.getWXContext().OPENID`, `db.collection(name)`, `db.RegExp(options)`.
- Produces: `exports.main(event)` supporting `check`, `listCollections`, `query`, and `get`.
- Returns: `{ ok: true, isAdmin: true }`, `{ ok: true, collections, readOnlyCollections }`, `{ ok: true, documents, limit, offset }`, or `{ ok: true, document }`.

- [ ] **Step 1: Write failing authorization and read tests**

Create `cloudfunctions/admin/index.test.js` with an in-memory `wx-server-sdk` mock owned by the test file:

```js
const { ADMIN_OPENID } = require('./index').__test;
let currentOpenid;
let documents;

function resetDatabase() {
  currentOpenid = ADMIN_OPENID;
  documents = {
    users: [{ _id: 'user-1', openid: ADMIN_OPENID, enabled: true }],
    projects: [
      { _id: 'project-1', name: '华泰稳健一号', principal: 10000 },
      { _id: 'project-2', name: '银行存款', principal: 20000 }
    ],
    categories: [],
    family_assets: [],
    asset_changes: [],
    admin_audit_logs: []
  };
}

function matches(document, filters) {
  return Object.entries(filters).every(([key, expected]) => {
    if (expected && expected.__regexp) return expected.__regexp.test(String(document[key] || ''));
    return document[key] === expected;
  });
}

function queryFor(source) {
  let offset = 0;
  let limit = 20;
  return {
    skip(value) { offset = value; return this; },
    limit(value) { limit = value; return this; },
    async get() { return { data: source.slice(offset, offset + limit) }; }
  };
}

function collection(name) {
  return {
    where(filters) { return queryFor(documents[name].filter((item) => matches(item, filters))); },
    skip(value) { return queryFor(documents[name]).skip(value); },
    doc(id) {
      return {
        async get() {
          const document = documents[name].find((item) => item._id === id);
          if (!document) {
            const error = new Error('document does not exist');
            error.errCode = 'DATABASE_DOCUMENT_NOT_EXIST';
            throw error;
          }
          return { data: document };
        }
      };
    }
  };
}

jest.mock('wx-server-sdk', () => ({
  DYNAMIC_CURRENT_ENV: 'test',
  init: jest.fn(),
  getWXContext: () => ({ OPENID: currentOpenid }),
  database: () => ({
    collection,
    RegExp: ({ regexp, options }) => ({
      __regexp: new RegExp(regexp, options)
    })
  })
}));

describe('admin read API', () => {
  beforeEach(() => {
    jest.resetModules();
    resetDatabase();
  });

  test.each(['check', 'listCollections', 'query', 'get'])('denies a non-admin %s request', async (action) => {
    currentOpenid = 'another-openid';
    const { main } = require('./index');
    await expect(main({ action, collection: 'projects', id: 'project-1' })).rejects.toThrow('ADMIN_DENIED');
  });

  test('returns the fixed mutable and read-only collection lists', async () => {
    const { main } = require('./index');
    await expect(main({ action: 'listCollections' })).resolves.toEqual({
      ok: true,
      collections: ['users', 'projects', 'categories', 'family_assets', 'asset_changes'],
      readOnlyCollections: ['admin_audit_logs']
    });
  });

  test('rejects a collection outside the allowlist', async () => {
    const { main } = require('./index');
    await expect(main({ action: 'query', collection: 'secrets' })).rejects.toThrow('COLLECTION_NOT_ALLOWED');
  });

  test('queries project names and caps pagination at 50', async () => {
    const { main } = require('./index');
    const result = await main({
      action: 'query', collection: 'projects', keyword: '华泰', limit: 500, offset: 0
    });
    expect(result.documents.map((item) => item._id)).toEqual(['project-1']);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  test('uses exact document lookup for non-project keywords', async () => {
    const { main } = require('./index');
    const result = await main({ action: 'query', collection: 'users', keyword: 'user-1' });
    expect(result.documents).toEqual([expect.objectContaining({ _id: 'user-1' })]);
  });

  test('returns DOCUMENT_NOT_FOUND for an absent ID', async () => {
    const { main } = require('./index');
    await expect(main({ action: 'get', collection: 'projects', id: 'missing' }))
      .rejects.toThrow('DOCUMENT_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run the read tests and verify they fail**

Run:

```bash
npx jest cloudfunctions/admin/index.test.js --runInBand
```

Expected: FAIL because `cloudfunctions/admin/index.js` does not exist.

- [ ] **Step 3: Implement the minimal authorized read API**

Create `cloudfunctions/admin/index.js` with these constants and helpers:

```js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const ADMIN_OPENID = '<configured only in cloudfunctions/admin/index.js>';
const CRUD_COLLECTIONS = Object.freeze([
  'users', 'projects', 'categories', 'family_assets', 'asset_changes'
]);
const READ_ONLY_COLLECTIONS = Object.freeze(['admin_audit_logs']);
const ALL_COLLECTIONS = new Set([...CRUD_COLLECTIONS, ...READ_ONLY_COLLECTIONS]);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function requireAdmin() {
  const openid = cloud.getWXContext().OPENID;
  if (openid !== ADMIN_OPENID) throw new Error('ADMIN_DENIED');
  return openid;
}

function requireCollection(name, { writable = false } = {}) {
  const allowed = writable ? CRUD_COLLECTIONS.includes(name) : ALL_COLLECTIONS.has(name);
  if (!allowed) throw new Error('COLLECTION_NOT_ALLOWED');
  return name;
}

function requireDocumentId(id) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('DOCUMENT_ID_REQUIRED');
  return id.trim();
}

function pagination(event) {
  const requestedLimit = Number(event.limit);
  const requestedOffset = Number(event.offset);
  return {
    limit: Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT,
    offset: Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getDocument(collectionName, id, database = db) {
  try {
    const result = await database.collection(collectionName).doc(requireDocumentId(id)).get();
    if (!result || !result.data) throw new Error('DOCUMENT_NOT_FOUND');
    return result.data;
  } catch (error) {
    if (error && (
      error.message === 'DOCUMENT_NOT_FOUND'
      || error.errCode === 'DATABASE_DOCUMENT_NOT_EXIST'
    )) throw new Error('DOCUMENT_NOT_FOUND');
    throw error;
  }
}

async function queryDocuments(event) {
  const collectionName = requireCollection(event.collection);
  const { limit, offset } = pagination(event);
  const keyword = typeof event.keyword === 'string' ? event.keyword.trim() : '';
  let query;

  if (keyword && collectionName === 'projects') {
    query = db.collection(collectionName).where({
      name: db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    });
  } else if (keyword) {
    try {
      return {
        documents: [await getDocument(collectionName, keyword)],
        limit,
        offset
      };
    } catch (error) {
      if (error.message === 'DOCUMENT_NOT_FOUND') return { documents: [], limit, offset };
      throw error;
    }
  } else {
    query = db.collection(collectionName);
  }

  const result = await query.skip(offset).limit(limit).get();
  return { documents: result.data || [], limit, offset };
}

exports.main = async (event = {}) => {
  requireAdmin();
  if (event.action === 'check') return { ok: true, isAdmin: true };
  if (event.action === 'listCollections') {
    return {
      ok: true,
      collections: [...CRUD_COLLECTIONS],
      readOnlyCollections: [...READ_ONLY_COLLECTIONS]
    };
  }
  if (event.action === 'query') return { ok: true, ...(await queryDocuments(event)) };
  if (event.action === 'get') {
    const collectionName = requireCollection(event.collection);
    return { ok: true, document: await getDocument(collectionName, event.id) };
  }
  throw new Error('UNKNOWN_ACTION');
};
```

Create `cloudfunctions/admin/package.json`:

```json
{
  "name": "admin",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

Add the following object to `cloudbaserc.json`'s `functions` array:

```json
{
  "name": "admin",
  "runtime": "Nodejs16.13",
  "handler": "index.main"
}
```

Generate the lockfile:

```bash
npm install --package-lock-only --ignore-scripts --prefix cloudfunctions/admin
```

- [ ] **Step 4: Run the read tests and verify they pass**

Run:

```bash
npx jest cloudfunctions/admin/index.test.js --runInBand
```

Expected: PASS for all authorization, allowlist, query, pagination, and lookup cases.

- [ ] **Step 5: Commit the authorized read API**

```bash
git add cloudfunctions/admin cloudbaserc.json
git commit -m "feat: add admin read API"
```

### Task 2: Transactional CRUD and Audit Log

**Files:**
- Modify: `cloudfunctions/admin/index.js`
- Modify: `cloudfunctions/admin/index.test.js`

**Interfaces:**
- Consumes: Task 1's `requireAdmin`, `requireCollection`, `requireDocumentId`, and `getDocument`.
- Produces: `create`, `update`, `set`, and `remove` actions.
- Audit schema: `{ operatorOpenid, action, collection, documentId, before, after, createdAt }`.

- [ ] **Step 1: Extend the mock and write failing CRUD/audit tests**

Add transaction-capable document methods to the test mock. The transaction must operate on a cloned database and only replace `documents` when the callback succeeds:

```js
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mutableCollection(store, name) {
  return {
    doc(id) {
      return {
        async get() {
          const document = store[name].find((item) => item._id === id);
          if (!document) {
            const error = new Error('document does not exist');
            error.errCode = 'DATABASE_DOCUMENT_NOT_EXIST';
            throw error;
          }
          return { data: clone(document) };
        },
        async update({ data }) {
          Object.assign(store[name].find((item) => item._id === id), clone(data));
        },
        async set({ data }) {
          const index = store[name].findIndex((item) => item._id === id);
          const replacement = { _id: id, ...clone(data) };
          if (index === -1) store[name].push(replacement);
          else store[name][index] = replacement;
        },
        async remove() {
          store[name] = store[name].filter((item) => item._id !== id);
        }
      };
    },
    async add({ data }) {
      const _id = `${name}-${store[name].length + 1}`;
      store[name].push({ _id, ...clone(data) });
      return { _id };
    }
  };
}

async function runTransaction(callback) {
  const draft = clone(documents);
  const result = await callback({ collection: (name) => mutableCollection(draft, name) });
  documents = draft;
  return { result };
}
```

Add these tests:

```js
describe('admin write API', () => {
  beforeEach(() => {
    jest.resetModules();
    resetDatabase();
  });

  test.each(['create', 'update', 'set', 'remove'])('denies a non-admin %s request', async (action) => {
    currentOpenid = 'another-openid';
    const { main } = require('./index');
    await expect(main({
      action, collection: 'projects', id: 'project-1', data: { name: 'changed' }
    })).rejects.toThrow('ADMIN_DENIED');
  });

  test('creates a document and its audit in the same transaction', async () => {
    const { main } = require('./index');
    const result = await main({
      action: 'create', collection: 'categories', data: { name: '券商理财', enabled: true }
    });
    expect(result.document).toEqual(expect.objectContaining({ name: '券商理财' }));
    expect(documents.admin_audit_logs).toContainEqual(expect.objectContaining({
      operatorOpenid: ADMIN_OPENID,
      action: 'create',
      collection: 'categories',
      documentId: result.document._id,
      before: null,
      after: result.document
    }));
  });

  test('partially updates a document and records before and after', async () => {
    const { main } = require('./index');
    const result = await main({
      action: 'update', collection: 'projects', id: 'project-1', data: { principal: 12000 }
    });
    expect(result.document).toEqual(expect.objectContaining({
      _id: 'project-1', name: '华泰稳健一号', principal: 12000
    }));
    expect(documents.admin_audit_logs[0]).toEqual(expect.objectContaining({
      action: 'update',
      before: expect.objectContaining({ principal: 10000 }),
      after: expect.objectContaining({ principal: 12000 })
    }));
  });

  test('rejects _id inside write data', async () => {
    const { main } = require('./index');
    await expect(main({
      action: 'update',
      collection: 'projects',
      id: 'project-1',
      data: { _id: 'replacement' }
    })).rejects.toThrow('DATA_INVALID');
  });

  test('overwrites a document and records the replaced snapshot', async () => {
    const { main } = require('./index');
    const result = await main({
      action: 'set', collection: 'projects', id: 'project-1', data: { name: '纠正后的项目' }
    });
    expect(result.document).toEqual({ _id: 'project-1', name: '纠正后的项目' });
    expect(documents.admin_audit_logs[0]).toEqual(expect.objectContaining({
      action: 'set',
      before: expect.objectContaining({ principal: 10000 }),
      after: { _id: 'project-1', name: '纠正后的项目' }
    }));
  });

  test('removes a document and records a null after value', async () => {
    const { main } = require('./index');
    await expect(main({
      action: 'remove', collection: 'projects', id: 'project-1'
    })).resolves.toEqual({ ok: true });
    expect(documents.projects.find((item) => item._id === 'project-1')).toBeUndefined();
    expect(documents.admin_audit_logs[0]).toEqual(expect.objectContaining({
      action: 'remove',
      documentId: 'project-1',
      before: expect.objectContaining({ name: '华泰稳健一号' }),
      after: null
    }));
  });

  test.each(['create', 'update', 'set', 'remove'])('keeps audit logs read-only for %s', async (action) => {
    const { main } = require('./index');
    await expect(main({
      action,
      collection: 'admin_audit_logs',
      id: 'audit-1',
      data: { changed: true }
    })).rejects.toThrow('COLLECTION_NOT_ALLOWED');
  });
});
```

Update the mocked database object to expose `serverDate: () => 'SERVER_DATE'` and `runTransaction`.

- [ ] **Step 2: Run the write tests and verify they fail**

Run:

```bash
npx jest cloudfunctions/admin/index.test.js --runInBand
```

Expected: FAIL with `UNKNOWN_ACTION` for the new write cases.

- [ ] **Step 3: Implement validation, transaction helpers, and audit creation**

Add these helpers to `cloudfunctions/admin/index.js`:

```js
function requireWriteData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('DATA_INVALID');
  if (Object.prototype.hasOwnProperty.call(data, '_id')) throw new Error('DATA_INVALID');
  return data;
}

function auditRecord(operatorOpenid, action, collectionName, documentId, before, after) {
  return {
    operatorOpenid,
    action,
    collection: collectionName,
    documentId,
    before,
    after,
    createdAt: db.serverDate()
  };
}

async function writeWithAudit(operatorOpenid, event) {
  const collectionName = requireCollection(event.collection, { writable: true });
  const data = event.action === 'remove' ? undefined : requireWriteData(event.data);

  const transactionResult = await db.runTransaction(async (transaction) => {
    const target = transaction.collection(collectionName);
    const audits = transaction.collection('admin_audit_logs');

    if (event.action === 'create') {
      const result = await target.add({ data });
      const document = { _id: result._id, ...data };
      await audits.add({
        data: auditRecord(operatorOpenid, 'create', collectionName, result._id, null, document)
      });
      return { document };
    }

    const id = requireDocumentId(event.id);
    const before = await getDocument(collectionName, id, transaction);

    if (event.action === 'update') {
      await target.doc(id).update({ data });
      const document = { ...before, ...data, _id: id };
      await audits.add({
        data: auditRecord(operatorOpenid, 'update', collectionName, id, before, document)
      });
      return { document };
    }

    if (event.action === 'set') {
      await target.doc(id).set({ data });
      const document = { _id: id, ...data };
      await audits.add({
        data: auditRecord(operatorOpenid, 'set', collectionName, id, before, document)
      });
      return { document };
    }

    await target.doc(id).remove();
    await audits.add({
      data: auditRecord(operatorOpenid, 'remove', collectionName, id, before, null)
    });
    return {};
  });

  return transactionResult && transactionResult.result
    ? transactionResult.result
    : transactionResult;
}
```

Update `exports.main` so it retains the admin OpenID and dispatches writes:

```js
exports.main = async (event = {}) => {
  const operatorOpenid = requireAdmin();
  if (event.action === 'check') return { ok: true, isAdmin: true };
  if (event.action === 'listCollections') {
    return {
      ok: true,
      collections: [...CRUD_COLLECTIONS],
      readOnlyCollections: [...READ_ONLY_COLLECTIONS]
    };
  }
  if (event.action === 'query') return { ok: true, ...(await queryDocuments(event)) };
  if (event.action === 'get') {
    const collectionName = requireCollection(event.collection);
    return { ok: true, document: await getDocument(collectionName, event.id) };
  }
  if (['create', 'update', 'set', 'remove'].includes(event.action)) {
    return { ok: true, ...(await writeWithAudit(operatorOpenid, event)) };
  }
  throw new Error('UNKNOWN_ACTION');
};
```

- [ ] **Step 4: Run all admin cloud-function tests**

Run:

```bash
npx jest cloudfunctions/admin/index.test.js --runInBand
```

Expected: PASS. Confirm the test count includes authorization for every read and write action, collection protection, limit capping, and all four audit shapes.

- [ ] **Step 5: Commit transactional CRUD**

```bash
git add cloudfunctions/admin/index.js cloudfunctions/admin/index.test.js
git commit -m "feat: add audited admin CRUD"
```

### Task 3: Mini-program Admin Cloud Client

**Files:**
- Modify: `miniprogram/services/cloud.js`
- Modify: `miniprogram/__tests__/cloud.test.js`

**Interfaces:**
- Consumes: existing `callCloud(name, data, options)`.
- Produces: `checkAdmin`, `listAdminCollections`, `queryAdminDocuments`, `getAdminDocument`, `createAdminDocument`, `updateAdminDocument`, `setAdminDocument`, and `removeAdminDocument`.

- [ ] **Step 1: Write failing service payload tests**

Add to `miniprogram/__tests__/cloud.test.js`:

```js
test('sends exact admin API payloads', async () => {
  global.wx.cloud.callFunction.mockImplementation(({ data }) => Promise.resolve({ result: { ok: true, data } }));
  const {
    checkAdmin,
    listAdminCollections,
    queryAdminDocuments,
    getAdminDocument,
    createAdminDocument,
    updateAdminDocument,
    setAdminDocument,
    removeAdminDocument
  } = require('../services/cloud');

  await checkAdmin();
  await listAdminCollections();
  await queryAdminDocuments('projects', { keyword: '华泰', limit: 20, offset: 0 });
  await getAdminDocument('projects', 'project-1');
  await createAdminDocument('projects', { name: 'new' });
  await updateAdminDocument('projects', 'project-1', { name: 'updated' });
  await setAdminDocument('projects', 'project-1', { name: 'replacement' });
  await removeAdminDocument('projects', 'project-1');

  expect(global.wx.cloud.callFunction.mock.calls.map(([request]) => request)).toEqual([
    { name: 'admin', data: { action: 'check' } },
    { name: 'admin', data: { action: 'listCollections' } },
    {
      name: 'admin',
      data: { action: 'query', collection: 'projects', keyword: '华泰', limit: 20, offset: 0 }
    },
    { name: 'admin', data: { action: 'get', collection: 'projects', id: 'project-1' } },
    { name: 'admin', data: { action: 'create', collection: 'projects', data: { name: 'new' } } },
    {
      name: 'admin',
      data: { action: 'update', collection: 'projects', id: 'project-1', data: { name: 'updated' } }
    },
    {
      name: 'admin',
      data: { action: 'set', collection: 'projects', id: 'project-1', data: { name: 'replacement' } }
    },
    { name: 'admin', data: { action: 'remove', collection: 'projects', id: 'project-1' } }
  ]);
});
```

- [ ] **Step 2: Run the cloud service tests and verify they fail**

Run:

```bash
npx jest miniprogram/__tests__/cloud.test.js --runInBand
```

Expected: FAIL because the admin helpers are not exported.

- [ ] **Step 3: Add the admin helper functions and exports**

Add to `miniprogram/services/cloud.js`:

```js
function checkAdmin() { return callCloud('admin', { action: 'check' }); }
function listAdminCollections() { return callCloud('admin', { action: 'listCollections' }); }
function queryAdminDocuments(collection, options = {}) {
  return callCloud('admin', { action: 'query', collection, ...options });
}
function getAdminDocument(collection, id) {
  return callCloud('admin', { action: 'get', collection, id });
}
function createAdminDocument(collection, data) {
  return callCloud('admin', { action: 'create', collection, data });
}
function updateAdminDocument(collection, id, data) {
  return callCloud('admin', { action: 'update', collection, id, data });
}
function setAdminDocument(collection, id, data) {
  return callCloud('admin', { action: 'set', collection, id, data });
}
function removeAdminDocument(collection, id) {
  return callCloud('admin', { action: 'remove', collection, id });
}
```

Append the eight names to `module.exports` without changing existing exports.

- [ ] **Step 4: Run the cloud service tests**

Run:

```bash
npx jest miniprogram/__tests__/cloud.test.js --runInBand
```

Expected: PASS, including the two existing logging behavior tests.

- [ ] **Step 5: Commit the client layer**

```bash
git add miniprogram/services/cloud.js miniprogram/__tests__/cloud.test.js
git commit -m "feat: add admin cloud client"
```

### Task 4: Hidden Admin Console Page

**Files:**
- Create: `miniprogram/pages/admin/admin.js`
- Create: `miniprogram/pages/admin/admin.json`
- Create: `miniprogram/pages/admin/admin.wxml`
- Create: `miniprogram/pages/admin/admin.wxss`
- Create: `miniprogram/__tests__/admin.test.js`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/home/home.js`
- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/__tests__/home.test.js`

**Interfaces:**
- Consumes: all Task 3 admin helpers and WeChat `wx.showToast`, `wx.showModal`.
- Produces: hidden route `/pages/admin/admin`.
- Hidden entry: long-pressing the “家庭理财” home-page title calls `wx.navigateTo({ url: '/pages/admin/admin' })`.
- Page state: `checking`, `authorized`, `loading`, `saving`, `collections`, `selectedCollection`, `documentId`, `keyword`, `documents`, `selectedId`, `editorText`, `editorMode`, and `errorMessage`.

- [ ] **Step 1: Write failing page behavior tests**

Create `miniprogram/__tests__/admin.test.js` with mocked service functions and a page harness. Bind every handler called by tests:

```js
const mockCheckAdmin = jest.fn();
const mockListAdminCollections = jest.fn();
const mockQueryAdminDocuments = jest.fn();
const mockGetAdminDocument = jest.fn();
const mockCreateAdminDocument = jest.fn();
const mockUpdateAdminDocument = jest.fn();
const mockSetAdminDocument = jest.fn();
const mockRemoveAdminDocument = jest.fn();

jest.mock('../services/cloud', () => ({
  checkAdmin: mockCheckAdmin,
  listAdminCollections: mockListAdminCollections,
  queryAdminDocuments: mockQueryAdminDocuments,
  getAdminDocument: mockGetAdminDocument,
  createAdminDocument: mockCreateAdminDocument,
  updateAdminDocument: mockUpdateAdminDocument,
  setAdminDocument: mockSetAdminDocument,
  removeAdminDocument: mockRemoveAdminDocument
}));

let definition;

function page() {
  const instance = {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) { this.data = { ...this.data, ...update }; }
  };
  [
    'onLoad', 'loadConsole', 'queryDocuments', 'onCollectionChange', 'onDocumentIdInput',
    'onKeywordInput', 'selectDocument', 'startCreate', 'onEditorInput', 'createDocument',
    'updateDocument', 'setDocument', 'removeDocument', 'parseEditor', 'refreshAfterWrite'
  ].forEach((name) => { instance[name] = definition[name].bind(instance); });
  return instance;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('admin console page', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckAdmin.mockResolvedValue({ ok: true, isAdmin: true });
    mockListAdminCollections.mockResolvedValue({
      collections: ['users', 'projects', 'categories', 'family_assets', 'asset_changes'],
      readOnlyCollections: ['admin_audit_logs']
    });
    mockQueryAdminDocuments.mockResolvedValue({
      documents: [{ _id: 'project-1', name: '华泰稳健一号' }]
    });
    mockGetAdminDocument.mockResolvedValue({
      document: { _id: 'project-1', name: '华泰稳健一号' }
    });
    mockCreateAdminDocument.mockResolvedValue({
      document: { _id: 'project-2', name: '新增项目' }
    });
    mockUpdateAdminDocument.mockResolvedValue({
      document: { _id: 'project-1', name: '更新项目' }
    });
    mockSetAdminDocument.mockResolvedValue({
      document: { _id: 'project-1', name: '覆盖项目' }
    });
    mockRemoveAdminDocument.mockResolvedValue({ ok: true });
    global.wx = {
      showToast: jest.fn(),
      showModal: jest.fn(({ success }) => success({ confirm: true }))
    };
    global.Page = (value) => { definition = value; };
    require('../pages/admin/admin');
  });

  afterEach(() => {
    delete global.wx;
    delete global.Page;
  });

  test('checks permission before loading collections and documents', async () => {
    const instance = page();
    instance.onLoad();
    await flushPromises();
    expect(mockCheckAdmin).toHaveBeenCalledTimes(1);
    expect(instance.data.authorized).toBe(true);
    expect(instance.data.selectedCollection).toBe('users');
    expect(mockQueryAdminDocuments).toHaveBeenCalledWith('users', {
      keyword: '', limit: 20, offset: 0
    });
  });

  test('shows no-permission state and never loads CRUD data for a denied caller', async () => {
    mockCheckAdmin.mockRejectedValue(new Error('ADMIN_DENIED'));
    const instance = page();
    instance.onLoad();
    await flushPromises();
    expect(instance.data.authorized).toBe(false);
    expect(instance.data.errorMessage).toBe('无管理员权限');
    expect(mockListAdminCollections).not.toHaveBeenCalled();
    expect(mockQueryAdminDocuments).not.toHaveBeenCalled();
  });

  test('uses exact get when a document ID is entered', async () => {
    const instance = page();
    instance.setData({ authorized: true, selectedCollection: 'projects', documentId: 'project-1' });
    await instance.queryDocuments();
    expect(mockGetAdminDocument).toHaveBeenCalledWith('projects', 'project-1');
    expect(instance.data.documents).toEqual([expect.objectContaining({ _id: 'project-1' })]);
  });

  test('blocks invalid or non-object JSON', async () => {
    const instance = page();
    instance.setData({ editorText: '{bad json', selectedCollection: 'projects' });
    await instance.createDocument();
    expect(mockCreateAdminDocument).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: 'JSON 格式不正确', icon: 'none' });

    instance.setData({ editorText: '[]' });
    await instance.createDocument();
    expect(global.wx.showToast).toHaveBeenCalledWith({ title: '数据必须是对象', icon: 'none' });
  });

  test('updates the selected document with parsed JSON', async () => {
    const instance = page();
    instance.setData({
      selectedCollection: 'projects',
      selectedId: 'project-1',
      editorText: '{"name":"更新项目"}'
    });
    await instance.updateDocument();
    expect(mockUpdateAdminDocument).toHaveBeenCalledWith(
      'projects', 'project-1', { name: '更新项目' }
    );
  });

  test('requires explicit overwrite confirmation', async () => {
    const instance = page();
    instance.setData({
      selectedCollection: 'projects',
      selectedId: 'project-1',
      editorText: '{"name":"覆盖项目"}'
    });
    instance.setDocument();
    await flushPromises();
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '覆盖文档',
      confirmText: '确认覆盖'
    }));
    expect(mockSetAdminDocument).toHaveBeenCalledWith(
      'projects', 'project-1', { name: '覆盖项目' }
    );
  });

  test('fetches the latest snapshot before delete confirmation', async () => {
    const instance = page();
    instance.setData({ selectedCollection: 'projects', selectedId: 'project-1' });
    instance.removeDocument();
    await flushPromises();
    expect(mockGetAdminDocument).toHaveBeenCalledWith('projects', 'project-1');
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '删除文档',
      confirmText: '确认删除',
      content: expect.stringContaining('华泰稳健一号')
    }));
    expect(mockRemoveAdminDocument).toHaveBeenCalledWith('projects', 'project-1');
  });
});
```

- [ ] **Step 2: Run the admin page tests and verify they fail**

Run:

```bash
npx jest miniprogram/__tests__/admin.test.js --runInBand
```

Expected: FAIL because `miniprogram/pages/admin/admin.js` does not exist.

- [ ] **Step 3: Add a failing home-page hidden-entry test**

Extend the existing home page test harness to bind `openAdmin`, then add:

```js
test('opens the hidden admin console from the home title gesture', () => {
  const instance = createPage();

  instance.openAdmin();

  expect(global.wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/admin/admin' });
});
```

Run:

```bash
npx jest miniprogram/__tests__/home.test.js --runInBand
```

Expected: FAIL because `openAdmin` is not defined.

- [ ] **Step 4: Implement page state, permission loading, querying, and JSON actions**

Create `miniprogram/pages/admin/admin.js`. Use the Task 3 helpers and these exact behavior helpers:

```js
const {
  checkAdmin,
  listAdminCollections,
  queryAdminDocuments,
  getAdminDocument,
  createAdminDocument,
  updateAdminDocument,
  setAdminDocument,
  removeAdminDocument
} = require('../../services/cloud');

const ERROR_MESSAGES = {
  ADMIN_DENIED: '无管理员权限',
  COLLECTION_NOT_ALLOWED: '集合不允许操作',
  DOCUMENT_ID_REQUIRED: '请输入文档 ID',
  DOCUMENT_NOT_FOUND: '文档不存在',
  JSON_INVALID: 'JSON 格式不正确',
  DATA_INVALID: '数据必须是对象',
  UNKNOWN_ACTION: '未知操作'
};

function errorCode(error) {
  const text = [
    error && error.message,
    error && error.errMsg,
    error && error.errCode
  ].filter(Boolean).join(' ');
  return Object.keys(ERROR_MESSAGES).find((code) => text.includes(code)) || '';
}

function errorMessage(error, fallback = '操作失败，请稍后重试') {
  return ERROR_MESSAGES[errorCode(error)] || fallback;
}

function formatted(document) {
  return JSON.stringify(document, null, 2);
}

function snapshotText(document) {
  const text = formatted(document);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

Page({
  data: {
    checking: true,
    authorized: false,
    loading: false,
    saving: false,
    collections: [],
    mutableCollections: [],
    selectedCollection: '',
    selectedCollectionWritable: false,
    documentId: '',
    keyword: '',
    documents: [],
    selectedId: '',
    editorText: '{}',
    editorMode: 'create',
    errorMessage: ''
  },

  onLoad() {
    return this.loadConsole();
  },

  loadConsole() {
    this.setData({ checking: true, errorMessage: '' });
    return checkAdmin()
      .then(() => listAdminCollections())
      .then(({ collections, readOnlyCollections }) => {
        const allCollections = [...collections, ...readOnlyCollections];
        this.setData({
          checking: false,
          authorized: true,
          collections: allCollections,
          mutableCollections: collections,
          selectedCollection: allCollections[0] || '',
          selectedCollectionWritable: collections.includes(allCollections[0])
        });
        return this.queryDocuments();
      })
      .catch((error) => {
        this.setData({
          checking: false,
          authorized: false,
          errorMessage: errorMessage(error)
        });
      });
  },

  queryDocuments() {
    if (!this.data.authorized || !this.data.selectedCollection) return Promise.resolve();
    this.setData({ loading: true, errorMessage: '' });
    const id = this.data.documentId.trim();
    const request = id
      ? getAdminDocument(this.data.selectedCollection, id)
        .then(({ document }) => ({ documents: [document] }))
      : queryAdminDocuments(this.data.selectedCollection, {
        keyword: this.data.keyword.trim(),
        limit: 20,
        offset: 0
      });
    return request
      .then(({ documents }) => {
        this.setData({ loading: false, documents: documents || [] });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          documents: [],
          errorMessage: errorMessage(error, '查询失败，请稍后重试')
        });
      });
  },

  onCollectionChange(event) {
    const selectedCollection = this.data.collections[Number(event.detail.value)];
    this.setData({
      selectedCollection,
      selectedCollectionWritable: this.data.mutableCollections.includes(selectedCollection),
      documentId: '',
      keyword: '',
      documents: [],
      selectedId: '',
      editorText: '{}',
      editorMode: 'create',
      errorMessage: ''
    });
    return this.queryDocuments();
  },

  onDocumentIdInput(event) { this.setData({ documentId: event.detail.value }); },
  onKeywordInput(event) { this.setData({ keyword: event.detail.value }); },
  onEditorInput(event) { this.setData({ editorText: event.detail.value }); },

  selectDocument(event) {
    const selectedId = event.currentTarget.dataset.id;
    const document = this.data.documents.find((item) => item._id === selectedId);
    if (!document) return;
    const { _id, ...editable } = document;
    this.setData({
      selectedId: _id,
      editorText: formatted(editable),
      editorMode: 'edit',
      errorMessage: ''
    });
  },

  startCreate() {
    this.setData({ selectedId: '', editorText: '{}', editorMode: 'create' });
  },

  parseEditor() {
    let data;
    try {
      data = JSON.parse(this.data.editorText);
    } catch (_error) {
      wx.showToast({ title: 'JSON 格式不正确', icon: 'none' });
      return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      wx.showToast({ title: '数据必须是对象', icon: 'none' });
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(data, '_id')) {
      wx.showToast({ title: 'JSON 中不能包含 _id', icon: 'none' });
      return null;
    }
    return data;
  },

  refreshAfterWrite(document) {
    this.setData({
      saving: false,
      selectedId: document ? document._id : '',
      editorMode: document ? 'edit' : 'create',
      editorText: document
        ? formatted(Object.fromEntries(Object.entries(document).filter(([key]) => key !== '_id')))
        : '{}'
    });
    wx.showToast({ title: '操作成功', icon: 'success' });
    return this.queryDocuments();
  },

  createDocument() {
    const data = this.parseEditor();
    if (!data) return Promise.resolve();
    this.setData({ saving: true });
    return createAdminDocument(this.data.selectedCollection, data)
      .then(({ document }) => this.refreshAfterWrite(document))
      .catch((error) => {
        this.setData({ saving: false });
        wx.showToast({ title: errorMessage(error), icon: 'none' });
      });
  },

  updateDocument() {
    if (!this.data.selectedId) {
      wx.showToast({ title: '请先选择文档', icon: 'none' });
      return Promise.resolve();
    }
    const data = this.parseEditor();
    if (!data) return Promise.resolve();
    this.setData({ saving: true });
    return updateAdminDocument(
      this.data.selectedCollection,
      this.data.selectedId,
      data
    )
      .then(({ document }) => this.refreshAfterWrite(document))
      .catch((error) => {
        this.setData({ saving: false });
        wx.showToast({ title: errorMessage(error), icon: 'none' });
      });
  },

  setDocument() {
    if (!this.data.selectedId) {
      wx.showToast({ title: '请先选择文档', icon: 'none' });
      return;
    }
    const data = this.parseEditor();
    if (!data) return;
    wx.showModal({
      title: '覆盖文档',
      content: `将完整覆盖 ${this.data.selectedId}，未写入的字段会被删除。`,
      confirmText: '确认覆盖',
      confirmColor: '#FF9500',
      success: ({ confirm }) => {
        if (!confirm) return;
        this.setData({ saving: true });
        setAdminDocument(this.data.selectedCollection, this.data.selectedId, data)
          .then(({ document }) => this.refreshAfterWrite(document))
          .catch((error) => {
            this.setData({ saving: false });
            wx.showToast({ title: errorMessage(error), icon: 'none' });
          });
      }
    });
  },

  removeDocument() {
    if (!this.data.selectedId) {
      wx.showToast({ title: '请先选择文档', icon: 'none' });
      return;
    }
    const { selectedCollection, selectedId } = this.data;
    return getAdminDocument(selectedCollection, selectedId)
      .then(({ document }) => {
        wx.showModal({
          title: '删除文档',
          content: `删除后无法恢复：\n${snapshotText(document)}`,
          confirmText: '确认删除',
          confirmColor: '#FF3B30',
          success: ({ confirm }) => {
            if (!confirm) return;
            this.setData({ saving: true });
            removeAdminDocument(selectedCollection, selectedId)
              .then(() => this.refreshAfterWrite(null))
              .catch((error) => {
                this.setData({ saving: false });
                wx.showToast({ title: errorMessage(error), icon: 'none' });
              });
          }
        });
      })
      .catch((error) => {
        wx.showToast({ title: errorMessage(error), icon: 'none' });
      });
  }
});
```

- [ ] **Step 5: Add the hidden route, long-press entry, and WeUI console markup**

Create `miniprogram/pages/admin/admin.json`:

```json
{
  "navigationBarTitleText": "数据管理"
}
```

Create `miniprogram/pages/admin/admin.wxml` with these states and controls:

```xml
<view class="page admin-page">
  <view wx:if="{{checking}}" class="weui-panel state-panel">正在验证管理员权限</view>
  <view wx:elif="{{!authorized}}" class="weui-msg denied">
    <view class="weui-msg__text-area">
      <view class="weui-msg__title">无管理员权限</view>
      <view class="weui-msg__desc">{{errorMessage}}</view>
    </view>
  </view>
  <block wx:else>
    <view class="weui-panel query-panel">
      <view class="weui-panel__hd">数据集合</view>
      <view class="weui-cells weui-cells_form">
        <picker mode="selector" range="{{collections}}" bindchange="onCollectionChange">
          <view class="weui-cell weui-cell_access">
            <view class="weui-cell__bd">{{selectedCollection}}</view>
            <view class="weui-cell__ft">切换</view>
          </view>
        </picker>
        <view class="weui-cell">
          <view class="weui-cell__hd"><label class="weui-label">文档 ID</label></view>
          <view class="weui-cell__bd">
            <input class="weui-input" value="{{documentId}}" placeholder="精确查询，可留空" bindinput="onDocumentIdInput" />
          </view>
        </view>
        <view class="weui-cell">
          <view class="weui-cell__hd"><label class="weui-label">关键词</label></view>
          <view class="weui-cell__bd">
            <input class="weui-input" value="{{keyword}}" placeholder="projects 按名称查询" bindinput="onKeywordInput" />
          </view>
        </view>
      </view>
      <button class="weui-btn weui-btn_primary query-button" loading="{{loading}}" bindtap="queryDocuments">查询</button>
    </view>

    <view wx:if="{{errorMessage}}" class="weui-panel error-panel">{{errorMessage}}</view>

    <view class="weui-panel results-panel">
      <view class="weui-panel__hd">查询结果（{{documents.length}}）</view>
      <view class="weui-cells">
        <view wx:if="{{documents.length === 0}}" class="weui-cell empty">暂无数据</view>
        <view wx:for="{{documents}}" wx:key="_id" class="weui-cell weui-cell_access result-row"
          data-id="{{item._id}}" bindtap="selectDocument">
          <view class="weui-cell__bd">
            <view class="result-id">{{item._id}}</view>
            <view class="result-preview">{{item.name || item.openid || item.action || 'JSON 文档'}}</view>
          </view>
          <view class="weui-cell__ft">编辑</view>
        </view>
      </view>
    </view>

    <view class="weui-form editor-panel">
      <view class="weui-form__text-area">
        <view class="weui-form__title">JSON 编辑器</view>
        <view class="weui-form__desc">{{selectedId || '新建文档'}}</view>
      </view>
      <view class="weui-cells weui-cells_form">
        <view class="weui-cell">
          <view class="weui-cell__bd">
            <textarea class="json-editor" value="{{editorText}}" bindinput="onEditorInput" disabled="{{saving}}" />
          </view>
        </view>
      </view>
      <view class="editor-actions">
        <button class="weui-btn weui-btn_default" bindtap="startCreate" disabled="{{saving}}">新建</button>
        <button wx:if="{{editorMode === 'create' && selectedCollectionWritable}}"
          class="weui-btn weui-btn_primary" bindtap="createDocument" loading="{{saving}}">创建</button>
        <button wx:if="{{editorMode === 'edit' && selectedCollectionWritable}}"
          class="weui-btn weui-btn_primary" bindtap="updateDocument" loading="{{saving}}">局部更新</button>
        <button wx:if="{{editorMode === 'edit' && selectedCollectionWritable}}"
          class="weui-btn weui-btn_warn" bindtap="setDocument" disabled="{{saving}}">完整覆盖</button>
        <button wx:if="{{editorMode === 'edit' && selectedCollectionWritable}}"
          class="weui-btn weui-btn_warn" bindtap="removeDocument" disabled="{{saving}}">删除</button>
      </view>
    </view>
  </block>
</view>
```

Create `miniprogram/pages/admin/admin.wxss`:

```css
.admin-page { padding-left: var(--space-page-x); padding-right: var(--space-page-x); }
.query-panel, .results-panel, .editor-panel, .error-panel { margin-bottom: var(--space-section); }
.query-button { margin: 24rpx var(--space-page-x); }
.state-panel, .error-panel, .empty { padding: 32rpx; text-align: center; }
.error-panel { color: var(--color-danger); }
.denied { min-height: 70vh; padding-top: 24vh; }
.result-row { align-items: flex-start; }
.result-id { word-break: break-all; font-size: var(--font-body); }
.result-preview { margin-top: 8rpx; color: var(--color-secondary-text); font-size: var(--font-caption); }
.json-editor {
  width: 100%;
  min-height: 520rpx;
  box-sizing: border-box;
  font-family: Menlo, Consolas, monospace;
  font-size: 24rpx;
  line-height: 1.5;
}
.editor-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16rpx; padding: 24rpx; }
.editor-actions .weui-btn { width: 100%; margin: 0; }
```

Register `"pages/admin/admin"` as the last item in `miniprogram/app.json`'s `pages` array. Do not add any `tabBar.list` entry.

Add this method to `miniprogram/pages/home/home.js`:

```js
openAdmin() {
  wx.navigateTo({ url: '/pages/admin/admin' });
},
```

Bind the existing “家庭理财” title in `miniprogram/pages/home/home.wxml`:

```xml
<view class="title" bindlongpress="openAdmin">家庭理财</view>
```

- [ ] **Step 6: Run page tests and inspect route/markup requirements**

Run:

```bash
npx jest miniprogram/__tests__/admin.test.js miniprogram/__tests__/home.test.js miniprogram/__tests__/ui-style.test.js --runInBand
```

Expected: PASS. Also verify:

```bash
node -e "const app=require('./miniprogram/app.json'); if(!app.pages.includes('pages/admin/admin')) process.exit(1); if(app.tabBar.list.some(item=>item.pagePath==='pages/admin/admin')) process.exit(1)"
```

Expected: exit code 0 with no output.

- [ ] **Step 7: Compile the page in WeChat DevTools**

Open the existing mini-program project and compile with startup page:

```text
pages/admin/admin
```

Expected:

- The administrator account sees the collection picker, results, and JSON editor.
- Another account sees only “无管理员权限”.
- There are no WXML expression errors.
- `admin_audit_logs` shows query results but no write buttons.
- Long-pressing “家庭理财” on the home page opens `/pages/admin/admin`.

- [ ] **Step 8: Commit the hidden admin page**

```bash
git add miniprogram/pages/admin miniprogram/__tests__/admin.test.js miniprogram/pages/home/home.js miniprogram/pages/home/home.wxml miniprogram/__tests__/home.test.js miniprogram/app.json
git commit -m "feat: add hidden admin console"
```

### Task 5: Deployment Detection and Final Verification

**Files:**
- Modify: `scripts/__tests__/detect-changed-functions.test.js`

**Interfaces:**
- Consumes: registered `admin` entry in `cloudbaserc.json`.
- Produces: workflow detection result containing `admin` when any file below `cloudfunctions/admin/` changes.

- [ ] **Step 1: Add the deployment-detection assertion**

Extend the registered-functions test input with:

```js
'A\tcloudfunctions/admin/index.js'
```

Change its expected result to:

```js
{
  changed: ['admin', 'bootstrap', 'login'],
  deleted: []
}
```

- [ ] **Step 2: Run the deployment detector test**

Run:

```bash
npx jest scripts/__tests__/detect-changed-functions.test.js --runInBand
```

Expected: PASS and `admin` is recognized as registered.

- [ ] **Step 3: Run the complete repository test suite**

Run:

```bash
npm test -- --runInBand
```

Expected: all suites pass with zero failed tests.

- [ ] **Step 4: Review the security boundary with static checks**

Run:

```bash
rg -n "wx\\.cloud\\.database|cloud\\.database" miniprogram/pages/admin miniprogram/services/cloud.js
```

Expected: no matches.

Run:

```bash
rg -n "ADMIN_OPENID" miniprogram
```

Expected: no matches.

Run:

```bash
node -e "const config=require('./cloudbaserc.json'); if(!config.functions.some(item=>item.name==='admin')) process.exit(1)"
```

Expected: exit code 0 with no output.

- [ ] **Step 5: Commit deployment verification**

```bash
git add scripts/__tests__/detect-changed-functions.test.js
git commit -m "test: verify admin function deployment"
```

- [ ] **Step 6: Push through the existing default-branch workflow**

After code review, push or merge the completed commits into `feature/family-finance-projects`.

Expected GitHub Actions result:

- Tests pass.
- Changed cloud functions include `admin`.
- CloudBase deploys `admin` to `cloudbase-d7gx0ikiwa58549a4`.
- The development package uploads successfully.
- The workflow generates the `wechat-preview-qrcode` artifact.

- [ ] **Step 7: Smoke test with the generated preview QR**

Scan the QR with the administrator WeChat account and open:

```text
/pages/admin/admin
```

Perform a reversible smoke test:

1. Query `projects` with keyword `华泰`.
2. Open one document without changing it.
3. Create a temporary `categories` document named `Admin smoke test`.
4. Confirm a matching `create` record appears in `admin_audit_logs`.
5. Delete the temporary category through the console.
6. Confirm a matching `remove` record appears in `admin_audit_logs`.

Expected: both writes succeed, the temporary category is absent afterward, and both immutable audit records remain.
