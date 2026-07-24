# Expected Return Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow new projects to choose exactly one expected return input mode: annualized rate or fixed expected return, with fixed reward available in both modes.

**Architecture:** Store both modes through the existing `expectedInterest` field so dashboard and project list totals continue using `expectedInterest + fixedReward`. Add `expectedReturnMode` and `expectedFixedReturn` for auditability and edit display. Keep annual statistics based only on redeemed actual return fields.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JS, WeChat Cloud Functions, Jest.

## Global Constraints

- WeChat cloud functions remain the source of validation truth.
- The two expected return modes are mutually exclusive.
- Annual statistics must continue to calculate actual annualized return from actual redeemed returns only.

---

### Task 1: Frontend Expected Return Mode

**Files:**
- Modify: `miniprogram/pages/project-form/project-form.js`
- Modify: `miniprogram/pages/project-form/project-form.wxml`
- Modify: `miniprogram/pages/project-form/project-form.wxss`
- Modify: `miniprogram/__tests__/project-form.test.js`

**Interfaces:**
- Produces: `form.expectedReturnMode`, `form.expectedFixedReturn`, `onExpectedReturnModeChange`.
- Consumes: existing `createProject(project)` payload.

- [ ] Add failing tests for annual-rate and fixed-return payloads.
- [ ] Implement mode switching and one visible input per mode.
- [ ] Verify project form tests pass.

### Task 2: Cloud Function Validation

**Files:**
- Modify: `cloudfunctions/projects/index.js`
- Modify: `cloudfunctions/projects/index.test.js`

**Interfaces:**
- Consumes: `project.expectedReturnMode`, `project.expectedAnnualRate`, `project.expectedFixedReturn`, `project.fixedReward`.
- Produces: stored `expectedInterest`, `expectedAnnualRate`, `expectedFixedReturn`, `expectedReturnMode`.

- [ ] Add failing tests for fixed-return creation and contradictory mode payloads.
- [ ] Implement validation and expected-interest calculation.
- [ ] Verify project cloud function tests pass.

### Task 3: Statistics Regression

**Files:**
- Modify: `cloudfunctions/stats/index.test.js`

**Interfaces:**
- Consumes: existing annual stats output.
- Produces: regression coverage that expected return fields do not affect actual annualized stats.

- [ ] Add a redeemed project with large expected fields and unchanged actual fields.
- [ ] Verify annualized stats use actual returns only.

### Task 4: Final Verification

- [ ] Run `npm test -- --runInBand`.
