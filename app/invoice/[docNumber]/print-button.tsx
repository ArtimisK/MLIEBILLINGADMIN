"use client";

export default function PrintButton() {
  return (
    <button className="lg" style={{ cursor: "pointer" }} onClick={() => window.print()}>
      ⬇ Save as PDF
    </button>
  );
}