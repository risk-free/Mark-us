/**
 * Score-bearing presentation components (M6.2 / M8.4).
 *
 * Two rules govern everything in this file:
 *
 * 1. These components are *pure*. They receive already-localised labels as a
 *    prop and never call `useTranslations`. That is what lets the mandated
 *    snapshot tests render each of them in all three locales without a Next
 *    request context, and it keeps the components reusable from both the server
 *    marketing pages and the client assessment pages.
 *
 * 2. They are *disclaimer-first*. A component that displays a score displays the
 *    disclosure next to it — `DisclaimerBlock` is part of `ScorePanel`, not an
 *    optional extra. M6.2 makes an unaccompanied score a halt condition, so the
 *    only way to render one here is to render its disclosure too.
 */

/** The three disclaimer locales, matching `@markus/tm-data`'s `DisclaimerLocale`. */
export type DisclaimerTexts = {
  en: string;
  "zh-CN": string;
  "zh-TW": string;
};

export interface ScoreLabels {
  resultHeading: string;
  guidanceHeading: string;
  pRegistrationLabel: string;
  headlineConfidenceLabel: string;
  statusLabel: string;
  methodLabel: string;
  localeLabel: string;
  modelVersionLabel: string;
  disclaimerVersionLabel: string;
  corpusFreshnessLabel: string;
  isLegalAdviceLabel: string;
  notEnoughData: string;
  riskFlagsHeading: string;
  actionsHeading: string;
  disclaimersHeading: string;
  degradedNotice: string;
  noReferences: string;
  referencesHeading: string;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-medium">{label}</span> {value}
    </div>
  );
}

/**
 * M6.2 disclosure block: the three-locale disclaimer plus the model and
 * disclaimer versions. All three locales are rendered unconditionally — the
 * copy is versioned legal text, not developer-editable translation, so a
 * zh-CN visitor must be able to read what the zh-TW or en text actually says.
 */
