# Task 5 Report: Project CRUD, Redeem Flow, And Project List

## What I Implemented

- Added the `projects` cloud function with `list`, `listCategories`, `create`, `update`, `redeem`, `cancel`, and `remove` actions.
- Enforced server-side enabled-user whitelist authorization on every action. Project registrant identity is derived from Cloud Development `OPENID`; supplied client identity is ignored.
- Added conservative server validation for project fields, real calendar dates, enabled categories, monetary values, annual rates, project state transitions, and redemption dates. Expected interest is recalculated on the server.
- Added cloud service wrappers for listing categories/projects and creating, updating, and redeeming projects.
- Replaced the project list and form placeholders. The list formats expected and actual returns, and the form supports create, active-project editing, and redemption. Completed/cancelled records are read-only.
- Added the reusable project card component and used Apple-inspired design tokens throughout the new styles.

## Tests And Results

- `node --check` for all Task 5 JavaScript files: passed.
- `npm test -- --runInBand`: passed, 6 suites and 42 tests.
- `git diff --check`: passed.
- Added cloud-function coverage for authorized creation, client identity spoofing, unauthorized calls, updates, redemptions, enabled categories, safe list filters, cancellation, and removal.

## Files Changed

- `cloudfunctions/projects/index.js`
- `cloudfunctions/projects/index.test.js`
- `cloudfunctions/projects/package.json`
- `miniprogram/components/project-card/project-card.js`
- `miniprogram/components/project-card/project-card.json`
- `miniprogram/components/project-card/project-card.wxml`
- `miniprogram/components/project-card/project-card.wxss`
- `miniprogram/pages/projects/projects.js`
- `miniprogram/pages/projects/projects.json`
- `miniprogram/pages/projects/projects.wxml`
- `miniprogram/pages/projects/projects.wxss`
- `miniprogram/pages/project-form/project-form.js`
- `miniprogram/pages/project-form/project-form.json`
- `miniprogram/pages/project-form/project-form.wxml`
- `miniprogram/pages/project-form/project-form.wxss`
- `miniprogram/services/cloud.js`
- `.superpowers/sdd/task-5-report.md`

## Self-Review Findings

- Found that cancelled records would have shown the redeemed lock message. Split the page state into a generic lock flag and status-specific lock message; corrected before final verification.
- Confirmed Task 5 does not modify the pre-existing untracked `miniprogram/pages/stats` placeholders.
- Confirmed no legacy green palette values were introduced; new styles use the existing design tokens.

## Concerns

- This environment cannot deploy a WeChat Cloud Development function or run WeChat DevTools/device integration. The required manual check remains: deploy `projects`, run `bootstrap` to seed a category, create a 28-day project with principal `10000`, annual rate `0.03`, and fixed reward `200`, then confirm stored expected interest is approximately `23.01` and the project appears in the list.

## Review Fixes

- Added `registrantOpenid` as a validated list filter while retaining server-side enabled-user authorization, the two-enabled-user guard, and OPENID-derived registrant identity on create.
- Paginated ordered project listing in 20-record batches so all matching family-pool records are returned.
- Added signed validation for actual redemption interest and fixed reward, allowing realized losses while expected and principal values remain non-negative.
- Added regression coverage for registrant filtering, multi-page project lists, and negative actual redemption components.

### Verification

- `npm test -- cloudfunctions/projects/index.test.js --runInBand`: passed, 1 suite and 8 tests.
- `npm test -- --runInBand`: passed, 6 suites and 44 tests.
- `node --check cloudfunctions/projects/index.js`: passed.
- `git diff --check`: passed.

### Files Changed

- `cloudfunctions/projects/index.js`
- `cloudfunctions/projects/index.test.js`
- `.superpowers/sdd/task-5-report.md`
