# Current Issue: Wrong Customer Name in QuickBooks

## The Problem
When the app pushes invoice `12RYM0726` to QuickBooks, the **Customer** field shows `RAYIM` (the funding org) instead of the student's name (Client Name from Excel).

## What Should Happen
- **Customer** in QBO = Client Name from Excel column A (student name)
- **Bill to** in QBO = funding org (RAYIM, ISS, CMS, etc.)

## What the Code Does
In `src/lib/engine/push.ts` around line 151:
- If `inv.clientName` exists AND `inv.fundingOrgId` exists → creates student as sub-customer under the org ✅
- The sub-customer lookup is in `src/lib/qbo/invoice.ts` → `ensureSubCustomer()`

## The Suspected Problem
The `clientName` field may be **empty/null** in the database for invoice `12RYM0726`.
This means the code falls through to the `else if (inv.fundingOrgId)` branch and uses the org name (RAYIM) as the customer instead of the student name.

## How to Verify
Run on VPS:
```bash
docker exec mlie-postgres psql -U mlie -d mlie -c "SELECT doc_number, client_name, funding_org_id, status FROM invoices WHERE doc_number = '12RYM0726';"
```
If `client_name` is NULL → that's the bug. The Excel parser isn't saving the client name for this row.

## How to Fix
1. Check what name is in column A of the Excel file for invoice `12RYM0726`
2. If the Excel has the name, check `src/lib/excel/parse.ts` → `parseMligBuffer()` → line where `clientName` is read from `cellStr(row, 0)`
3. Delete `12RYM0726` from QuickBooks manually
4. Re-upload the Excel file in the app
5. Click "Re-push all to QuickBooks"

## Files to Look At
- `src/lib/excel/parse.ts` — reads Client Name from Excel column A
- `src/lib/engine/push.ts` — decides QBO customer based on clientName
- `src/lib/qbo/invoice.ts` — `ensureSubCustomer()` creates student under org in QBO
