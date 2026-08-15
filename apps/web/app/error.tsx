"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * Says what broke and what to do, and does not apologise or speculate. The
 * digest is shown because it is the only thing that makes a user's report
 * traceable in logs.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO(integration): forward to Sentry once the DSN is configured.
    console.error("Route error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start px-4 py-24 sm:px-6">
      <p className="micro text-accent-700">Error</p>
      <h1 className="mt-3 text-[32px] font-semibold tracking-tight">Something broke on this page</h1>
      <p className="mt-3 text-[16px] text-text-secondary">
        Nothing you saved was lost. Retrying reloads just this section — the rest of the app keeps
        working.
      </p>

      {error.digest ? (
        <p className="mt-4 border border-divider bg-surface px-3 py-2 font-mono text-[13px] text-text-secondary">
          Reference: {error.digest}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-2">
        <button
          onClick={reset}
          className="inline-flex h-9 items-center border border-transparent bg-accent px-4 text-[14px] font-medium transition-colors duration-150 ease-out hover:bg-accent-600"
        >
          Try again
        </button>
        <a
          href="/"
          className="inline-flex h-9 items-center border border-divider bg-surface px-4 text-[14px] font-medium transition-colors duration-150 ease-out hover:bg-text/7"
        >
          Back to home
        </a>
      </div>
    </main>
  );
}
