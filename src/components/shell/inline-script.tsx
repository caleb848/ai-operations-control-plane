"use client";

/**
 * Runs during HTML parsing on full page loads (before first paint) and is
 * inert on the client, which avoids React's dev warning about rendering
 * <script> tags. Pattern from the Next.js "Preventing flash before hydration" guide.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
