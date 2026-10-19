/**
 * Root layout.
 *
 * Intentionally renders no `<html>`: with next-intl the `<html>` element must be
 * produced by `app/[locale]/layout.tsx`, which is the first layout that knows the
 * resolved locale. Emitting it here would force a hardcoded `lang` back onto
 * every page — exactly the BUG-035 defect.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}