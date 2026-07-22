# Task 8 Report: Polish Validation, Category Empty State, And Manual QA

## What I implemented

- Added a category-picker empty state that directs users to deploy and run the `bootstrap` cloud function.
- Added client-side project validation for missing name/category/dates, non-positive principal, and an end date before the start date.
- Preserved the existing create/update request handling and expected-interest calculation after validation succeeds.
- Added Apple-token-based empty-state styling using the shared radius, grouped background, and tertiary text tokens.
- Added the first-version manual acceptance checklist.
- Added Jest coverage for invalid principal/date validation and the category empty-state markup.

## What I tested and test results

- `npx jest miniprogram/__tests__/project-form.test.js --runInBand`: passed, 3 tests.
- `npm test -- --runInBand`: passed, 9 suites and 52 tests.
- `node --check miniprogram/pages/project-form/project-form.js && node --check miniprogram/pages/projects/projects.js && node --check miniprogram/pages/home/home.js && git diff --check`: passed with no output.
- WeChat Developer Tools manual QA: not run. No callable Developer Tools CLI was available in this environment, and the configured cloud environment was not accessible from this session. The checklist remains unchecked for an operator with the cloud environment.

## Files changed

- `miniprogram/pages/project-form/project-form.js`
- `miniprogram/pages/project-form/project-form.wxml`
- `miniprogram/pages/project-form/project-form.wxss`
- `miniprogram/__tests__/project-form.test.js`
- `docs/qa/first-version-checklist.md`
- `.superpowers/sdd/task-8-report.md`

## Self-review findings

- No functional issues found in the scoped diff.
- Existing update behavior remains intact while validation now prevents invalid create and update requests.
- `projects.js` and `home.js` required no Task 8 changes; their existing Task 7 behavior remains covered by the full Jest suite.

## Concerns

- The WeChat Developer Tools and cloud-environment checklist requires manual execution outside this session.

## Task 8 Review Fix: Strict Date Validation

### Fix

- Enforced strict `YYYY-MM-DD` input format and real calendar validity for project start and end dates.
- Added regression coverage proving malformed non-empty dates do not call either cloud create or update.
- Preserved missing-date and end-before-start validation behavior.

### Verification

- `npx jest miniprogram/__tests__/project-form.test.js --runInBand`: passed, 5 tests.
- `npm test -- --runInBand`: passed, 9 suites and 54 tests.
- `node --check miniprogram/pages/project-form/project-form.js`: passed with no output.
- `git diff --check`: passed with no output.
