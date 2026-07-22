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