export function DisclaimerBlock({
  disclaimers,
  modelVersion,
  disclaimerVersion,
  labels,
}: {
  disclaimers: DisclaimerTexts;
  modelVersion: string;
  disclaimerVersion: string;
  labels: ScoreLabels;
}) {
  return (
    <section className="rounded-md border border-ink-200 bg-ink-50 p-4">
      <h3 className="mb-3 text-lg font-medium">{labels.disclaimersHeading}</h3>
      <div className="space-y-4">
        {(["en", "zh-CN", "zh-TW"] as const).map((locale) => (
          <div key={locale}>
            <div className="mb-1 font-medium text-sm">{locale}</div>
            <div className="text-ink-700 text-sm whitespace-pre-wrap">{disclaimers[locale]}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2 border-t border-ink-200 pt-3 text-sm">
        <Row label={labels.modelVersionLabel} value={modelVersion} />
        <Row label={labels.disclaimerVersionLabel} value={disclaimerVersion} />
      </div>
    </section>
  );
}

/**
 * The score itself. `pRegistration` is rendered as a screening signal, never as
 * an outcome — the label says so, and `INSUFFICIENT_DATA` degrades to an
 * explicit "not enough data" instead of a fabricated number (M6.4).
 */
export function ScoreValue({
  status,
  pRegistration,
  headlineConfidence,
  labels,
}: {
  status: string;
  pRegistration: number | null;
  headlineConfidence: string;
  labels: ScoreLabels;
}) {
  const insufficient = status === "INSUFFICIENT_DATA" || headlineConfidence === "INSUFFICIENT_DATA";
  const value =
    insufficient || pRegistration === null
      ? labels.notEnoughData
      : `${Math.round(pRegistration * 100)}%`;

  return (
    <div>
      <span className="font-medium">{labels.pRegistrationLabel}</span> {value}
    </div>
  );
}

export function ProvenanceGrid({
  method,
  status,
  corpusFreshnessStatus,
  isLegalAdvice,
  labels,
  extraRows = [],
}: {
  method: string;
  status: string;
  corpusFreshnessStatus: string;
  isLegalAdvice: boolean;
  labels: ScoreLabels;
  extraRows?: { label: string; value: string }[];
}) {
  return (
    <div className="space-y-2">
      <Row label={labels.statusLabel} value={status} />
      <Row label={labels.methodLabel} value={method} />
      <Row label={labels.corpusFreshnessLabel} value={corpusFreshnessStatus} />
      <Row label={labels.isLegalAdviceLabel} value={String(isLegalAdvice)} />
      {extraRows.map((row) => (
        <Row key={row.label} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

export function RiskFlagList({ flags, labels }: { flags: readonly string[]; labels: ScoreLabels }) {
  if (flags.length === 0) return null;
  return (
    <section className="rounded-md border border-ink-200 p-4">
      <h3 className="mb-2 text-lg font-medium">{labels.riskFlagsHeading}</h3>
      <ul className="list-disc pl-6">
        {flags.map((flag, index) => (
          <li key={`${index}-${flag}`}>{flag}</li>
        ))}
      </ul>
    </section>
  );
}

export function RecommendedActions({
  actions,
  labels,
}: {
  actions: readonly string[];
  labels: ScoreLabels;
}) {
  if (actions.length === 0) return null;
  return (
    <section className="rounded-md border border-ink-200 p-4">
      <h3 className="mb-2 text-lg font-medium">{labels.actionsHeading}</h3>
      <ul className="list-disc pl-6">
        {actions.map((action, index) => (
          <li key={`${index}-${action}`}>{action}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The assessment result panel.
 *
 * `DisclaimerBlock` is rendered inside this component unconditionally, so a
 * caller physically cannot produce a score without its disclosure. The panel is
 * also rendered in every locale by the snapshot suite (M8.4).
 */
export function ScorePanel({
  status,
  pRegistration,
  headlineConfidence,
  method,
  corpusFreshnessStatus,
  isLegalAdvice,
  riskFlags,
  recommendedNextActions,
  disclaimers,
  modelVersion,
  disclaimerVersion,
  labels,
}: {
  status: string;
  pRegistration: number | null;
  headlineConfidence: string;
  method: string;
  corpusFreshnessStatus: string;
  isLegalAdvice: boolean;
  riskFlags: readonly string[];
  recommendedNextActions: readonly string[];
  disclaimers: DisclaimerTexts;
  modelVersion: string;
  disclaimerVersion: string;
  labels: ScoreLabels;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-md border border-ink-200 p-4">
        <h2 className="mb-3 text-xl font-semibold">{labels.resultHeading}</h2>
        <div className="space-y-2">
          <ScoreValue
            status={status}
            pRegistration={pRegistration}
            headlineConfidence={headlineConfidence}
            labels={labels}
          />
          <Row label={labels.headlineConfidenceLabel} value={headlineConfidence} />
          <ProvenanceGrid
            method={method}
            status={status}
            corpusFreshnessStatus={corpusFreshnessStatus}
            isLegalAdvice={isLegalAdvice}
            labels={labels}
          />
        </div>
      </section>

      <RiskFlagList flags={riskFlags} labels={labels} />
      <RecommendedActions actions={recommendedNextActions} labels={labels} />
      <DisclaimerBlock
        disclaimers={disclaimers}
        modelVersion={modelVersion}
        disclaimerVersion={disclaimerVersion}
        labels={labels}
      />
    </div>
  );
}

export interface GuidanceCitation {
  index: number;
  url: string;
  title: string;
}

/** The assistant's answer panel, carrying the same disclosure envelope. */
export function GuidancePanel({
  status,
  answer,
  locale,
  provider,
  model,
  citations,
  isLegalAdvice,
  disclaimers,
  disclaimerVersion,
  modelVersion,
  labels,
}: {
  status: string;
  answer: string | null;
  locale: string;
  provider?: string;
  model?: string;
  citations: readonly GuidanceCitation[];
  isLegalAdvice: boolean;
  disclaimers: DisclaimerTexts;
  disclaimerVersion: string;
  modelVersion: string;
  labels: ScoreLabels;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-md border border-ink-200 p-4">
        <h2 className="mb-3 text-xl font-semibold">{labels.guidanceHeading}</h2>
        <div className="space-y-2">
          <div>
            {answer === null || answer.length === 0 ? (
              <p className="text-ink-700">{labels.degradedNotice}</p>
            ) : (
              <p className="text-ink-800 whitespace-pre-wrap">{answer}</p>
            )}
          </div>
          <Row label={labels.localeLabel} value={locale} />
          <Row label={labels.statusLabel} value={status} />
          {provider === undefined ? null : <Row label="provider" value={provider} />}
          {model === undefined ? null : <Row label="model" value={model} />}
          <Row label={labels.isLegalAdviceLabel} value={String(isLegalAdvice)} />
        </div>
      </section>

      <section className="rounded-md border border-ink-200 p-4">
        <h3 className="mb-2 text-lg font-medium">{labels.referencesHeading}</h3>
        {citations.length === 0 ? (
          <p className="text-ink-700 text-sm">{labels.noReferences}</p>
        ) : (
          <ul className="list-disc pl-6">
            {citations.map((citation) => (
              <li key={citation.index}>
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  {citation.title}
                </a>{" "}
                <span className="text-ink-500 text-sm">{citation.url}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DisclaimerBlock
        disclaimers={disclaimers}
        modelVersion={modelVersion}
        disclaimerVersion={disclaimerVersion}
        labels={labels}
      />
    </div>
  );
}