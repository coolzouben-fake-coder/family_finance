# Final Whole-Branch Review Fix Report

## Summary

Implemented all critical, important, and practical minor findings from the final whole-branch review. Automated verification passes. Cloud console deployment and WeChat Developer Tools acceptance remain operational follow-up items because this workspace is not connected to the target WeChat cloud environment.

## Fixes By Finding

1. **Database whitelist boundary**
   - Added `database.rules.json` with conservative per-collection `read: false` and `write: false` rules. These deny direct Mini Program client reads and writes while allowing cloud functions and console administration.
   - Expanded `docs/qa/first-version-checklist.md` with the exact collection list, per-collection deployment steps, post-save verification, direct-client denial checks, cloud-function smoke checks, and the official CloudBase rule reference.
   - Added a static regression test that parses the rule artifact and verifies the deployment checklist covers every collection.

2. **Family asset editing and atomic audit writes**
   - Added a dashboard editor for family total assets with amount and required reason inputs, save/cancel states, and concise failure feedback.
   - Changed the `assets` cloud function to update `family_assets/current` and append `asset_changes` within one database transaction.
   - Added transaction invocation and rollback coverage for audit-write failures.

3. **Redeemed project corrections**
   - Added the `correctRedemption` cloud action and service wrapper for redeem date, actual interest, and actual fixed reward.
   - Kept redeemed base project fields locked while exposing an editable correction section with a historical-statistics warning.
   - Corrections update the raw project fields used by annual statistics, so affected years are recalculated on the next query.

4. **Second family member registrant workflow**
   - Added an enabled-user listing action and registrant picker to the project form.
   - New projects default to the caller; create and active-project update accept either configured family member only after validating exactly two distinct enabled OpenIDs.
   - Added tests for caller defaulting, selecting the second user, rejecting unlisted OpenIDs, and rendering the selected registrant.

5. **Project-list management**
   - Added status, category, registrant, and start-year filters.
   - Derived display status with the shared date utility, included actual total return, and sorted by action priority followed by end date.
   - Added confirmed cancel and delete actions plus service wrappers.
   - Added loading, empty, and page-level error states and tests for filtering, sorting, display values, actions, and failures.

6. **Annual statistics**
   - Added backend category aggregation and per-registrant weighted annualized return using each bucket's total return and weighted principal-days.
   - Added a year picker, category labels, registrant labels/rates, and loading/error states to the statistics page.
   - Added backend and page tests for these aggregations and year changes.

7. **Due-soon boundary**
   - Changed the due-soon comparison to include exactly `dueSoonDays` and added the exact three-day boundary test.

8. **Net-loss fixed reward share**
   - Changed the denominator guard to divide whenever annual actual total return is nonzero, including net-loss years.
   - Added a negative-return regression test.

9. **Page-level cloud errors**
   - Added concise visible failure states to home, projects, and statistics pages.
   - Added automated failure-state coverage for all three pages.

## Tests And Checks

- Focused red/green Jest runs were executed for database rules/date status, assets/home, projects/project form, project list, and annual statistics.
- `npm test -- --runInBand`: **PASS**, 12 suites, 74 tests, 0 snapshots.
- `node --check` for every changed JavaScript cloud function, page, service, utility, and test file: **PASS**.
- Parsed `database.rules.json` and asserted `read === false` and `write === false`: **PASS**.
- `git diff --check`: **PASS**.

## Files Changed

- Security and QA: `database.rules.json`, `docs/qa/first-version-checklist.md`, `cloudfunctions/__tests__/database-rules.test.js`
- Assets: `cloudfunctions/assets/index.js`, `cloudfunctions/assets/index.test.js`, `miniprogram/pages/home/home.js`, `home.wxml`, `home.wxss`, `miniprogram/__tests__/home.test.js`
- Projects backend/service: `cloudfunctions/projects/index.js`, `cloudfunctions/projects/index.test.js`, `miniprogram/services/cloud.js`
- Project form: `miniprogram/pages/project-form/project-form.js`, `project-form.wxml`, `project-form.wxss`, `miniprogram/__tests__/project-form.test.js`
- Project list/card: `miniprogram/pages/projects/projects.js`, `projects.wxml`, `projects.wxss`, `miniprogram/components/project-card/project-card.js`, `project-card.wxml`, `project-card.wxss`, `miniprogram/__tests__/projects.test.js`
- Statistics: `cloudfunctions/stats/index.js`, `cloudfunctions/stats/index.test.js`, `miniprogram/pages/stats/stats.js`, `stats.wxml`, `stats.wxss`, `miniprogram/__tests__/stats.test.js`
- Date boundary: `miniprogram/utils/date.js`, `miniprogram/__tests__/date.test.js`
- Report: `.superpowers/sdd/final-fix-report.md`

## Residual Concerns

- `database.rules.json` is a per-collection rule artifact and must be applied to all six collections in the WeChat Cloud console. Repository tests cannot confirm the target environment's active rules.
- Cloud functions and the updated UI still require the manual WeChat Developer Tools checks in `docs/qa/first-version-checklist.md`, including real Cloud Database transaction behavior and direct-client permission denial.
