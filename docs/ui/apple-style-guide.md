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
