"use client";

import { useFormStatus } from "react-dom";

/** Submit button for a demo-role form: shows progress while the sign-in server action runs. */
export function DemoButton({ children, className, label }: { children: React.ReactNode; className: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${className} ${pending ? "cursor-wait opacity-80" : ""}`} aria-label={label} aria-busy={pending} disabled={pending}>
      {children}
      {pending && (
        <span className="kicker absolute inset-x-4 bottom-2 text-right text-[10px]" role="status">
          Signing in…
        </span>
      )}
    </button>
  );
}
