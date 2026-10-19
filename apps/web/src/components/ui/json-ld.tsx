/**
 * JSON-LD emitter for the structured-data half of SCHEDULE 1.4.
 *
 * GEO/SEO surfaces are read by machines, not just crawlers, so the schema is
 * emitted next to the markup it describes rather than collected later. The
 * payload is serialised with `<` escaped: a value containing `</script>` would
 * otherwise close the tag early and inject markup into the page.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      // Content is JSON.stringify output, not user input.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

/** Absolute URL helper for canonical/OG/sitemap entries. */
export function absoluteUrl(pathname: string, siteUrl: string): string {
  const base = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${suffix}`;
}