# WeUI Style Guide

## Direction

The mini program should feel like a native WeChat utility. Use Tencent WeUI wxss as the default visual system so layout, controls, cells, buttons, forms, panels, empty states, and messages match familiar WeChat interaction patterns.

## Source

- Primary style library: `weui-wxss`.
- Imported stylesheet: `miniprogram/styles/weui.wxss`, copied from `weui-wxss/dist-rpx-mode/style/weui.wxss`.
- Local styles may supplement WeUI only for finance-specific layout, metric emphasis, and status colors.

## Structure

- Prefer `weui-panel` for grouped page sections.
- Prefer `weui-cells` and `weui-cell` for rows, filters, records, reminders, and form fields.
- Prefer `weui-form` and `weui-form__control-area` for data-entry pages.
- Prefer `weui-btn`, `weui-btn_primary`, `weui-btn_default`, and `weui-btn_warn` for actions.
- Prefer `weui-msg` for access denied and page-level empty/error messages.

## Page Rules

- Use `page` as the outer page wrapper and let WeUI own the background and typography.
- Do not create custom card systems when a WeUI panel or cells group can express the same content.
- Keep WXML expressions simple; compute dynamic text and selected classes in page JavaScript.
- Keep metrics compact and scannable; large numbers are allowed only for dashboard/stat summary values.
- Avoid decorative gradients, decorative illustrations, and marketing-style hero sections.

## Finance Patterns

- Dashboard metrics use WeUI panels with concise labels and numeric values.
- Asset adjustment uses WeUI form/cell rows and WeUI buttons.
- Project rows use WeUI panel/cell structures with right-aligned secondary values.
- Destructive actions use `weui-btn_warn` or warn-colored text actions.
- Empty states use one sentence and one relevant action when applicable.

## Status Labels

- `active`: brand blue, text `进行中`.
- `due_soon`: warning orange, text `即将到期`.
- `overdue_pending`: red, text `待确认`.
- `redeemed`: green, text `已到账`.
- `cancelled`: muted gray, text `已取消`.
