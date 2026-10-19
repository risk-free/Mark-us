import type { ReactNode } from "react";

/** Centred horizontal rhythm for every marketing section. */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-6 ${className}`}>{children}</div>;
}

/** Vertical rhythm + optional alternate surface, so sections separate without borders. */
export function Section({
  children,
  className = "",
  tone = "default",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted";
  id?: string;
}) {
  const toneClass = tone === "muted" ? "bg-ink-50" : "";
  return (
    <section id={id} className={`py-16 sm:py-24 ${toneClass} ${className}`}>
      {children}
    </section>
  );
}

/** Small uppercase kicker above a heading. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-sm font-semibold tracking-wide text-brand-700 uppercase ${className}`}>
      {children}
    </p>
  );
}

/** `<h1>` + lead paragraph, the standard page opening. */
export function PageHeader({
  title,
  lead,
  eyebrow,
}: {
  title: string;
  lead?: string;
  eyebrow?: string;
}) {
  return (
    <div className="max-w-3xl">
      {eyebrow === undefined ? null : <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
      <h1 className="text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">{title}</h1>
      {lead === undefined ? null : <p className="mt-6 text-lg text-ink-600">{lead}</p>}
    </div>
  );
}

/** Section heading pair (`<h2>` + supporting copy) for blocks below the page header. */
export function SectionHeading({
  title,
  lead,
}: {
  title: string;
  lead?: string;
}) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-bold tracking-tight text-ink-900">{title}</h2>
      {lead === undefined ? null : <p className="mt-4 text-ink-600">{lead}</p>}
    </div>
  );
}

/** Bordered surface used for every repeated content block. */
export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "li";
}) {
  return (
    <Tag
      className={`rounded-2xl border border-ink-200 bg-white p-6 shadow-sm ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Pill used for metadata such as scenario tags or freshness status. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand";
}) {
  const toneClass =
    tone === "brand"
      ? "bg-brand-50 text-brand-800 ring-brand-200"
      : "bg-ink-100 text-ink-700 ring-ink-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${toneClass}`}
    >
      {children}
    </span>
  );
}