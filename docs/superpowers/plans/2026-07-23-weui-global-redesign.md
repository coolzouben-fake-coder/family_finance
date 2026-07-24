# WeUI Global Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the mini program UI to use Tencent WeUI wxss conventions globally and update UI documentation away from the previous Apple-inspired style.

**Architecture:** Import WeUI rpx styles globally, keep existing page JavaScript and cloud service behavior unchanged, and rewrite page/component WXML/WXSS to use WeUI cells, panels, buttons, forms, badges, and msg patterns. Keep local WXSS only for page layout, metric emphasis, finance-specific status colors, and spacing that WeUI does not cover.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JS, Tencent `weui-wxss`, Jest markup/style tests.

## Global Constraints

- Use Tencent WeUI wxss as the primary visual system for pages and reusable components.
- Do not replace working business logic or cloud function contracts.
- Prefer WeUI class names such as `weui-cells`, `weui-cell`, `weui-panel`, `weui-btn`, `weui-form`, `weui-badge`, and `weui-msg`.
- Keep WXML expressions simple enough for WeChat Developer Tools compilation.
- Update UI documentation to describe WeUI/微信原生体验 instead of Apple/iOS-style rules.
- Preserve existing user-facing workflows: dashboard, asset adjustment, asset change records, project list filters/actions, project form, annual stats, and access-denied state.

---

### Task 1: Global WeUI Style Foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/styles/design-tokens.wxss`
- Modify: `docs/ui/apple-style-guide.md`
- Create: `docs/ui/weui-style-guide.md`

**Interfaces:**
- Consumes: `weui-wxss` npm package.
- Produces: global WeUI import in `miniprogram/app.wxss` and WeUI-oriented documentation.

- [x] **Step 1: Write failing tests**

Add style/document tests that expect WeUI import and WeUI documentation rules.

- [x] **Step 2: Run tests**

Run: `npm test -- miniprogram/__tests__/ui-style.test.js --runInBand`
Expected: FAIL because WeUI is not imported and docs still describe Apple-inspired UI.

- [x] **Step 3: Implement foundation**

Install `weui-wxss`, import its rpx stylesheet from `app.wxss`, simplify custom tokens to WeUI-compatible supplements, and write `docs/ui/weui-style-guide.md`.

- [x] **Step 4: Verify**

Run: `npm test -- miniprogram/__tests__/ui-style.test.js --runInBand`
Expected: PASS.

### Task 2: Dashboard And Metrics

**Files:**
- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/pages/home/home.wxss`
- Modify: `miniprogram/components/metric-card/metric-card.wxml`
- Modify: `miniprogram/components/metric-card/metric-card.wxss`
- Modify: `miniprogram/__tests__/home.test.js`

**Interfaces:**
- Consumes: existing home page data fields.
- Produces: WeUI panels/cells/buttons for dashboard, asset adjustment, records, and reminders.

- [x] **Step 1: Write failing tests**

Update home tests to expect WeUI panels, cells, form controls, and buttons.

- [x] **Step 2: Run tests**

Run: `npm test -- miniprogram/__tests__/home.test.js --runInBand`
Expected: FAIL because dashboard markup is still custom.

- [x] **Step 3: Implement dashboard refactor**

Rewrite home WXML/WXSS and metric card component with WeUI classes while keeping existing data and event bindings.

- [x] **Step 4: Verify**

Run: `npm test -- miniprogram/__tests__/home.test.js --runInBand`
Expected: PASS.

### Task 3: Project List And Project Form

**Files:**
- Modify: `miniprogram/pages/projects/projects.wxml`
- Modify: `miniprogram/pages/projects/projects.wxss`
- Modify: `miniprogram/components/project-card/project-card.wxml`
- Modify: `miniprogram/components/project-card/project-card.wxss`
- Modify: `miniprogram/pages/project-form/project-form.wxml`
- Modify: `miniprogram/pages/project-form/project-form.wxss`
- Modify: `miniprogram/__tests__/projects.test.js`
- Modify: `miniprogram/__tests__/project-form.test.js`

**Interfaces:**
- Consumes: existing project list and form data/events.
- Produces: WeUI cells/panels/form/buttons for list, cards, filters, project creation, redemption, and deletion.

- [x] **Step 1: Write failing tests**

Update tests to expect WeUI classes in project list, project card, and form markup.

- [x] **Step 2: Run tests**

Run: `npm test -- miniprogram/__tests__/projects.test.js miniprogram/__tests__/project-form.test.js --runInBand`
Expected: FAIL because markup is still custom.

- [x] **Step 3: Implement project UI refactor**

Rewrite WXML/WXSS with WeUI panel/cell/form/button classes and preserve picker/input behavior.

- [x] **Step 4: Verify**

Run: `npm test -- miniprogram/__tests__/projects.test.js miniprogram/__tests__/project-form.test.js --runInBand`
Expected: PASS.

### Task 4: Stats And Access Denied

**Files:**
- Modify: `miniprogram/pages/stats/stats.wxml`
- Modify: `miniprogram/pages/stats/stats.wxss`
- Modify: `miniprogram/pages/auth-denied/auth-denied.wxml`
- Modify: `miniprogram/pages/auth-denied/auth-denied.wxss`
- Modify: `miniprogram/__tests__/stats.test.js`

**Interfaces:**
- Consumes: existing stats and auth-denied data.
- Produces: WeUI panels/cells/msg markup.

- [x] **Step 1: Write failing tests**

Update stats tests and add markup checks for WeUI `weui-msg`.

- [x] **Step 2: Run tests**

Run: `npm test -- miniprogram/__tests__/stats.test.js --runInBand`
Expected: FAIL because markup is still custom.

- [x] **Step 3: Implement remaining page refactor**

Rewrite stats and auth-denied WXML/WXSS with WeUI classes.

- [x] **Step 4: Verify**

Run: `npm test -- miniprogram/__tests__/stats.test.js --runInBand`
Expected: PASS.

### Task 5: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full tests**

Run: `npm test -- --runInBand`
Expected: PASS.

- [ ] **Step 2: Commit**

Run: `git add package.json package-lock.json miniprogram docs && git commit -m "feat: refactor ui with weui"`

- [ ] **Step 3: Report**

Report that this is a frontend/documentation change and does not require cloud function deployment.
