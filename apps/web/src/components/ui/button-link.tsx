import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";

/**
 * The one button/link in the system.
 *
 * `href` is routed through next-intl's `Link`, so it carries the active locale
 * prefix automatically — a plain `next/link` would drop a visitor back to the
 * default locale. Pass `external` for off-site destinations, which must use a
 * real `<a>` (and a `rel`).
 */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
  external = false,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  external?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-colors";
  const variants = {
    primary: "bg-brand-700 text-white hover:bg-brand-800",
    secondary: "bg-white text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-50",
    ghost: "text-brand-800 hover:bg-brand-50",
  } as const;
  const classes = `${base} ${variants[variant]} ${className}`;

  if (external) {
    return (
      <a href={href} className={classes} rel="noopener noreferrer" target="_blank">
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** Text link used inside prose and cards, where a full button would be too heavy. */
export function TextLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`font-medium text-brand-800 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-700 ${className}`}
    >
      {children}
    </Link>
  );
}