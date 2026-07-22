# Task 1 Report: Mini Program And Cloud Development Scaffold

## What I Implemented

- Updated `project.config.json` with the Task 1 WeChat Mini Program and cloud-function roots while preserving AppID `wxcabf6afa48b9277d`.
- Added the mini program bootstrap with cloud availability handling and `wx.cloud.init({ traceUser: true })`.
- Added global routing, tab bar, UI-token import, sitemap, and the minimal home page.
- Added the `bootstrap` cloud function, which idempotently creates the nine built-in categories and default settings, then returns the required result shape.

## What I Tested

- Static scaffold validation: passed. All 11 required Task 1 files exist; all five JSON files parse; the preserved AppID, project roots, required routes, cloud initialization, and bootstrap output fields were verified.
- JavaScript syntax validation: passed for `miniprogram/app.js`, `miniprogram/pages/home/home.js`, and `cloudfunctions/bootstrap/index.js` using `node --check`.
- Whitespace validation: passed with `git diff --check`.
- WeChat Developer Tools/cloud deployment verification: not run. It requires a local WeChat Developer Tools session and a cloud environment selected and deployed by an authenticated user.

## Files Changed

- `project.config.json`
- `miniprogram/app.js`
- `miniprogram/app.json`
- `miniprogram/app.wxss`
- `sitemap.json`
- `miniprogram/pages/home/home.js`
- `miniprogram/pages/home/home.json`
- `miniprogram/pages/home/home.wxml`
- `miniprogram/pages/home/home.wxss`
- `cloudfunctions/bootstrap/index.js`
- `cloudfunctions/bootstrap/package.json`

## Self-Review Findings

- The implementation matches every file and exact content block specified by Task 1, including the real AppID and required bootstrap category `羊毛`.
- `app.json` deliberately references `projects`, `project-form`, `stats`, and `auth-denied` pages that Task 1 does not create. Later plan tasks own those pages, so no placeholders were added outside this task's stated file list. WeChat Developer Tools may report those routes as missing until their owning tasks are completed.

## Concerns

- The required WeChat Developer Tools and Cloud Development deployment check cannot be performed from this shell-only environment. The cloud function has not been deployed or executed, so the `categories` and `settings` collections remain unverified.

## Review Fix: Bootstrap Authorization And Deterministic Initialization

### What I Fixed

- Added local `requireBootstrapAllowed(openid)` in `cloudfunctions/bootstrap/index.js`. It allows callers listed in the comma-separated `BOOTSTRAP_OPENIDS` environment variable or callers with a matching enabled document in `users` (`{ openid, enabled: true }`); all other callers receive `BOOTSTRAP_FORBIDDEN` before `categories` or `settings` are accessed.
- Replaced category check-then-insert logic with deterministic `categories.doc(id).set(...)` writes for all nine built-in category IDs: `builtin-bank-finance`, `builtin-fixed-deposit`, `builtin-fund`, `builtin-bond`, `builtin-brokerage`, `builtin-money-fund`, `builtin-yangmao`, `builtin-promo-reward`, and `builtin-other`.
- Replaced settings check-then-insert logic with deterministic `settings.doc('default').set(...)`. Bootstrap intentionally overwrites the default settings document, which is permitted for this task.
- Kept the return shape unchanged; `categoriesInserted` now reports the nine built-in category upserts.

### Verification

- `node --check cloudfunctions/bootstrap/index.js`: exit 0.
- Static bootstrap contract check: exit 0; output: `bootstrap static contract: PASS (authorization, deterministic IDs, doc.set upserts)`.
- `git diff --check`: exit 0.

### Files Changed

- `cloudfunctions/bootstrap/index.js`
- `.superpowers/sdd/task-1-report.md`

## Re-Review Fix: Bounded Bootstrap And Non-Destructive Initialization

### What I Fixed

- Made `BOOTSTRAP_OPENIDS` mandatory before any database access. It must specify exactly two distinct, non-empty comma-separated OpenIDs; invalid or absent configuration throws `BOOTSTRAP_OPENIDS_REQUIRED`.
- Removed the enabled `users` collection fallback. Only either of the two configured OpenIDs may invoke bootstrap; other callers receive `BOOTSTRAP_FORBIDDEN`.
- Changed category initialization to read each deterministic category document first. Existing documents update only mutable fields and retain `createdAt`; missing documents are created and increment `categoriesInserted`.
- Changed `settings/default` initialization to read first and create defaults only when missing. Existing settings remain unchanged.

### Verification

- `node --check cloudfunctions/bootstrap/index.js`: exit 0.
- Static bootstrap contract check: exit 0; confirmed there is no `users` whitelist fallback, `BOOTSTRAP_OPENIDS` has an exact-count and non-empty validation, category and settings documents are read before write operations, and `categoriesInserted += 1` is limited to the missing-category branch.
- `git diff --check`: exit 0.

### Files Changed

- `cloudfunctions/bootstrap/index.js`
- `.superpowers/sdd/task-1-report.md`

## Third Review Fix: Logical Identity And Atomic Initialization

### What I Fixed

- Kept strict bootstrap authorization unchanged: `BOOTSTRAP_OPENIDS` is required, contains exactly two distinct OpenIDs, and only those callers are allowed; there is no `users` fallback.
- Moved category and settings initialization into `db.runTransaction(...)` so concurrent authorized invocations cannot independently report the same deterministic category creation.
- Categories are now looked up first by logical identity `{ name, type: 'builtin' }`. A matching legacy-ID category is updated in place with mutable built-in fields, preserves `createdAt`, does not create a deterministic-ID duplicate, and does not increment `categoriesInserted`.
- Deterministic category IDs are used only when no logical match exists, after which `categoriesInserted` is incremented.
- Settings now checks for any existing settings document inside the transaction. An existing singleton document with a non-`default` ID remains unchanged; `settings/default` is created only when the collection is empty.

### Verification

- `node cloudfunctions/bootstrap/index.test.js`: exit 0; verified a legacy-ID built-in category is updated without a duplicate or insert count, and legacy settings are preserved without creating `default`.
- `node --check cloudfunctions/bootstrap/index.js`: exit 0.
- Static bootstrap contract check: exit 0; verified the exact two-OpenID authorization, no `users` fallback, logical category query, transactional creation-only insert count, deterministic ID placement, and settings singleton check.
- `git diff --check`: exit 0.

### Files Changed

- `cloudfunctions/bootstrap/index.js`
- `cloudfunctions/bootstrap/index.test.js`
- `.superpowers/sdd/task-1-report.md`
