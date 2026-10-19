import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation primitives. Importing `Link`/`redirect` from here
 * instead of `next/link` / `next/navigation` is what makes every in-app link
 * carry the active locale prefix automatically.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);