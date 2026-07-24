# Family Finance Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **UI update, 2026-07-23:** The early Apple-inspired UI notes in this historical plan have been superseded by Tencent WeUI. Use `docs/ui/weui-style-guide.md` and `miniprogram/styles/weui.wxss` for all current UI work.

**Goal:** Build a WeChat mini program for two family members to track finance projects, current capital usage, idle funds, and realized returns.

**Architecture:** Use native WeChat Mini Program pages for UI, shared JavaScript modules for deterministic finance calculations, and WeChat Cloud Development for authentication, database storage, and server-side permission checks. Keep derived values computed from raw project fields so statistics stay consistent after edits.

**Tech Stack:** Native WeChat Mini Program, WeChat Cloud Development, cloud database, Node.js cloud functions, `miniprogram-simulate` for unit/component tests where practical.

## Global Constraints

- The implementation must use WeChat Cloud Development (`wx.cloud`) for backend storage and cloud functions.
- First version does not build a full account system for bank, Alipay, broker, or card balances.
- First version does not integrate real-time market data, bank sync, WeChat Pay, paid servers, domains, SMS, or third-party paid services.
- First version does not send WeChat subscription messages; reminders appear in the home dashboard and project list.
- Only two whitelisted family users may access data.
- Finance projects belong to the family-level capital pool; only `registrantOpenid` is recorded for filtering and summaries.
- Actual holding days include both the start date and redeem date.
- Actual annualized return is computed as `actualTotalReturn / principal / holdingDays * 365`.
- Due-soon threshold defaults to 3 days.
- The UI must follow an Apple-inspired design language: calm iOS-style hierarchy, system background colors, large readable numerals, restrained cards, native-feeling controls, clear status colors, and no decorative gradients or marketing-style hero sections.

---

## File Structure

- Modify `project.config.json`: WeChat Developer Tools project configuration, preserving the existing AppID.
- Create `miniprogram/app.js`, `miniprogram/app.json`, `miniprogram/app.wxss`: mini program bootstrap, routing, and global styles under `miniprogramRoot`.
- Create `docs/ui/apple-style-guide.md`: UI principles, layout rules, colors, typography, and component states for this mini program.
- Create `miniprogram/styles/design-tokens.wxss`: Apple-inspired global CSS variables and utility classes for WeChat Mini Program pages.
- Create `sitemap.json`: WeChat mini program sitemap config.
- Create `cloudfunctions/login/index.js`: returns current `openid` and whitelist status.
- Create `cloudfunctions/bootstrap/index.js`: initializes built-in categories and default settings.
- Create `cloudfunctions/assets/index.js`: reads and updates family total assets with change history.
- Create `cloudfunctions/projects/index.js`: CRUD and redeem/cancel actions for finance projects.
- Create `cloudfunctions/stats/index.js`: aggregates dashboard and annual statistics.
- Create `miniprogram/utils/date.js`: inclusive date and status helpers.
- Create `miniprogram/utils/finance.js`: expected return, actual return, annualized return, capital usage helpers.
- Create `miniprogram/services/cloud.js`: typed wrappers around `wx.cloud.callFunction`.
- Create `miniprogram/services/session.js`: login and whitelist session helper.
- Create `miniprogram/pages/auth-denied/*`: no-permission page.
- Create `miniprogram/pages/home/*`: dashboard page.
- Create `miniprogram/pages/projects/*`: project list page.
- Create `miniprogram/pages/project-form/*`: add/edit/redeem project page.
- Create `miniprogram/pages/stats/*`: annual statistics page.
- Create `miniprogram/components/metric-card/*`: compact reusable metric display.
- Create `miniprogram/components/project-card/*`: reusable project summary display.
- Create `miniprogram/__tests__/finance.test.js`: calculation unit tests.
- Create `miniprogram/__tests__/date.test.js`: date/status unit tests.
- Create `cloudfunctions/__tests__/permissions.test.js`: cloud permission unit tests.
- Create `docs/qa/first-version-checklist.md`: manual WeChat Developer Tools acceptance checklist.

---

### Task 0: Apple-Inspired UI Structure And Visual System

**Files:**
- Create: `docs/ui/apple-style-guide.md`
- Create: `miniprogram/styles/design-tokens.wxss`

**Interfaces:**
- Produces: visual rules that all page and component tasks must follow.
- Produces: reusable WXSS variables/classes imported by `miniprogram/app.wxss`.
- Produces: status color names for `active`, `due_soon`, `overdue_pending`, `redeemed`, and `cancelled`.

- [ ] **Step 1: Write UI style guide**

Write `docs/ui/apple-style-guide.md`:

```markdown
# Apple-Inspired UI Style Guide

## Direction

The mini program should feel like a quiet iOS finance utility: clear hierarchy, high readability, restrained surfaces, and native-feeling interactions. It should prioritize repeated daily use over visual decoration.

## Information Architecture

- Home answers: how much money is total, invested, idle, and approaching action.
- Projects answers: what projects exist, which need attention, and what each one earns.
- Project form answers: what needs to be recorded now, with redeemed fields shown only when confirming arrival.
- Stats answers: what was earned this year, by month, category, reward type, and registrant.

## Layout

- Use a `page` wrapper with 32rpx horizontal padding and 24rpx vertical padding.
- Use 8rpx corner radius for cards, inputs, buttons, and status labels.
- Use white grouped surfaces on a light system background.
- Do not nest cards inside cards.
- Keep dashboard metrics in a two-column grid on normal mobile widths.
- Put action-needed sections below metrics, not above them.

## Typography

- Use system font stack: `-apple-system`, `BlinkMacSystemFont`, `"SF Pro Text"`, `"Helvetica Neue"`, `Arial`, sans-serif.
- Page titles use 44rpx, weight 700.
- Section titles use 32rpx, weight 700.
- Primary metric numbers use 40rpx, weight 700.
- Body text uses 28rpx.
- Supporting text uses 24rpx and muted color.
- Letter spacing is 0.

## Color

- System background: `#F5F5F7`.
- Grouped card background: `#FFFFFF`.
- Primary text: `#1D1D1F`.
- Secondary text: `#6E6E73`.
- Separator: `#E5E5EA`.
- Accent: `#007AFF`.
- Success/redeemed: `#34C759`.
- Warning/due soon: `#FF9500`.
- Danger/overdue: `#FF3B30`.
- Cancelled/neutral: `#8E8E93`.

## Components

- Metric card: label, large numeric value, optional hint. It must not contain paragraphs.
- Project card: title, status label, principal, date range, expected return, actual annualized return.
- Status label: compact rounded label with one of the status colors.
- Primary button: filled accent background, white text, 88rpx height.
- Secondary button: white background, accent text, 1rpx separator border.
- Inputs: grouped white field, 88rpx minimum height, 28rpx text, clear placeholder.

## States

- Loading: show skeleton-like empty surfaces or short loading text; keep layout dimensions stable.
- Empty: one concise sentence and one relevant action button.
- Error: concise message, no stack traces.
- Auth denied: centered title and short explanation.

## Status Labels

- `active`: accent blue, text `进行中`.
- `due_soon`: warning orange, text `即将到期`.
- `overdue_pending`: danger red, text `待确认`.
- `redeemed`: success green, text `已到账`.
- `cancelled`: neutral gray, text `已取消`.
```

- [ ] **Step 2: Create global design tokens**

Write `miniprogram/styles/design-tokens.wxss`:

```css
page {
  --color-system-background: #f5f5f7;
  --color-grouped-background: #ffffff;
  --color-primary-text: #1d1d1f;
  --color-secondary-text: #6e6e73;
  --color-tertiary-text: #8e8e93;
  --color-separator: #e5e5ea;
  --color-accent: #007aff;
  --color-success: #34c759;
  --color-warning: #ff9500;
  --color-danger: #ff3b30;
  --radius-card: 8rpx;
  --space-page-x: 32rpx;
  --space-page-y: 24rpx;
  --space-section: 32rpx;
  --font-title: 44rpx;
  --font-section: 32rpx;
  --font-metric: 40rpx;
  --font-body: 28rpx;
  --font-caption: 24rpx;
}

