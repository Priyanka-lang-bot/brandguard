"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(`Page error${error.digest ? ` (${error.digest})` : ""}`);
  }, [error]);
  return (
    <div className="mx-auto grid max-w-lg gap-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-mute">
        BrandGuard couldn&apos;t load this page. The database may be temporarily unreachable. Your work is saved up to the last action that
        completed.
      </p>
      {error.digest && <p className="text-xs text-dim">Reference: {error.digest}</p>}
      <div className="flex justify-center gap-2">
        <button className="btn-primary" onClick={reset}>Try again</button>
        <Link href="/dashboard" className="btn-secondary">Dashboard</Link>
      </div>
    </div>
  );
}
