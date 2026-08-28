"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: the root layout itself failed, so nothing from the app
 * — not the fonts, not the theme, not the token stylesheet — can be relied on.
 * Everything here is inline for that reason. It replaces `<html>` entirely,
 * which is why the tags are repeated.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[stockpile] global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Stockpile could not start
          </h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#475569", margin: "0 0 1rem" }}>
            The application shell failed to load. Nothing you were working on was saved or changed.
            Reloading is safe.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#64748b",
                margin: "0 0 1.5rem",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              appearance: "none",
              border: 0,
              borderRadius: "6px",
              background: "#1e293b",
              color: "#fff",
              fontSize: "0.8125rem",
              fontWeight: 500,
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Reload Stockpile
          </button>
        </main>
      </body>
    </html>
  );
}
