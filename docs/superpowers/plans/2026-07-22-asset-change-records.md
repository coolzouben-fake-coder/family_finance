# Asset Change Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct family asset edits with deposit/withdraw changes and show all adjustment records from the home page.

**Architecture:** Keep `family_assets/current` as the derived current balance and `asset_changes` as the immutable audit log. The `assets` cloud function owns balance calculation in a transaction; the mini program sends only change type, amount, and reason, then queries the full record list for display.

**Tech Stack:** WeChat Mini Program JS/WXML/WXSS, WeChat Cloud Development cloud functions, Jest.

## Global Constraints

- WeChat Cloud environment ID remains `cloudbase-d7gx0ikiwa58549a4`.
- Family asset changes require `type`, `amount`, and `reason`.
- `type` is exactly `deposit` or `withdraw`.
- Withdraw cannot make the latest total asset amount negative.
- Adjustment records show all records in descending creation order.
- Existing records without `type` and `amount` must remain displayable by deriving them from `beforeAmount` and `afterAmount`.

---

### Task 1: Cloud Function Asset Changes

**Files:**
- Modify: `cloudfunctions/assets/index.js`
- Modify: `cloudfunctions/assets/index.test.js`

**Interfaces:**
- Consumes: `main({ action: 'update', type, amount, reason })`
- Produces: `main({ action: 'listChanges' }) -> { ok: true, changes: AssetChange[] }`
- Produces: asset change rows with `type`, `amount`, `beforeAmount`, `afterAmount`, `reason`, `operatorOpenid`, `createdAt`

- [ ] **Step 1: Write failing tests**

Add tests for deposit, withdraw, insufficient withdraw rejection, and list all changes newest first.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- cloudfunctions/assets/index.test.js --runInBand`
Expected: FAIL because `type`, `amount`, and `listChanges` are not implemented.

- [ ] **Step 3: Implement minimal cloud function behavior**

Validate `type`, validate positive `amount`, compute the new total inside the existing transaction, write audit rows, and add `listChanges`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- cloudfunctions/assets/index.test.js --runInBand`
Expected: PASS.

### Task 2: Home Page UI And Service

**Files:**
- Modify: `miniprogram/services/cloud.js`
- Modify: `miniprogram/pages/home/home.js`
- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/pages/home/home.wxss`
- Modify: `miniprogram/__tests__/home.test.js`

**Interfaces:**
- Consumes: `updateAssets(type, amount, reason)`
- Consumes: `listAssetChanges()`
- Produces: home page state `assetChangeType`, `assetAmountInput`, `assetReasonInput`, `showingAssetChanges`, `assetChanges`

- [ ] **Step 1: Write failing tests**

Update home tests so saving sends `(deposit|withdraw, amount, reason)`, invalid amount/reason is rejected, and the markup includes the records entry/list.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- miniprogram/__tests__/home.test.js --runInBand`
Expected: FAIL because the service and UI still use direct total amount editing.

- [ ] **Step 3: Implement minimal UI behavior**

Add a segmented-style deposit/withdraw selector, amount input, reason input, record toggle, record formatting, and service wrappers.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- miniprogram/__tests__/home.test.js --runInBand`
Expected: PASS.

### Task 3: Verification And Deployment

**Files:**
- Verify all changed files
- Deploy: `cloudfunctions/assets`

- [ ] **Step 1: Run full test suite**

Run: `npm test -- --runInBand`
Expected: PASS.

- [ ] **Step 2: Commit implementation**

Run: `git add cloudfunctions/assets/index.js cloudfunctions/assets/index.test.js miniprogram/services/cloud.js miniprogram/pages/home/home.js miniprogram/pages/home/home.wxml miniprogram/pages/home/home.wxss miniprogram/__tests__/home.test.js docs/superpowers/plans/2026-07-22-asset-change-records.md && git commit -m "feat: add asset change records"`

- [ ] **Step 3: Deploy updated cloud function**

Run: `printf '\n' | npx -y -p @cloudbase/cli cloudbase fn deploy assets --dir cloudfunctions/assets --force --env-id cloudbase-d7gx0ikiwa58549a4 --runtime Nodejs16.13`
Expected: deploy success for `assets`.