.page {
  min-height: 100vh;
  padding: var(--space-page-y) var(--space-page-x);
  background: var(--color-system-background);
  box-sizing: border-box;
  color: var(--color-primary-text);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
  letter-spacing: 0;
}

.surface {
  border-radius: var(--radius-card);
  background: var(--color-grouped-background);
}

.section-title {
  color: var(--color-primary-text);
  font-size: var(--font-section);
  font-weight: 700;
  line-height: 1.25;
}

.caption {
  color: var(--color-secondary-text);
  font-size: var(--font-caption);
  line-height: 1.4;
}

.primary-button {
  height: 88rpx;
  border-radius: var(--radius-card);
  background: var(--color-accent);
  color: #ffffff;
  font-size: var(--font-body);
  font-weight: 600;
  line-height: 88rpx;
}

.secondary-button {
  height: 88rpx;
  border: 1rpx solid var(--color-separator);
  border-radius: var(--radius-card);
  background: var(--color-grouped-background);
  color: var(--color-accent);
  font-size: var(--font-body);
  font-weight: 600;
  line-height: 88rpx;
}

.status-label {
  min-width: 112rpx;
  padding: 8rpx 12rpx;
  border-radius: var(--radius-card);
  box-sizing: border-box;
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

.status-active {
  background: var(--color-accent);
}

.status-due-soon {
  background: var(--color-warning);
}

.status-overdue {
  background: var(--color-danger);
}

.status-redeemed {
  background: var(--color-success);
}

.status-cancelled {
  background: var(--color-tertiary-text);
}
```

- [ ] **Step 3: Verify UI direction before implementation**

Check the style guide and token file before Task 1.

Expected:
- The style guide explicitly says the app is a quiet iOS-style finance utility.
- The token file includes system background, grouped background, primary text, secondary text, accent, success, warning, danger, and neutral status colors.
- No gradients, decorative blobs, hero sections, or marketing-style layouts are introduced.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/ui/apple-style-guide.md miniprogram/styles/design-tokens.wxss docs/superpowers/plans/2026-07-21-family-finance-projects.md
git commit -m "docs: add apple-inspired ui system plan"
```

Expected: commit succeeds.

---

### Task 1: Mini Program And Cloud Development Scaffold

**Files:**
- Modify: `project.config.json`
- Create: `miniprogram/app.js`
- Create: `miniprogram/app.json`
- Create: `miniprogram/app.wxss`
- Create: `sitemap.json`
- Create: `miniprogram/pages/home/home.js`
- Create: `miniprogram/pages/home/home.json`
- Create: `miniprogram/pages/home/home.wxml`
- Create: `miniprogram/pages/home/home.wxss`
- Create: `cloudfunctions/bootstrap/index.js`
- Create: `cloudfunctions/bootstrap/package.json`

**Interfaces:**
- Produces: `wx.cloud.init({ traceUser: true })` in `miniprogram/app.js`, using the default cloud environment selected in WeChat Developer Tools.
- Produces: page routes `pages/home/home`, `pages/projects/projects`, `pages/stats/stats`.
- Produces: cloud function `bootstrap` with input `{}` and output `{ ok: true, categoriesInserted: number, settingsReady: true }`.

- [ ] **Step 1: Create WeChat project config**

Update `project.config.json` without changing the existing `appid`:

```json
{
  "setting": {
    "urlCheck": true,
    "es6": true,
    "postcss": true,
    "minified": true,
    "enhance": true
  },
  "compileType": "miniprogram",
  "appid": "wxcabf6afa48b9277d",
  "projectname": "yangmao",
  "miniprogramRoot": "miniprogram/",
  "cloudfunctionRoot": "cloudfunctions/",
  "condition": {}
}
```

- [ ] **Step 2: Create app bootstrap**

Write `miniprogram/app.js`:

```js
App({
  globalData: {
    session: null
  },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({
        title: '当前微信版本过低',
        content: '请升级微信后使用云开发能力。',
        showCancel: false
      });
      return;
    }

    wx.cloud.init({ traceUser: true });
  }
});
```

Write `miniprogram/app.json`:

```json
{
  "pages": [
    "pages/home/home",
    "pages/projects/projects",
    "pages/project-form/project-form",
    "pages/stats/stats",
    "pages/auth-denied/auth-denied"
  ],
  "window": {
    "navigationBarTitleText": "家庭理财",
    "navigationBarBackgroundColor": "#F5F5F7",
    "navigationBarTextStyle": "black",
    "backgroundColor": "#F5F5F7"
  },
  "tabBar": {
    "color": "#667085",
    "selectedColor": "#007AFF",
    "backgroundColor": "#FFFFFF",
    "borderStyle": "black",
    "list": [
      {
        "pagePath": "pages/home/home",
        "text": "首页"
      },
      {
        "pagePath": "pages/projects/projects",
        "text": "项目"
      },
      {
        "pagePath": "pages/stats/stats",
        "text": "统计"
      }
    ]
  },
  "style": "v2",
  "sitemapLocation": "sitemap.json"
}
```

Write `miniprogram/app.wxss`:

```css
@import "./styles/design-tokens.wxss";

page {
  background: var(--color-system-background);
  color: var(--color-primary-text);
}
```

Write `sitemap.json`:

```json
{
  "rules": [
    {
      "action": "allow",
      "page": "*"
    }
  ]
}
```

- [ ] **Step 3: Add a minimal home page**

Write `miniprogram/pages/home/home.json`:

```json
{
  "navigationBarTitleText": "家庭理财"
}
```

Write `miniprogram/pages/home/home.wxml`:

```xml
<view class="page">
  <view class="title">家庭理财</view>
  <view class="subtitle">当前资金状态与项目到期提醒</view>
</view>
```

Write `miniprogram/pages/home/home.wxss`:

```css
.title {
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1.3;
}

.subtitle {
  margin-top: 12rpx;
  color: #667085;
  font-size: 28rpx;
}
```

Write `miniprogram/pages/home/home.js`:

```js
Page({
  data: {}
});
```

- [ ] **Step 4: Create bootstrap cloud function**

Write `cloudfunctions/bootstrap/package.json`:

```json
{
  "name": "bootstrap",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

Write `cloudfunctions/bootstrap/index.js`:

```js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const BUILTIN_CATEGORIES = [
  '银行理财',
  '定期存款',
  '基金',
  '债券',
  '券商理财',
  '货币基金',
  '羊毛',
  '活动奖励',
  '其他'
];

exports.main = async () => {
  const categories = db.collection('categories');
  let inserted = 0;

  for (let index = 0; index < BUILTIN_CATEGORIES.length; index += 1) {
    const name = BUILTIN_CATEGORIES[index];
    const existing = await categories.where({ name, type: 'builtin' }).limit(1).get();
    if (existing.data.length === 0) {
      await categories.add({
        data: {
          name,
          type: 'builtin',
          enabled: true,
          sortOrder: index + 1,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      inserted += 1;
    }
  }

  const settings = db.collection('settings');
  const currentSettings = await settings.limit(1).get();
  if (currentSettings.data.length === 0) {
    await settings.add({
      data: {
        dueSoonDays: 3,
        defaultYear: new Date().getFullYear(),
        subscriptionReminderEnabled: false,
        updatedAt: db.serverDate()
      }
    });
  }

  return {
    ok: true,
    categoriesInserted: inserted,
    settingsReady: true
  };
};
```

- [ ] **Step 5: Verify scaffold in WeChat Developer Tools**

Open `/Users/benzou/QA/yangmao` in WeChat Developer Tools, enable cloud development, create an environment, select that environment as the default cloud environment for the project, upload/deploy `bootstrap`, run it once, and verify these collections exist: `categories`, `settings`.

Expected: the home page renders and `categories` contains the built-in category `羊毛`.

- [ ] **Step 6: Commit**

Run:

```bash
git add project.config.json sitemap.json miniprogram cloudfunctions/bootstrap
git commit -m "chore: scaffold wechat cloud mini program"
```

Expected: commit succeeds if this directory has been initialized as a git repository.

---

### Task 2: Finance And Date Domain Utilities

**Files:**
- Create: `miniprogram/utils/date.js`
- Create: `miniprogram/utils/finance.js`
- Create: `miniprogram/__tests__/date.test.js`
- Create: `miniprogram/__tests__/finance.test.js`
- Create: `package.json`

**Interfaces:**
- Produces: `daysInclusive(startDate: string, endDate: string): number`.
- Produces: `getDateStatus(project: object, today: string, dueSoonDays: number): string`.
- Produces: `calcExpectedInterest(principal: number, annualRate: number, holdingDays: number): number`.
- Produces: `calcActualAnnualRate(actualTotalReturn: number, principal: number, holdingDays: number): number`.
- Produces: `summarizeCapital(totalAssets: number, projects: object[]): object`.

- [ ] **Step 1: Add test runner metadata**

Write `package.json`:

```json
{
  "name": "yangmao",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "jest",
    "test:unit": "jest miniprogram/__tests__ cloudfunctions/__tests__"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 2: Write failing date tests**

Write `miniprogram/__tests__/date.test.js`:

```js
const { daysInclusive, getDateStatus } = require('../utils/date');

describe('date utilities', () => {
  test('counts holding days inclusively', () => {
    expect(daysInclusive('2026-07-01', '2026-07-28')).toBe(28);
  });

  test('prioritizes redeemed and cancelled states before date states', () => {
    expect(getDateStatus({ manualStatus: 'redeemed', startDate: '2026-07-01', endDate: '2026-07-28' }, '2026-07-10', 3)).toBe('redeemed');
    expect(getDateStatus({ manualStatus: 'cancelled', startDate: '2026-07-01', endDate: '2026-07-28' }, '2026-07-10', 3)).toBe('cancelled');
  });

  test('returns due soon before active', () => {
    const project = { manualStatus: 'active', startDate: '2026-07-01', endDate: '2026-07-28' };
    expect(getDateStatus(project, '2026-07-26', 3)).toBe('due_soon');
  });

  test('returns overdue pending after end date', () => {
    const project = { manualStatus: 'active', startDate: '2026-07-01', endDate: '2026-07-28' };
    expect(getDateStatus(project, '2026-07-29', 3)).toBe('overdue_pending');
  });
});
```

- [ ] **Step 3: Write failing finance tests**

Write `miniprogram/__tests__/finance.test.js`:

```js
const {
  calcExpectedInterest,
  calcActualAnnualRate,
  calcActualTotalReturn,
  summarizeCapital
} = require('../utils/finance');

describe('finance utilities', () => {
  test('calculates expected interest from annual rate', () => {
    expect(calcExpectedInterest(10000, 0.03, 28)).toBeCloseTo(23.01, 2);
  });

  test('calculates actual total return with fixed reward', () => {
    expect(calcActualTotalReturn(23.01, 200)).toBeCloseTo(223.01, 2);
  });

  test('calculates actual annualized return', () => {
    expect(calcActualAnnualRate(223.01, 10000, 28)).toBeCloseTo(0.2907, 4);
  });

  test('summarizes current capital usage from active projects only', () => {
    const result = summarizeCapital(50000, [
      { principal: 10000, manualStatus: 'active' },
      { principal: 8000, manualStatus: 'redeemed' },
      { principal: 6000, manualStatus: 'cancelled' }
    ]);

    expect(result.investedAmount).toBe(10000);
    expect(result.idleAmount).toBe(40000);
    expect(result.utilizationRate).toBe(0.2);
  });
});
```

- [ ] **Step 4: Run tests and verify failure**

Run:

```bash
npm test -- miniprogram/__tests__/date.test.js miniprogram/__tests__/finance.test.js
```

Expected: FAIL because `miniprogram/utils/date.js` and `miniprogram/utils/finance.js` do not exist.

- [ ] **Step 5: Implement date utilities**

Write `miniprogram/utils/date.js`:

```js
function parseDate(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function daysInclusive(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / 86400000) + 1;
}

function daysUntil(endDate, today) {
  const end = parseDate(endDate);
  const current = parseDate(today);
  return Math.floor((end.getTime() - current.getTime()) / 86400000);
}

function getDateStatus(project, today, dueSoonDays) {
  if (project.manualStatus === 'cancelled') return 'cancelled';
  if (project.manualStatus === 'redeemed') return 'redeemed';

  if (today < project.startDate) return 'not_started';
  if (today > project.endDate) return 'overdue_pending';

  const remainingDays = daysUntil(project.endDate, today);
  if (remainingDays >= 0 && remainingDays < dueSoonDays) return 'due_soon';

  return 'active';
}

module.exports = {
  daysInclusive,
  getDateStatus
};
```

- [ ] **Step 6: Implement finance utilities**

Write `miniprogram/utils/finance.js`:

```js
function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function calcExpectedInterest(principal, annualRate, holdingDays) {
  return roundMoney(principal * annualRate * holdingDays / 365);
}

function calcActualTotalReturn(actualInterest, actualFixedReward) {
  return roundMoney((Number(actualInterest) || 0) + (Number(actualFixedReward) || 0));
}

function calcActualAnnualRate(actualTotalReturn, principal, holdingDays) {
  if (!principal || !holdingDays) return 0;
  return actualTotalReturn / principal / holdingDays * 365;
}

function summarizeCapital(totalAssets, projects) {
  const investedAmount = roundMoney(projects
    .filter((project) => project.manualStatus === 'active')
    .reduce((sum, project) => sum + Number(project.principal || 0), 0));

  const idleAmount = roundMoney((Number(totalAssets) || 0) - investedAmount);
  const utilizationRate = totalAssets > 0 ? investedAmount / totalAssets : 0;

  return {
    totalAssets: roundMoney(totalAssets),
    investedAmount,
    idleAmount,
    utilizationRate
  };
}

module.exports = {
  calcExpectedInterest,
  calcActualAnnualRate,
  calcActualTotalReturn,
  summarizeCapital
};
```

- [ ] **Step 7: Run tests and verify pass**

Run:

```bash
npm test -- miniprogram/__tests__/date.test.js miniprogram/__tests__/finance.test.js
```

Expected: PASS for all date and finance utility tests.

- [ ] **Step 8: Commit**

Run:

```bash
git add package.json miniprogram/utils miniprogram/__tests__
git commit -m "feat: add finance calculation utilities"
```

Expected: commit succeeds if this directory has been initialized as a git repository.

---

### Task 3: Cloud Login And Whitelist Permission Gate

**Files:**
- Create: `cloudfunctions/login/index.js`
- Create: `cloudfunctions/login/package.json`
- Create: `cloudfunctions/__tests__/permissions.test.js`
- Create: `miniprogram/services/cloud.js`
- Create: `miniprogram/services/session.js`
- Create: `miniprogram/pages/auth-denied/auth-denied.js`
- Create: `miniprogram/pages/auth-denied/auth-denied.json`
- Create: `miniprogram/pages/auth-denied/auth-denied.wxml`
- Create: `miniprogram/pages/auth-denied/auth-denied.wxss`
- Modify: `miniprogram/pages/home/home.js`

**Interfaces:**
- Produces: cloud function `login` output `{ openid: string, allowed: boolean, user: object | null }`.
- Produces: `callCloud(name: string, data?: object): Promise<object>`.
- Produces: `ensureAllowedSession(): Promise<object>`.

- [ ] **Step 1: Write permission helper test**

Write `cloudfunctions/__tests__/permissions.test.js`:

```js
function isAllowedUser(user) {
  return Boolean(user && user.enabled === true);
}

describe('permission helper behavior', () => {
  test('allows enabled whitelist user', () => {
    expect(isAllowedUser({ openid: 'o1', enabled: true })).toBe(true);
  });

  test('denies missing or disabled user', () => {
    expect(isAllowedUser(null)).toBe(false);
    expect(isAllowedUser({ openid: 'o1', enabled: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run permission test**

Run:

```bash
npm test -- cloudfunctions/__tests__/permissions.test.js
```

Expected: PASS. This locks the intended whitelist behavior before wiring it into cloud functions.

- [ ] **Step 3: Implement login cloud function**

Write `cloudfunctions/login/package.json`:

```json
{
  "name": "login",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

Write `cloudfunctions/login/index.js`:

```js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const result = await db.collection('users').where({ openid }).limit(1).get();
  const user = result.data[0] || null;
  const allowed = Boolean(user && user.enabled === true);

  return {
    openid,
    allowed,
    user
  };
};
```

- [ ] **Step 4: Implement cloud service wrapper**

Write `miniprogram/services/cloud.js`:

```js
function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then((response) => response.result);
}

module.exports = {
  callCloud
};
```

Write `miniprogram/services/session.js`:

```js
const { callCloud } = require('./cloud');

function ensureAllowedSession() {
  const app = getApp();

  if (app.globalData.session && app.globalData.session.allowed) {
    return Promise.resolve(app.globalData.session);
  }

  return callCloud('login').then((session) => {
    app.globalData.session = session;

    if (!session.allowed) {
      wx.reLaunch({ url: '/pages/auth-denied/auth-denied' });
      return Promise.reject(new Error('AUTH_DENIED'));
    }

    return session;
  });
}

module.exports = {
  ensureAllowedSession
};
```

- [ ] **Step 5: Create auth denied page**

Write `miniprogram/pages/auth-denied/auth-denied.json`:

```json
{
  "navigationBarTitleText": "无访问权限"
}
```

Write `miniprogram/pages/auth-denied/auth-denied.wxml`:

```xml
<view class="page denied">
  <view class="title">无访问权限</view>
  <view class="desc">当前微信账号不在家庭成员白名单中。</view>
</view>
```

Write `miniprogram/pages/auth-denied/auth-denied.wxss`:

```css
.denied {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  justify-content: center;
}

.title {
  font-size: 44rpx;
  font-weight: 700;
}

.desc {
  margin-top: 16rpx;
  color: #667085;
  font-size: 28rpx;
}
```

Write `miniprogram/pages/auth-denied/auth-denied.js`:

```js
Page({
  data: {}
});
```

- [ ] **Step 6: Gate home page behind whitelist**

Update `miniprogram/pages/home/home.js`:

```js
const { ensureAllowedSession } = require('../../services/session');

Page({
  data: {
    loading: true
  },

  onLoad() {
    ensureAllowedSession()
      .then(() => {
        this.setData({ loading: false });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  }
});
```

- [ ] **Step 7: Verify in WeChat Developer Tools**

Deploy `login`, add your two `openid` values to the `users` collection with `enabled: true`, then open the mini program.

Expected: whitelisted accounts can see the home page; a non-whitelisted account is redirected to `/pages/auth-denied/auth-denied`.

- [ ] **Step 8: Commit**

Run:

```bash
git add cloudfunctions/login cloudfunctions/__tests__ miniprogram/services miniprogram/pages/auth-denied miniprogram/pages/home/home.js
git commit -m "feat: add cloud whitelist login"
```

Expected: commit succeeds if this directory has been initialized as a git repository.

---

### Task 4: Family Assets Cloud Function And Dashboard Metrics

**Files:**
- Create: `cloudfunctions/assets/index.js`
- Create: `cloudfunctions/assets/package.json`
- Modify: `miniprogram/services/cloud.js`
- Modify: `miniprogram/pages/home/home.js`
- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/pages/home/home.wxss`
- Create: `miniprogram/components/metric-card/metric-card.js`
- Create: `miniprogram/components/metric-card/metric-card.json`
- Create: `miniprogram/components/metric-card/metric-card.wxml`
- Create: `miniprogram/components/metric-card/metric-card.wxss`

**Interfaces:**
- Produces: cloud function `assets` with actions `get` and `update`.
- Consumes: `summarizeCapital(totalAssets, projects)` from `miniprogram/utils/finance.js`.
- Produces: dashboard data `{ totalAssets, investedAmount, idleAmount, utilizationRate }`.

- [ ] **Step 1: Implement assets cloud function**

Write `cloudfunctions/assets/package.json`:

```json
{
  "name": "assets",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

Write `cloudfunctions/assets/index.js`:

```js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function requireAllowed(openid) {
  const result = await db.collection('users').where({ openid, enabled: true }).limit(1).get();
  if (result.data.length === 0) {
    throw new Error('AUTH_DENIED');
  }
}

async function getAssets() {
  const result = await db.collection('family_assets').limit(1).get();
  return result.data[0] || { totalAmount: 0 };
}

async function updateAssets(openid, totalAmount, reason) {
  if (Number(totalAmount) < 0) {
    throw new Error('TOTAL_AMOUNT_INVALID');
  }

  const current = await getAssets();
  const now = db.serverDate();

  if (current._id) {
    await db.collection('family_assets').doc(current._id).update({
      data: {
        totalAmount: Number(totalAmount),
        updatedByOpenid: openid,
        updatedAt: now
      }
    });
  } else {
    await db.collection('family_assets').add({
      data: {
        totalAmount: Number(totalAmount),
        updatedByOpenid: openid,
        updatedAt: now
      }
    });
  }

  await db.collection('asset_changes').add({
    data: {
      beforeAmount: Number(current.totalAmount || 0),
      afterAmount: Number(totalAmount),
      reason: reason || '调整家庭总资产',
      operatorOpenid: openid,
      createdAt: now
    }
  });

  return getAssets();
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  await requireAllowed(openid);

  if (event.action === 'get') {
    return { ok: true, asset: await getAssets() };
  }

  if (event.action === 'update') {
    const asset = await updateAssets(openid, event.totalAmount, event.reason);
    return { ok: true, asset };
  }

  throw new Error('UNKNOWN_ACTION');
};
```

- [ ] **Step 2: Add service wrappers**

Update `miniprogram/services/cloud.js`:

```js
function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then((response) => response.result);
}

function getAssets() {
  return callCloud('assets', { action: 'get' });
}

function updateAssets(totalAmount, reason) {
  return callCloud('assets', { action: 'update', totalAmount, reason });
}

module.exports = {
  callCloud,
  getAssets,
  updateAssets
};
```

- [ ] **Step 3: Create metric card component**

Write `miniprogram/components/metric-card/metric-card.json`:

```json
{
  "component": true
}
```

Write `miniprogram/components/metric-card/metric-card.js`:

```js
Component({
  properties: {
    label: String,
    value: String,
    hint: String
  }
});
```

Write `miniprogram/components/metric-card/metric-card.wxml`:

```xml
<view class="metric">
  <view class="label">{{label}}</view>
  <view class="value">{{value}}</view>
  <view wx:if="{{hint}}" class="hint">{{hint}}</view>
</view>
```

Write `miniprogram/components/metric-card/metric-card.wxss`:

```css
.metric {
  min-height: 148rpx;
  padding: 24rpx;
  border-radius: 8rpx;
  background: #ffffff;
  box-sizing: border-box;
}

.label {
  color: #667085;
  font-size: 24rpx;
}

.value {
  margin-top: 12rpx;
  color: #111827;
  font-size: 36rpx;
  font-weight: 700;
}

.hint {
  margin-top: 8rpx;
  color: #98a2b3;
  font-size: 22rpx;
}
```

- [ ] **Step 4: Render dashboard metrics**

Update `miniprogram/pages/home/home.json`:

```json
{
  "navigationBarTitleText": "家庭理财",
  "usingComponents": {
    "metric-card": "../../components/metric-card/metric-card"
  }
}
```

Update `miniprogram/pages/home/home.js`:

```js
const { ensureAllowedSession } = require('../../services/session');
const { getAssets } = require('../../services/cloud');
const { summarizeCapital } = require('../../utils/finance');

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

Page({
  data: {
    loading: true,
    metrics: {
      totalAssets: '¥0.00',
      investedAmount: '¥0.00',
      idleAmount: '¥0.00',
      utilizationRate: '0.0%'
    }
  },

  onLoad() {
    this.loadDashboard();
  },

  onShow() {
    if (!this.data.loading) {
      this.loadDashboard();
    }
  },

  loadDashboard() {
    ensureAllowedSession()
      .then(() => getAssets())
      .then(({ asset }) => {
        const summary = summarizeCapital(asset.totalAmount, []);
        this.setData({
          loading: false,
          metrics: {
            totalAssets: money(summary.totalAssets),
            investedAmount: money(summary.investedAmount),
            idleAmount: money(summary.idleAmount),
            utilizationRate: percent(summary.utilizationRate)
          }
        });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  }
});
```

Update `miniprogram/pages/home/home.wxml`:

```xml
<view class="page">
  <view class="header">
    <view>
      <view class="title">家庭理财</view>
      <view class="subtitle">当前资金状态与项目到期提醒</view>
    </view>
  </view>

  <view class="grid">
    <metric-card label="家庭总资产" value="{{metrics.totalAssets}}" />
    <metric-card label="当前理财金额" value="{{metrics.investedAmount}}" />
    <metric-card label="空闲资金" value="{{metrics.idleAmount}}" />
    <metric-card label="资金利用率" value="{{metrics.utilizationRate}}" />
  </view>
</view>
```

Update `miniprogram/pages/home/home.wxss`:

```css
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1.3;
}

.subtitle {
  margin-top: 12rpx;
  color: #667085;
  font-size: 28rpx;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 32rpx;
}
```

- [ ] **Step 5: Verify assets flow**

Deploy `assets`, call it from WeChat Developer Tools with `{ action: 'update', totalAmount: 50000, reason: '初始资产' }`, reload home page.

Expected: home page shows `家庭总资产 ¥50000.00`, `当前理财金额 ¥0.00`, `空闲资金 ¥50000.00`, `资金利用率 0.0%`; `asset_changes` contains one change record.

- [ ] **Step 6: Commit**

Run:

```bash
git add cloudfunctions/assets miniprogram/components/metric-card miniprogram/pages/home miniprogram/services/cloud.js
git commit -m "feat: add family assets dashboard"
```

Expected: commit succeeds if this directory has been initialized as a git repository.

---

### Task 5: Project CRUD, Redeem Flow, And Project List

**Files:**
- Create: `cloudfunctions/projects/index.js`
- Create: `cloudfunctions/projects/package.json`
- Create: `miniprogram/components/project-card/project-card.js`
- Create: `miniprogram/components/project-card/project-card.json`
- Create: `miniprogram/components/project-card/project-card.wxml`
- Create: `miniprogram/components/project-card/project-card.wxss`
- Create: `miniprogram/pages/projects/projects.js`
- Create: `miniprogram/pages/projects/projects.json`
- Create: `miniprogram/pages/projects/projects.wxml`
- Create: `miniprogram/pages/projects/projects.wxss`
- Create: `miniprogram/pages/project-form/project-form.js`
- Create: `miniprogram/pages/project-form/project-form.json`
- Create: `miniprogram/pages/project-form/project-form.wxml`
- Create: `miniprogram/pages/project-form/project-form.wxss`
- Modify: `miniprogram/services/cloud.js`

**Interfaces:**
- Produces: cloud function `projects` actions `list`, `listCategories`, `create`, `update`, `redeem`, `cancel`, `remove`.
- Produces: service methods `listProjects(filters)`, `listCategories()`, `createProject(project)`, `updateProject(id, project)`, `redeemProject(id, redeemData)`.
- Consumes: `daysInclusive`, `calcExpectedInterest`, `calcActualTotalReturn`, `calcActualAnnualRate`.

- [ ] **Step 1: Implement projects cloud function**

Write `cloudfunctions/projects/package.json`:

```json
{
  "name": "projects",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

Write `cloudfunctions/projects/index.js`:

```js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function requireAllowed(openid) {
  const result = await db.collection('users').where({ openid, enabled: true }).limit(1).get();
  if (result.data.length === 0) {
    throw new Error('AUTH_DENIED');
  }
}

function validateBaseProject(data) {
  if (!data.name) throw new Error('NAME_REQUIRED');
  if (!data.categoryId) throw new Error('CATEGORY_REQUIRED');
  if (!(Number(data.principal) > 0)) throw new Error('PRINCIPAL_INVALID');
  if (!data.startDate || !data.endDate) throw new Error('DATE_REQUIRED');
  if (data.endDate < data.startDate) throw new Error('END_DATE_INVALID');
}

async function listProjects(event) {
  const query = {};
  if (event.manualStatus) query.manualStatus = event.manualStatus;
  if (event.categoryId) query.categoryId = event.categoryId;
  if (event.registrantOpenid) query.registrantOpenid = event.registrantOpenid;

  const result = await db.collection('projects').where(query).orderBy('endDate', 'asc').get();
  return result.data;
}

async function listCategories() {
  const result = await db.collection('categories')
    .where({ enabled: true })
    .orderBy('sortOrder', 'asc')
    .get();
  return result.data;
}

async function createProject(openid, data) {
  validateBaseProject(data);
  const now = db.serverDate();
  const payload = {
    name: data.name,
    categoryId: data.categoryId,
    principal: Number(data.principal),
    startDate: data.startDate,
    endDate: data.endDate,
    registrantOpenid: data.registrantOpenid || openid,
    expectedAnnualRate: Number(data.expectedAnnualRate || 0),
    expectedInterest: Number(data.expectedInterest || 0),
    fixedReward: Number(data.fixedReward || 0),
    actualInterest: 0,
    actualFixedReward: 0,
    redeemDate: '',
    manualStatus: 'active',
    remark: data.remark || '',
    createdAt: now,
    updatedAt: now
  };

  const result = await db.collection('projects').add({ data: payload });
  return { _id: result._id, ...payload };
}

async function updateProject(id, data) {
  validateBaseProject(data);
  const payload = {
    name: data.name,
    categoryId: data.categoryId,
    principal: Number(data.principal),
    startDate: data.startDate,
    endDate: data.endDate,
    registrantOpenid: data.registrantOpenid,
    expectedAnnualRate: Number(data.expectedAnnualRate || 0),
    expectedInterest: Number(data.expectedInterest || 0),
    fixedReward: Number(data.fixedReward || 0),
    remark: data.remark || '',
    updatedAt: db.serverDate()
  };

  await db.collection('projects').doc(id).update({ data: payload });
  return { _id: id, ...payload };
}

async function redeemProject(id, data) {
  if (!data.redeemDate) throw new Error('REDEEM_DATE_REQUIRED');
  if (data.redeemDate < data.startDate) throw new Error('REDEEM_DATE_INVALID');

  const payload = {
    actualInterest: Number(data.actualInterest || 0),
    actualFixedReward: Number(data.actualFixedReward || 0),
    redeemDate: data.redeemDate,
    manualStatus: 'redeemed',
    updatedAt: db.serverDate()
  };

  await db.collection('projects').doc(id).update({ data: payload });
  return { _id: id, ...payload };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  await requireAllowed(openid);

  if (event.action === 'list') return { ok: true, projects: await listProjects(event) };
  if (event.action === 'listCategories') return { ok: true, categories: await listCategories() };
  if (event.action === 'create') return { ok: true, project: await createProject(openid, event.project) };
  if (event.action === 'update') return { ok: true, project: await updateProject(event.id, event.project) };
  if (event.action === 'redeem') return { ok: true, project: await redeemProject(event.id, event.redeemData) };
  if (event.action === 'cancel') {
    await db.collection('projects').doc(event.id).update({ data: { manualStatus: 'cancelled', updatedAt: db.serverDate() } });
    return { ok: true };
  }
  if (event.action === 'remove') {
    await db.collection('projects').doc(event.id).remove();
    return { ok: true };
  }

  throw new Error('UNKNOWN_ACTION');
};
```

- [ ] **Step 2: Add project service wrappers**

Update `miniprogram/services/cloud.js` to include:

```js
function callCloud(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then((response) => response.result);
}

function getAssets() {
  return callCloud('assets', { action: 'get' });
}

function updateAssets(totalAmount, reason) {
  return callCloud('assets', { action: 'update', totalAmount, reason });
}

function listProjects(filters = {}) {
  return callCloud('projects', { action: 'list', ...filters });
}

function listCategories() {
  return callCloud('projects', { action: 'listCategories' });
}

function createProject(project) {
  return callCloud('projects', { action: 'create', project });
}

function updateProject(id, project) {
  return callCloud('projects', { action: 'update', id, project });
}

function redeemProject(id, redeemData) {
  return callCloud('projects', { action: 'redeem', id, redeemData });
}

module.exports = {
  callCloud,
  getAssets,
  updateAssets,
  listProjects,
  listCategories,
  createProject,
  updateProject,
  redeemProject
};
```

- [ ] **Step 3: Create project list and card**

Write `miniprogram/components/project-card/project-card.json`:

```json
{
  "component": true
}
```

Write `miniprogram/components/project-card/project-card.js`:

```js
Component({
  properties: {
    project: Object
  },
  methods: {
    onTap() {
      this.triggerEvent('open', { id: this.properties.project._id });
    }
  }
});
```

Write `miniprogram/components/project-card/project-card.wxml`:

```xml
<view class="card" bindtap="onTap">
  <view class="top">
    <view class="name">{{project.name}}</view>
    <view class="status">{{project.displayStatus}}</view>
  </view>
  <view class="row">
    <text>本金 {{project.principalText}}</text>
    <text>{{project.dateRange}}</text>
  </view>
  <view class="row">
    <text>预期 {{project.expectedTotalText}}</text>
    <text>实际年化 {{project.actualAnnualRateText}}</text>
  </view>
</view>
```

Write `miniprogram/components/project-card/project-card.wxss`:

```css
.card {
  padding: 24rpx;
  border-radius: 8rpx;
  background: #ffffff;
}

.top,
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.name {
  font-size: 30rpx;
  font-weight: 700;
}

.status {
  color: #0f766e;
  font-size: 24rpx;
}

.row {
  margin-top: 14rpx;
  color: #667085;
  font-size: 24rpx;
}
```

Write `miniprogram/pages/projects/projects.json`:

```json
{
  "navigationBarTitleText": "理财项目",
  "usingComponents": {
    "project-card": "../../components/project-card/project-card"
  }
}
```

Write `miniprogram/pages/projects/projects.wxml`:

```xml
<view class="page">
  <button class="primary" bindtap="goCreate">新增项目</button>
  <view class="list">
    <project-card wx:for="{{projects}}" wx:key="_id" project="{{item}}" bind:open="openProject" />
  </view>
</view>
```

Write `miniprogram/pages/projects/projects.wxss`:

```css
.primary {
  height: 88rpx;
  border-radius: 8rpx;
  background: #0f766e;
  color: #ffffff;
  font-size: 30rpx;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 24rpx;
}
```

Write `miniprogram/pages/projects/projects.js`:

```js
const { ensureAllowedSession } = require('../../services/session');
const { listProjects } = require('../../services/cloud');
const { daysInclusive } = require('../../utils/date');
const { calcActualTotalReturn, calcActualAnnualRate } = require('../../utils/finance');

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function mapProject(project) {
  const holdingDays = project.redeemDate ? daysInclusive(project.startDate, project.redeemDate) : 0;
  const actualTotal = calcActualTotalReturn(project.actualInterest, project.actualFixedReward);
  return {
    ...project,
    principalText: money(project.principal),
    dateRange: `${project.startDate} 至 ${project.endDate}`,
    expectedTotalText: money(Number(project.expectedInterest || 0) + Number(project.fixedReward || 0)),
    actualAnnualRateText: holdingDays ? `${(calcActualAnnualRate(actualTotal, project.principal, holdingDays) * 100).toFixed(2)}%` : '-',
    displayStatus: project.manualStatus === 'redeemed' ? '已到账' : project.manualStatus === 'cancelled' ? '已取消' : '未到账'
  };
}

Page({
  data: {
    projects: []
  },

  onShow() {
    ensureAllowedSession()
      .then(() => listProjects())
      .then(({ projects }) => {
        this.setData({ projects: projects.map(mapProject) });
      });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/project-form/project-form' });
  },

  openProject(event) {
    wx.navigateTo({ url: `/pages/project-form/project-form?id=${event.detail.id}` });
  }
});
```

- [ ] **Step 4: Create project form first version**

Write `miniprogram/pages/project-form/project-form.json`:

```json
{
  "navigationBarTitleText": "理财项目"
}
```

Write `miniprogram/pages/project-form/project-form.wxml`:

```xml
<view class="page">
  <input class="field" placeholder="项目名称" value="{{form.name}}" data-field="name" bindinput="onInput" />
  <picker mode="selector" range="{{categories}}" range-key="name" bindchange="onCategoryChange">
    <view class="field">{{selectedCategoryName || '选择品类'}}</view>
  </picker>
  <input class="field" type="digit" placeholder="本金" value="{{form.principal}}" data-field="principal" bindinput="onInput" />
  <input class="field" placeholder="开始日期 YYYY-MM-DD" value="{{form.startDate}}" data-field="startDate" bindinput="onInput" />
  <input class="field" placeholder="结束日期 YYYY-MM-DD" value="{{form.endDate}}" data-field="endDate" bindinput="onInput" />
  <input class="field" type="digit" placeholder="预期年化，如 0.03" value="{{form.expectedAnnualRate}}" data-field="expectedAnnualRate" bindinput="onInput" />
  <input class="field" type="digit" placeholder="固定奖励" value="{{form.fixedReward}}" data-field="fixedReward" bindinput="onInput" />
  <textarea class="textarea" placeholder="备注" value="{{form.remark}}" data-field="remark" bindinput="onInput" />
  <button class="primary" bindtap="save">保存</button>
</view>
```

Write `miniprogram/pages/project-form/project-form.wxss`:

```css
.field,
.textarea {
  width: 100%;
  margin-bottom: 16rpx;
  padding: 20rpx;
  border-radius: 8rpx;
  background: #ffffff;
  box-sizing: border-box;
  font-size: 28rpx;
}

.textarea {
  min-height: 160rpx;
}

.primary {
  height: 88rpx;
  border-radius: 8rpx;
  background: #0f766e;
  color: #ffffff;
  font-size: 30rpx;
}
```

Write `miniprogram/pages/project-form/project-form.js`:

```js
const { ensureAllowedSession } = require('../../services/session');
const { createProject, listCategories } = require('../../services/cloud');
const { daysInclusive } = require('../../utils/date');
const { calcExpectedInterest } = require('../../utils/finance');

Page({
  data: {
    categories: [],
    selectedCategoryName: '',
    form: {
      name: '',
      categoryId: '',
      principal: '',
      startDate: '',
      endDate: '',
      expectedAnnualRate: '',
      fixedReward: '',
      remark: ''
    }
  },

  onLoad() {
    ensureAllowedSession().then(() => {
      listCategories().then(({ categories }) => {
        this.setData({ categories });
      });
    });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onCategoryChange(event) {
    const category = this.data.categories[Number(event.detail.value)];
    this.setData({
      selectedCategoryName: category.name,
      'form.categoryId': category._id
    });
  },

  save() {
    const form = this.data.form;
    const principal = Number(form.principal);
    const expectedAnnualRate = Number(form.expectedAnnualRate || 0);
    const holdingDays = daysInclusive(form.startDate, form.endDate);
    const expectedInterest = calcExpectedInterest(principal, expectedAnnualRate, holdingDays);

    createProject({
      ...form,
      principal,
      expectedAnnualRate,
      fixedReward: Number(form.fixedReward || 0),
      expectedInterest
    }).then(() => {
      wx.navigateBack();
    });
  }
});
```

- [ ] **Step 5: Verify project creation**

Deploy `projects`, create one category through `bootstrap`, then use the project form to create a 28-day project with `principal = 10000`, `expectedAnnualRate = 0.03`, `fixedReward = 200`.

Expected: `projects` collection stores `expectedInterest` around `23.01`, `fixedReward` as `200`, and list page shows the created project.

- [ ] **Step 6: Commit**

Run:

```bash
git add cloudfunctions/projects miniprogram/components/project-card miniprogram/pages/projects miniprogram/pages/project-form miniprogram/services/cloud.js
git commit -m "feat: add finance project records"
```

Expected: commit succeeds if this directory has been initialized as a git repository.

---

### Task 6: Dashboard Active Capital And Due Reminders

**Files:**
- Modify: `miniprogram/pages/home/home.js`
- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/pages/home/home.wxss`

**Interfaces:**
- Consumes: `getAssets()`, `listProjects()`.
- Consumes: `summarizeCapital(totalAssets, projects)`.
- Consumes: `getDateStatus(project, today, dueSoonDays)`.
- Produces: home sections `dueSoonProjects` and `overdueProjects`.

- [ ] **Step 1: Update home page data loading**

Update `miniprogram/pages/home/home.js`:

```js
const { ensureAllowedSession } = require('../../services/session');
const { getAssets, listProjects } = require('../../services/cloud');
const { summarizeCapital } = require('../../utils/finance');
const { getDateStatus } = require('../../utils/date');

function todayText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

Page({
  data: {
    loading: true,
    metrics: {
      totalAssets: '¥0.00',
      investedAmount: '¥0.00',
      idleAmount: '¥0.00',
      utilizationRate: '0.0%'
    },
    dueSoonProjects: [],
    overdueProjects: []
  },

  onLoad() {
    this.loadDashboard();
  },

  onShow() {
    if (!this.data.loading) {
      this.loadDashboard();
    }
  },

  loadDashboard() {
    ensureAllowedSession()
      .then(() => Promise.all([getAssets(), listProjects()]))
      .then(([assetResult, projectResult]) => {
        const projects = projectResult.projects || [];
        const summary = summarizeCapital(assetResult.asset.totalAmount, projects);
        const today = todayText();
        const decorated = projects.map((project) => ({
          ...project,
          displayAmount: money(project.principal),
          dateStatus: getDateStatus(project, today, 3)
        }));

        this.setData({
          loading: false,
          metrics: {
            totalAssets: money(summary.totalAssets),
            investedAmount: money(summary.investedAmount),
            idleAmount: money(summary.idleAmount),
            utilizationRate: percent(summary.utilizationRate)
          },
          dueSoonProjects: decorated.filter((project) => project.dateStatus === 'due_soon'),
          overdueProjects: decorated.filter((project) => project.dateStatus === 'overdue_pending')
        });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  }
});
```

- [ ] **Step 2: Render due reminder sections**

Update `miniprogram/pages/home/home.wxml`:

```xml
<view class="page">
  <view class="header">
    <view>
      <view class="title">家庭理财</view>
      <view class="subtitle">当前资金状态与项目到期提醒</view>
    </view>
  </view>

  <view class="grid">
    <metric-card label="家庭总资产" value="{{metrics.totalAssets}}" />
    <metric-card label="当前理财金额" value="{{metrics.investedAmount}}" />
    <metric-card label="空闲资金" value="{{metrics.idleAmount}}" />
    <metric-card label="资金利用率" value="{{metrics.utilizationRate}}" />
  </view>

  <view class="section">
    <view class="section-title">已到期待确认</view>
    <view wx:if="{{overdueProjects.length === 0}}" class="empty">暂无需要确认的项目</view>
    <view wx:for="{{overdueProjects}}" wx:key="_id" class="reminder">
      <text>{{item.name}}</text>
      <text>{{item.displayAmount}}</text>
    </view>
  </view>

  <view class="section">
    <view class="section-title">即将到期</view>
    <view wx:if="{{dueSoonProjects.length === 0}}" class="empty">暂无即将到期项目</view>
    <view wx:for="{{dueSoonProjects}}" wx:key="_id" class="reminder">
      <text>{{item.name}}</text>
      <text>{{item.endDate}}</text>
    </view>
  </view>
</view>
```

Update `miniprogram/pages/home/home.wxss` by appending:

```css
.section {
  margin-top: 32rpx;
}

.section-title {
  margin-bottom: 16rpx;
  font-size: 30rpx;
  font-weight: 700;
}

.empty,
.reminder {
  padding: 24rpx;
  border-radius: 8rpx;
  background: #ffffff;
}

.empty {
  color: #98a2b3;
  font-size: 26rpx;
}

.reminder {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12rpx;
  color: #344054;
  font-size: 26rpx;
}
```

- [ ] **Step 3: Verify dashboard calculations**

Create two active projects totaling `30000` and set family total assets to `50000`.

Expected: home page shows current finance amount `¥30000.00`, idle funds `¥20000.00`, utilization `60.0%`. Projects ending within 3 days appear under `即将到期`; projects past end date and not redeemed appear under `已到期待确认`.

- [ ] **Step 4: Commit**

Run:

```bash
git add miniprogram/pages/home
git commit -m "feat: show capital usage and due reminders"
```

Expected: commit succeeds if this directory has been initialized as a git repository.

---

### Task 7: Annual Statistics Page

**Files:**
- Create: `cloudfunctions/stats/index.js`
- Create: `cloudfunctions/stats/package.json`
- Create: `miniprogram/pages/stats/stats.js`
- Create: `miniprogram/pages/stats/stats.json`
- Create: `miniprogram/pages/stats/stats.wxml`
- Create: `miniprogram/pages/stats/stats.wxss`
- Modify: `miniprogram/services/cloud.js`

**Interfaces:**
- Produces: cloud function `stats` action `annual`.
- Produces: service method `getAnnualStats(year: number): Promise<object>`.
- Consumes: redeemed projects with `redeemDate`, `principal`, `actualInterest`, `actualFixedReward`, `startDate`.

- [ ] **Step 1: Implement stats cloud function**

Write `cloudfunctions/stats/package.json`:

```json
{
  "name": "stats",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

Write `cloudfunctions/stats/index.js`:

```js
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function daysInclusive(startDate, endDate) {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function actualTotal(project) {
  return Number(project.actualInterest || 0) + Number(project.actualFixedReward || 0);
}

async function requireAllowed(openid) {
  const result = await db.collection('users').where({ openid, enabled: true }).limit(1).get();
  if (result.data.length === 0) {
    throw new Error('AUTH_DENIED');
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  await requireAllowed(wxContext.OPENID);

  const year = Number(event.year);
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const result = await db.collection('projects')
    .where({
      manualStatus: 'redeemed',
      redeemDate: db.command.gte(start).and(db.command.lte(end))
    })
    .get();

  const monthly = {};
  const byRegistrant = {};
  let totalReturn = 0;
  let totalFixedReward = 0;
  let weightedPrincipalDays = 0;

  result.data.forEach((project) => {
    const month = project.redeemDate.slice(0, 7);
    const projectReturn = actualTotal(project);
    const holdingDays = daysInclusive(project.startDate, project.redeemDate);

    monthly[month] = (monthly[month] || 0) + projectReturn;
    byRegistrant[project.registrantOpenid] = byRegistrant[project.registrantOpenid] || {
      registrantOpenid: project.registrantOpenid,
      projectCount: 0,
      principal: 0,
      actualTotalReturn: 0
    };
    byRegistrant[project.registrantOpenid].projectCount += 1;
    byRegistrant[project.registrantOpenid].principal += Number(project.principal || 0);
    byRegistrant[project.registrantOpenid].actualTotalReturn += projectReturn;

    totalReturn += projectReturn;
    totalFixedReward += Number(project.actualFixedReward || 0);
    weightedPrincipalDays += Number(project.principal || 0) * holdingDays;
  });

  return {
    ok: true,
    stats: {
      year,
      totalReturn,
      annualizedRate: weightedPrincipalDays > 0 ? totalReturn / weightedPrincipalDays * 365 : 0,
      fixedRewardShare: totalReturn > 0 ? totalFixedReward / totalReturn : 0,
      monthly: Object.keys(monthly).sort().map((month) => ({ month, amount: monthly[month] })),
      byRegistrant: Object.keys(byRegistrant).map((openid) => byRegistrant[openid])
    }
  };
};
```

- [ ] **Step 2: Add stats service wrapper**

Update `miniprogram/services/cloud.js` to export:

```js
function getAnnualStats(year) {
  return callCloud('stats', { action: 'annual', year });
}
```

Ensure `module.exports` includes `getAnnualStats` with the previous exports.

- [ ] **Step 3: Create stats page**

Write `miniprogram/pages/stats/stats.json`:

```json
{
  "navigationBarTitleText": "收益统计",
  "usingComponents": {
    "metric-card": "../../components/metric-card/metric-card"
  }
}
```

Write `miniprogram/pages/stats/stats.js`:

```js
const { ensureAllowedSession } = require('../../services/session');
const { getAnnualStats } = require('../../services/cloud');

function money(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

Page({
  data: {
    year: new Date().getFullYear(),
    totalReturn: '¥0.00',
    annualizedRate: '0.00%',
    fixedRewardShare: '0.00%',
    monthly: [],
    byRegistrant: []
  },

  onLoad() {
    ensureAllowedSession().then(() => this.loadStats());
  },

  loadStats() {
    getAnnualStats(this.data.year).then(({ stats }) => {
      this.setData({
        totalReturn: money(stats.totalReturn),
        annualizedRate: percent(stats.annualizedRate),
        fixedRewardShare: percent(stats.fixedRewardShare),
        monthly: stats.monthly.map((item) => ({ ...item, amountText: money(item.amount) })),
        byRegistrant: stats.byRegistrant.map((item) => ({ ...item, actualTotalReturnText: money(item.actualTotalReturn) }))
      });
    });
  }
});
```

Write `miniprogram/pages/stats/stats.wxml`:

```xml
<view class="page">
  <view class="year">{{year}}</view>
  <view class="grid">
    <metric-card label="年度总收益" value="{{totalReturn}}" />
    <metric-card label="年度实际年化" value="{{annualizedRate}}" />
    <metric-card label="固定奖励占比" value="{{fixedRewardShare}}" />
  </view>

  <view class="section">
    <view class="section-title">月度收益</view>
    <view wx:for="{{monthly}}" wx:key="month" class="row">
      <text>{{item.month}}</text>
      <text>{{item.amountText}}</text>
    </view>
  </view>

  <view class="section">
    <view class="section-title">登记人汇总</view>
    <view wx:for="{{byRegistrant}}" wx:key="registrantOpenid" class="row">
      <text>{{item.registrantOpenid}}</text>
      <text>{{item.actualTotalReturnText}}</text>
    </view>
  </view>
</view>
```

Write `miniprogram/pages/stats/stats.wxss`:

```css
.year {
  font-size: 40rpx;
  font-weight: 700;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 24rpx;
}

.section {
  margin-top: 32rpx;
}

.section-title {
  margin-bottom: 16rpx;
  font-size: 30rpx;
  font-weight: 700;
}

.row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12rpx;
  padding: 24rpx;
  border-radius: 8rpx;
  background: #ffffff;
  color: #344054;
  font-size: 26rpx;
}
```

- [ ] **Step 4: Verify annual stats**

Deploy `stats`, mark one project redeemed in `2026` with `principal = 10000`, `startDate = 2026-07-01`, `redeemDate = 2026-07-28`, `actualInterest = 23.01`, `actualFixedReward = 200`.

Expected: stats page shows annual total return `¥223.01`, annualized rate about `29.07%`, fixed reward share about `89.68%`.

- [ ] **Step 5: Commit**

Run:

```bash
git add cloudfunctions/stats miniprogram/pages/stats miniprogram/services/cloud.js
git commit -m "feat: add annual finance statistics"
```

Expected: commit succeeds if this directory has been initialized as a git repository.

---

### Task 8: Polish Validation, Category Empty State, And Manual QA

**Files:**
- Modify: `miniprogram/pages/project-form/project-form.js`
- Modify: `miniprogram/pages/project-form/project-form.wxml`
- Modify: `miniprogram/pages/project-form/project-form.wxss`
- Modify: `miniprogram/pages/projects/projects.js`
- Modify: `miniprogram/pages/home/home.js`
- Create: `docs/qa/first-version-checklist.md`

**Interfaces:**
- Consumes: `categories` collection populated by `bootstrap` and loaded by `listCategories()`.
- Produces: form validation messages for invalid principal/date/redeem data.
- Produces: manual QA checklist in `docs/qa/first-version-checklist.md`.

- [ ] **Step 1: Add category empty state for the picker**

Update the category picker section in `miniprogram/pages/project-form/project-form.wxml`:

```xml
<view wx:if="{{categories.length > 0}}">
  <picker mode="selector" range="{{categories}}" range-key="name" bindchange="onCategoryChange">
    <view class="field">{{selectedCategoryName || '选择品类'}}</view>
  </picker>
</view>
<view wx:else class="empty-field">请先部署并运行 bootstrap 云函数初始化品类</view>
```

Append to `miniprogram/pages/project-form/project-form.wxss`:

```css
.empty-field {
  margin-bottom: 16rpx;
  padding: 24rpx;
  border-radius: 8rpx;
  background: #ffffff;
  color: #8e8e93;
  box-sizing: border-box;
  font-size: 26rpx;
}
```

- [ ] **Step 2: Add explicit form validation**

Add this function to `miniprogram/pages/project-form/project-form.js`:

```js
function validateForm(form) {
  if (!form.name) return '请填写项目名称';
  if (!form.categoryId) return '请选择品类';
  if (!(Number(form.principal) > 0)) return '本金必须大于 0';
  if (!form.startDate || !form.endDate) return '请填写开始日期和结束日期';
  if (form.endDate < form.startDate) return '结束日期不能早于开始日期';
  return '';
}
```

Update `save()` to call it:

```js
save() {
  const form = this.data.form;
  const error = validateForm(form);
  if (error) {
    wx.showToast({ title: error, icon: 'none' });
    return;
  }

  const principal = Number(form.principal);
  const expectedAnnualRate = Number(form.expectedAnnualRate || 0);
  const holdingDays = daysInclusive(form.startDate, form.endDate);
  const expectedInterest = calcExpectedInterest(principal, expectedAnnualRate, holdingDays);

  createProject({
    ...form,
    principal,
    expectedAnnualRate,
    fixedReward: Number(form.fixedReward || 0),
    expectedInterest
  }).then(() => {
    wx.navigateBack();
  });
}
```

- [ ] **Step 3: Add manual QA checklist**

Write `docs/qa/first-version-checklist.md`:

```markdown

# 第一版手工验收

- [ ] 使用微信开发者工具打开项目，确认云开发环境 ID 已配置。
- [ ] 部署 `bootstrap` 云函数并确认 `categories` 中包含“羊毛”。
- [ ] 部署 `login`、`assets`、`projects`、`stats` 云函数。
- [ ] 在 `users` 集合中加入两位家庭成员的 `openid`，并设置 `enabled: true`。
- [ ] 设置家庭总资产为 `50000`，首页显示空闲资金 `50000`。
- [ ] 新增 28 天、3% 年化、固定奖励 200、本金 10000 的理财项目。
- [ ] 首页当前理财金额增加 `10000`，资金利用率显示 `20.0%`。
- [ ] 项目到期前 3 天内出现在“即将到期”区域。
- [ ] 项目过期未确认时出现在“已到期待确认”区域。
- [ ] 确认到账后填写实际利息 `23.01`、实际固定奖励 `200`。
- [ ] 首页当前理财金额减少 `10000`，统计页年度总收益显示 `223.01`。
- [ ] 非白名单微信账号打开小程序时进入“无访问权限”页面。
```

- [ ] **Step 4: Run unit tests**

Run:

```bash
npm test
```

Expected: all Jest tests pass.

- [ ] **Step 5: Run WeChat manual QA**

Run the checklist in `docs/qa/first-version-checklist.md` in WeChat Developer Tools with the configured cloud environment.

Expected: every first-version manual acceptance item is checked.

- [ ] **Step 6: Commit**

Run:

```bash
git add miniprogram/pages/project-form miniprogram/pages/projects miniprogram/pages/home docs/qa/first-version-checklist.md
git commit -m "feat: polish project form validation"
```

Expected: commit succeeds if this directory has been initialized as a git repository.
