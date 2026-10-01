"use client";

import { useEffect, useRef, useState } from "react";
import { useOwnerGuard } from "./AccountShell";

export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const guard = useOwnerGuard();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className="btn sm"
      onClick={async () => {
        const ticket = guard.capture();
        if (!guard.current(ticket)) return;
        try {
          await navigator.clipboard.writeText(text);
          if (!guard.current(ticket)) return;
          setFailed(false);
          setDone(true);
          timer.current = setTimeout(() => { if (guard.current(ticket)) setDone(false); }, 1400);
        } catch {
          if (guard.current(ticket)) setFailed(true);
        }
      }}
    >
      {done ? "Copied ✓" : failed ? "Copy blocked — select manually" : label}
    </button>
  );
}
