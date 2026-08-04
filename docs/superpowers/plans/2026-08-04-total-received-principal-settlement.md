# Total Received Principal Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users enter total received principal settlement amount while preserving existing `actualInterest` storage and stats behavior.

**Architecture:** Keep the transformation in `miniprogram/pages/project-form/project-form.js`. Page state stores `principalForm.totalReceivedAmount`; submit handlers compute `actualInterest` from total received amount minus `form.principal`.

**Tech Stack:** WeChat Mini Program WXML/JS, Jest tests.

## Global Constraints

- Do not change cloud function action payload names except the existing `actualInterest` value sent from the page.
- Do not migrate existing persisted project data.
- Preserve negative derived interest support for correction/loss cases.
- Follow existing page object and Jest patterns.

---

### Task 1: Principal Settlement Total Received Input

**Files:**
- Modify: `miniprogram/__tests__/project-form.test.js`
- Modify: `miniprogram/pages/project-form/project-form.js`
- Modify: `miniprogram/pages/project-form/project-form.wxml`

**Interfaces:**
- Consumes: page data `form.principal`, `principalForm.totalReceivedAmount`
- Produces: cloud payload field `actualInterest: Number(totalReceivedAmount || 0) - Number(form.principal || 0)`

- [ ] **Step 1: Write the failing tests**

Add/adjust tests so principal settlement sets `principalForm.totalReceivedAmount = '10999'` with `form.principal = '10000'` and expects `redeemPrincipalProject(..., { actualInterest: 999 })`. Add a load test for a redeemed project with `principal: 10000` and `actualInterest: 20` expecting `principalForm.totalReceivedAmount` to be `'10020'`. Add WXML copy assertions for `总到账` and `本金+利息`.

- [ ] **Step 2: Run tests to verify red**

Run: `npm test -- miniprogram/__tests__/project-form.test.js --runInBand`

Expected: FAIL because the page still stores `actualInterest`, calculates no derived value, and the WXML still says `利息`.

- [ ] **Step 3: Implement minimal page changes**

In `project-form.js`, change initial `principalForm` shape to `{ redeemDate: '', totalReceivedAmount: '' }`. Add helpers:

```javascript
function totalReceivedAmountOf(project) {
  if (!project) return '';
  return String(Number(project.principal || 0) + Number(project.actualInterest || 0));
}

function actualInterestFromTotal(form, principalForm, redeemForm) {
  const totalReceivedAmount = Number(principalForm.totalReceivedAmount || redeemForm.totalReceivedAmount || 0);
  return totalReceivedAmount - Number(form.principal || 0);
}
```

Use `totalReceivedAmountOf(project)` when loading `principalForm` and `redeemForm` for settled projects. Use `actualInterestFromTotal(...)` in `redeem()` and `redeemPrincipal()`.

- [ ] **Step 4: Update WXML copy and bindings**

Change principal settlement input labels/placeholders from direct interest to total received amount:

```xml
<label class="weui-label">总到账</label>
<input class="weui-input field" type="text" placeholder="本金+利息" value="{{principalForm.totalReceivedAmount}}" data-field="totalReceivedAmount" bindinput="onPrincipalInput" ... />
```

Apply the same binding in the redeemed correction section.

- [ ] **Step 5: Run focused tests green**

Run: `npm test -- miniprogram/__tests__/project-form.test.js --runInBand`

Expected: PASS.

- [ ] **Step 6: Run related test suite**

Run: `npm test -- miniprogram/__tests__/project-form.test.js miniprogram/__tests__/stats.test.js miniprogram/__tests__/finance.test.js --runInBand`

Expected: PASS.
