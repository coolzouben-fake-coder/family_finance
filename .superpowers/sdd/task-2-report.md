# Task 2 Report: Finance And Date Domain Utilities

## What I implemented

- Added Jest metadata and scripts in `package.json`.
- Added date utilities in `miniprogram/utils/date.js`:
  - `daysInclusive`
  - `getDateStatus`
- Added finance utilities in `miniprogram/utils/finance.js`:
  - `calcExpectedInterest`
  - `calcActualTotalReturn`
  - `calcActualAnnualRate`
  - `summarizeCapital`
- Added the specified date and finance unit tests.

## What I tested and test results

- Targeted utility tests: 2 suites passed, 8 tests passed.
- Full configured unit test command: 2 suites passed, 8 tests passed.
- `npm install` completed successfully with 0 vulnerabilities reported.

## TDD Evidence

### RED

Command:

```text
npm test -- miniprogram/__tests__/date.test.js miniprogram/__tests__/finance.test.js
```

Result before implementation:

```text
FAIL miniprogram/__tests__/date.test.js
  Cannot find module '../utils/date'
FAIL miniprogram/__tests__/finance.test.js
  Cannot find module '../utils/finance'
Test Suites: 2 failed, 2 total
Tests:       0 total
exit_code=1
```

### GREEN

Command:

```text
npm test -- miniprogram/__tests__/date.test.js miniprogram/__tests__/finance.test.js
```

Result after implementation:

```text
PASS miniprogram/__tests__/date.test.js
PASS miniprogram/__tests__/finance.test.js
Test Suites: 2 passed, 2 total
Tests:       8 passed, 8 total
exit_code=0
```

Additional verification:

```text
npm run test:unit
Test Suites: 2 passed, 2 total
Tests:       8 passed, 8 total
exit_code=0
```

## Files changed

- `package.json`
- `miniprogram/utils/date.js`
- `miniprogram/utils/finance.js`
- `miniprogram/__tests__/date.test.js`
- `miniprogram/__tests__/finance.test.js`
- `.superpowers/sdd/task-2-report.md`

## Self-review findings

- Implementations match the interfaces and code specified in the task brief.
- Date calculations use UTC to avoid local timezone and daylight-saving effects.
- Money outputs are rounded to two decimal places; annualized rate remains a ratio as specified.
- Manual `redeemed` and `cancelled` states take precedence over date-derived states.

## Concerns

- The implementation follows the exact brief and does not add validation for malformed dates, negative durations, or missing project arrays. Those behaviors are outside the specified contract and remain untested.
- Jest installation emitted deprecation warnings for transitive packages, but installation completed and reported 0 vulnerabilities.

## Review finding fix

- Updated `getDateStatus(project, today, dueSoonDays)` to default `dueSoonDays` to `3` when omitted.
- Added a regression test covering a project ending within the default three-day window.

## Fix verification

### RED

Command:

```text
npm test -- miniprogram/__tests__/date.test.js
```

Result before the production fix:

```text
FAIL miniprogram/__tests__/date.test.js
Expected: "due_soon"
Received: "active"
Test Suites: 1 failed, 1 total
Tests:       1 failed, 4 passed, 5 total
exit_code=1
```

### GREEN

Commands and results:

```text
npm test -- miniprogram/__tests__/date.test.js miniprogram/__tests__/finance.test.js
Test Suites: 2 passed, 2 total
Tests:       9 passed, 9 total
exit_code=0

npm run test:unit
Test Suites: 2 passed, 2 total
Tests:       9 passed, 9 total
exit_code=0

git diff --check
exit_code=0
```

## Fix files changed

- `miniprogram/utils/date.js`
- `miniprogram/__tests__/date.test.js`
- `.superpowers/sdd/task-2-report.md`
