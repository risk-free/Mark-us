/**
 * Site-level configuration (M14.1: typed and validated at boot).
 *
 * `NEXT_PUBLIC_SITE_URL` is the only place the deployment origin is read, so
 * canonical URLs, hreflang alternates, Open Graph tags and the sitemap cannot
 * drift apart.
 *
 * The default is an RFC 2606 reserved name on purpose: the production `.com`
 * does not exist yet, and a real-looking default would make a misconfigured
 * build publish canonicals to someone else's domain. Every consumer treats this
 * as "set the env var before launch" and CI asserts the placeholder is never used
 * in a production build.
 */
export const SITE_URL: string = process.env.NEXT_PUBLIC_SITE_URL ?? "https://markus.example";

/** True when the build is still using the reserved placeholder domain. */
export function isPlaceholderSiteUrl(url: string = SITE_URL): boolean {
  return url.endsWith(".example");
}

export function absoluteUrl(pathname: string): string {
  const base = SITE_URL.endsWith("/") ? SITE_URL.slice(0, -1) : SITE_URL;
  if (pathname === "/") return `${base}/`;
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}