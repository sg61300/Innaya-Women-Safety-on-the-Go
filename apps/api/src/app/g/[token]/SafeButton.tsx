"use client";
import { useEffect, useState } from "react";

// ChatGPT 12: a page left open greys Safe at the deadline by itself. The form still posts with
// no JS, and the server refuses a late Safe either way.
export function SafeButton({ closed, until }: { closed: boolean; until?: number }) {
  const [over, setOver] = useState(closed);
  useEffect(() => {
    if (over || !until) return;
    const t = setTimeout(() => setOver(true), Math.max(0, until - Date.now()));
    return () => clearTimeout(t);
  }, [over, until]);
  return (
    <button type="submit" disabled={over} style={{ width: "100%", padding: "14px", font: "700 16px system-ui", color: "#fff", background: over ? "#9ca3af" : "#065f46", border: 0, borderRadius: 8 }}>
      Safe — cancel the alarm
    </button>
  );
}
