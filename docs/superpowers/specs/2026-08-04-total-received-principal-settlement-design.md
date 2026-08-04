# Total Received Principal Settlement Design

## Goal

When confirming project principal settlement, the user enters the total amount received, including principal and interest. The app derives actual interest from the stored project principal before submitting existing cloud actions.

## Scope

- Change the project settlement form copy from direct interest entry to total received amount entry.
- Keep the cloud function API and persisted project fields unchanged.
- Compute `actualInterest = totalReceivedAmount - principal` in the miniprogram page before calling `redeemPrincipalProject`, `redeemProject`, or `correctRedemption`.
- When loading existing project records, display `principal + actualInterest` in the principal settlement input so correction uses the same total-received workflow.

## Architecture

The form owns this transformation because it is a presentation/input semantics change. Cloud actions already accept `actualInterest`, and statistics already depend on that field, so no backend or stats change is needed.

The page state uses `principalForm.totalReceivedAmount` instead of `principalForm.actualInterest`. A small helper reads the project principal from `form.principal`, reads the total received input, and returns the derived numeric interest.

## Data Flow

1. Existing project loads with `principal` and optional `actualInterest`.
2. Page stores `principalForm.totalReceivedAmount` as `principal + actualInterest` when a project exists.
3. User edits total received amount.
4. Submit handlers derive `actualInterest` by subtracting `principal`.
5. Existing cloud calls continue to receive `actualInterest`.

## Error Handling

No new blocking validation is added. Existing conversion semantics remain numeric: blank or invalid total received amount becomes zero through the existing `Number(... || 0)` pattern, resulting in a negative interest if total received is below principal. This preserves the current ability to correct losses or negative interest.

## Testing

Add focused Jest tests in `miniprogram/__tests__/project-form.test.js`:

- Principal settlement submits `actualInterest` derived from total received amount minus principal.
- Redeemed project correction displays total received amount when loading historical actual interest.
- WXML uses total received copy and no longer labels the principal settlement input as direct interest entry.
