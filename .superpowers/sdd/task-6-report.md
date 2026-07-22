# Task 6 Report: Dashboard Active Capital And Due Reminders

## What I Implemented

- Updated the home dashboard to load `getAssets()` and `listProjects()` together after session validation.
- Passed the returned project list to `summarizeCapital` so active principal contributes to invested capital, idle funds, and utilization.
- Decorated projects with formatted principal amounts and `getDateStatus(project, today, 3)`, then exposed `dueSoonProjects` and `overdueProjects` in page state.
- Added overdue-confirmation and due-soon reminder sections to the home page.
- Styled the new sections with existing Apple-inspired design tokens.
- Added a focused home-page test covering ¥30,000 active capital from ¥50,000 assets, 60.0% utilization, and reminder filtering.

## What I Tested And Results

- `npx jest miniprogram/__tests__/home.test.js --runInBand`: passed, 1 test.
- `npm run test:unit -- --runInBand`: passed, 4 suites and 12 tests.
- `npm test -- --runInBand`: passed, 7 suites and 45 tests.
- `node --check miniprogram/pages/home/home.js`: passed.
- `git diff --check`: passed with no whitespace errors.

## Files Changed

- `miniprogram/pages/home/home.js`
- `miniprogram/pages/home/home.wxml`
- `miniprogram/pages/home/home.wxss`
- `miniprogram/__tests__/home.test.js`
- `.superpowers/sdd/task-6-report.md`

## Self-Review Findings

- No findings. The dashboard now passes real project data to `summarizeCapital`, filters reminders by the specified statuses, and uses shared color and radius tokens.

## Concerns

- `miniprogram/pages/stats/` remains untracked and untouched because it belongs to Task 7.

## Review Fixes

- Added distinct `reminder--due-soon` and `reminder--overdue` classes to the dashboard reminder rows.
- Applied restrained Apple-token left-edge accents: `--color-warning` for due-soon and `--color-danger` for overdue.
- Removed the unrelated generated plan document `docs/superpowers/plans/2026-07-22-dashboard-active-capital-reminders.md` from the worktree.
- Added a regression test covering the distinct reminder classes and token-backed styles.
