"use client";
import { deleteDraft, clearPeriodDrafts } from "../actions/drafts";

export function DeleteDraftButton({
  id,
  period,
  docNumber,
}: {
  id: number;
  period: string;
  docNumber: string;
}) {
  return (
    <form
      action={deleteDraft}
      onSubmit={(e) => {
        if (!confirm(`Delete draft ${docNumber}?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="period" value={period} />
      <button
        type="submit"
        className="ghost"
        title="Delete this draft"
        style={{ color: "var(--red)", padding: ".28rem .55rem" }}
      >
        🗑
      </button>
    </form>
  );
}

export function ClearDraftsButton({
  period,
  count,
}: {
  period: string;
  count: number;
}) {
  return (
    <form
      action={clearPeriodDrafts}
      onSubmit={(e) => {
        if (!confirm(`Delete all ${count} draft invoices for ${period}? This cannot be undone.`))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="period" value={period} />
      <button type="submit" className="ghost" style={{ color: "var(--red)" }}>
        🗑 Clear all drafts
      </button>
    </form>
  );
}