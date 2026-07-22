# Dashboard Active Capital And Due Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show active invested capital, idle capital, utilization, and projects requiring due-date attention on the home dashboard.

**Architecture:** The home page loads the asset singleton and project list in parallel after session authorization. It passes the returned projects into `summarizeCapital`, decorates each project with display data and `getDateStatus`, then retains the `due_soon` and `overdue_pending` groups in page state for rendering.

**Tech Stack:** WeChat Mini Program `Page`, CommonJS services and utilities, WXML/WXSS, Jest.

## Global Constraints

- Modify only `miniprogram/pages/home/home.js`, `miniprogram/pages/home/home.wxml`, and `miniprogram/pages/home/home.wxss` for Task 6 runtime behavior.
- Use existing `getAssets`, `listProjects`, `summarizeCapital`, and `getDateStatus` interfaces.
- Preserve the untracked `miniprogram/pages/stats` Task 7 placeholder.
- Use the Apple-inspired shared design tokens instead of legacy hard-coded green or gray values.

---

### Task 1: Dashboard Data And Reminder Rendering

**Files:**
- Create: `miniprogram/__tests__/home.test.js`
- Modify: `miniprogram/pages/home/home.js`
- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/pages/home/home.wxss`

**Interfaces:**
- Consumes: `getAssets(): Promise<{ asset: { totalAmount: number } }>`.
- Consumes: `listProjects(): Promise<{ projects: Array<{ _id: string, name: string, principal: number, startDate: string, endDate: string, manualStatus: string }> }>`.
- Consumes: `summarizeCapital(totalAssets, projects)` and `getDateStatus(project, today, 3)`.
- Produces: `metrics`, `dueSoonProjects`, and `overdueProjects` dashboard state.

- [ ] **Step 1: Write the failing page test**

    test('loads active capital and separates due reminder projects', async () => {
      const page = createHomePage();
      await page.loadDashboard();

      expect(page.data.metrics).toEqual({
        totalAssets: '¥50000.00',
        investedAmount: '¥30000.00',
        idleAmount: '¥20000.00',
        utilizationRate: '60.0%'
      });
      expect(page.data.dueSoonProjects.map((project) => project._id)).toEqual(['due']);
      expect(page.data.overdueProjects.map((project) => project._id)).toEqual(['overdue']);
    });

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx jest miniprogram/__tests__/home.test.js --runInBand`

Expected: FAIL because the current page does not request `listProjects` or set reminder arrays.

- [ ] **Step 3: Implement the minimal dashboard data flow**

    const { getAssets, listProjects } = require('../../services/cloud');
    const { getDateStatus } = require('../../utils/date');

    Promise.all([getAssets(), listProjects()])
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
          metrics: formatMetrics(summary),
          dueSoonProjects: decorated.filter((project) => project.dateStatus === 'due_soon'),
          overdueProjects: decorated.filter((project) => project.dateStatus === 'overdue_pending')
        });
      });

- [ ] **Step 4: Render grouped reminder sections with shared tokens**

    <view class="section">
      <view class="section-title">已到期待确认</view>
      <view wx:if="{{overdueProjects.length === 0}}" class="empty">暂无需要确认的项目</view>
      <view wx:for="{{overdueProjects}}" wx:key="_id" class="reminder">
        <text>{{item.name}}</text>
        <text>{{item.displayAmount}}</text>
      </view>
    </view>

Style `.empty` and `.reminder` with `var(--color-grouped-background)`, `var(--color-secondary-text)`, and `var(--color-primary-text)`.

- [ ] **Step 5: Run focused and unit tests**

Run: `npm run test:unit -- --runInBand`

Expected: PASS, including finance/date helper coverage and the dashboard data-flow test.

- [ ] **Step 6: Commit**

    git add miniprogram/pages/home miniprogram/__tests__/home.test.js docs/superpowers/plans/2026-07-22-dashboard-active-capital-reminders.md
    git commit -m "feat: show capital usage and due reminders"
