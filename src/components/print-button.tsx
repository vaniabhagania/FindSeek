"use client";

export function PrintButton() {
  return <button className="btn" onClick={() => window.print()}>Save as PDF</button>;
}
