"use client";
import { useFormStatus } from "react-dom";

interface Props {
  label: string;
  loadingLabel?: string;
  className?: string;
  disabled?: boolean;
}

export default function SubmitButton({
  label,
  loadingLabel,
  className,
  disabled,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      style={pending ? { opacity: 0.7, cursor: "not-allowed" } : undefined}
    >
      {pending ? (
        <span style={{ display: "flex", alignItems: "center", gap: ".5rem", justifyContent: "center" }}>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {loadingLabel ?? "Working…"}
        </span>
      ) : label}
    </button>
  );
}
