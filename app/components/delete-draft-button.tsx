"use client";

export function DeleteDraftButton({
  id,
  period,
  docNumber,
  action,
}: {
  id: number;
  period: string;
  docNumber: string;
  action: (f: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
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
  action,
}: {
  period: string;
  count: number;
  action: (f: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete all ${count} draft invoices for ${period}? This cannot be undone.`))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="period" value={period} />
      <button
        type="submit"
        className="ghost"
        style={{ color: "var(--red)" }}
      >
        🗑 Clear all drafts
      </button>
    </form>
  );
}