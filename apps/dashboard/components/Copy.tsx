"use client";

import { useState } from "react";

export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className="btn sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setFailed(false);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          setFailed(true);
        }
      }}
    >
      {done ? "Copied ✓" : failed ? "Copy blocked — select manually" : label}
    </button>
  );
}
