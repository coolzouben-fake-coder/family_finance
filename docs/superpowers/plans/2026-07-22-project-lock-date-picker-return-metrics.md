# Project Lock Date Picker Return Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement locked project records, date picker inputs, deletion from detail pages, and realtime in-transit/realized return metrics for the family finance mini program.

**Architecture:** Keep statistics derived from `projects` plus `family_assets/current`, so deletion automatically releases principal and removes project returns. Lock base project editing in both the mini program UI and the `projects` cloud function while preserving explicit redemption and redemption-correction actions.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JS, WeChat Cloud Development cloud functions, Jest.

## Global Constraints

- WeChat Cloud environment ID remains `cloudbase-d7gx0ikiwa58549a4`.
- New projects are immutable after creation except explicit delete and redemption/correction flows.
- Current investment is active project principal only.
- In-transit return is active `expectedInterest + fixedReward`.
- Realized return is redeemed `actualInterest + actualFixedReward`.
- Deleting any project removes its principal and returns from realtime stats.
- Date fields use WeChat `<picker mode="date">`.
- Keep the current WeUI/微信原生 UI style and restored field proportions.

---

### Task 1: Dashboard Return Metrics

**Files:**
- Modify: `miniprogram/utils/finance.js`
- Modify: `miniprogram/__tests__/finance.test.js`
- Modify: `miniprogram/pages/home/home.js`
- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/__tests__/home.test.js`

**Interfaces:**
- Consumes: `summarizeCapital(totalAssets, projects)`
- Produces: summary object with `totalAssets`, `investedAmount`, `idleAmount`, `utilizationRate`, `inTransitReturn`, `realizedReturn`

- [ ] **Step 1: Write failing tests**

Add expectations that active projects contribute expected return to `inTransitReturn`, redeemed projects contribute actual return to `realizedReturn`, and omitted/deleted projects do not appear in either figure.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- miniprogram/__tests__/finance.test.js miniprogram/__tests__/home.test.js --runInBand`
Expected: FAIL because the new metric keys are missing.

- [ ] **Step 3: Implement summary and dashboard fields**

Update `summarizeCapital()` and the home page metric data/WXML cards. Rename the invested label to `当前投资总金额`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- miniprogram/__tests__/finance.test.js miniprogram/__tests__/home.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add miniprogram/utils/finance.js miniprogram/__tests__/finance.test.js miniprogram/pages/home/home.js miniprogram/pages/home/home.wxml miniprogram/__tests__/home.test.js docs/superpowers/plans/2026-07-22-project-lock-date-picker-return-metrics.md && git commit -m "feat: add return metrics to dashboard"`

### Task 2: Server-Side Project Immutability

**Files:**
- Modify: `cloudfunctions/projects/index.js`
- Modify: `cloudfunctions/projects/index.test.js`

**Interfaces:**
- Consumes: existing `projects` cloud function `update` action
- Produces: `PROJECT_BASE_LOCKED` error for attempts to update project base fields after creation

- [ ] **Step 1: Write failing test**

Change the existing update test to assert that `action: 'update'` rejects with `PROJECT_BASE_LOCKED` and leaves the stored project unchanged.

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- cloudfunctions/projects/index.test.js --runInBand`
Expected: FAIL because `update` still succeeds.

- [ ] **Step 3: Implement minimal lock**

Make `updateProject()` validate the id by loading the project, then throw `PROJECT_BASE_LOCKED`. Leave create, redeem, correctRedemption, cancel, and remove unchanged.

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- cloudfunctions/projects/index.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add cloudfunctions/projects/index.js cloudfunctions/projects/index.test.js && git commit -m "feat: lock project base updates"`

### Task 3: Project Form Date Picker And Delete

**Files:**
- Modify: `miniprogram/pages/project-form/project-form.js`
- Modify: `miniprogram/pages/project-form/project-form.wxml`
- Modify: `miniprogram/pages/project-form/project-form.wxss`
- Modify: `miniprogram/__tests__/project-form.test.js`

**Interfaces:**
- Consumes: `removeProject(id)` service
- Produces: `onDateChange(event)`, `onRedeemDateChange(event)`, `remove()`, `removing` state, locked existing project form

- [ ] **Step 1: Write failing tests**

Add tests that date pickers exist, date handlers update form state, existing active projects are locked after loading, and detail-page deletion calls `removeProject()` after confirmation.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- miniprogram/__tests__/project-form.test.js --runInBand`
Expected: FAIL because the handlers, remove import, delete button, and active lock are absent.

- [ ] **Step 3: Implement minimal form behavior**

Replace date text inputs with date pickers, bind handlers, set `isLocked` for any existing project, import and call `removeProject()`, add a destructive-style delete button, and include `removing` in disabled states.

- [ ] **Step 4: Run test to verify pass**

Run: `npm test -- miniprogram/__tests__/project-form.test.js --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add miniprogram/pages/project-form/project-form.js miniprogram/pages/project-form/project-form.wxml miniprogram/pages/project-form/project-form.wxss miniprogram/__tests__/project-form.test.js && git commit -m "feat: lock project form and add date pickers"`

### Task 4: Final Verification And Deployment

**Files:**
- Verify all changed files
- Deploy: `cloudfunctions/projects`

- [ ] **Step 1: Run full test suite**

Run: `npm test -- --runInBand`
Expected: PASS.

- [ ] **Step 2: Deploy updated cloud function**

Run: `npx -y -p @cloudbase/cli cloudbase fn deploy projects --dir cloudfunctions/projects --force --env-id cloudbase-d7gx0ikiwa58549a4 --runtime Nodejs16.13`
Expected: deploy success for `projects`.

- [ ] **Step 3: Inspect final diff and status**

Run: `git status --short && git log --oneline -3`
Expected: only pre-existing unrelated dirty files remain, plus commits for the implementation.
