"use client";

/**
 * Last-resort error boundary (BUG-035).
 *
 * When a failure escapes the locale layout, next-intl's message provider is gone
 * too — so this component cannot use `useTranslations` and must not depend on
 * anything from the app. It renders its own `<html>`/`<body>`, which is why
 * Next.js requires this file to be a Client Component that owns the document.
 *
 * Copy is inline and in English only, for the same reason: there is no locale
 * context left to translate from. This is a failure screen, not a content page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          color: "#0f172a",
          background: "#ffffff",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "3rem 1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "1rem", color: "#475569", lineHeight: 1.6 }}>
            This page could not be rendered. The problem has been contained to this request.
          </p>
          {error.digest === undefined ? null : (
            <p style={{ marginTop: "0.5rem", fontFamily: "monospace", fontSize: "0.75rem", color: "#64748b" }}>
              {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "9999px",
              border: "none",
              background: "#1d34d8",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}