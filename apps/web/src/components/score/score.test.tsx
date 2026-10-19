import { renderToStaticMarkup } from "react-dom/server";

import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";
import zhTW from "@/messages/zh-TW.json";
import { LOCALES, type Locale } from "@/i18n/locales";

import {
  DisclaimerBlock,
  GuidancePanel,
  ProvenanceGrid,
  RecommendedActions,
  RiskFlagList,
  ScorePanel,
  ScoreValue,
  type DisclaimerTexts,
  type GuidanceCitation,
  type ScoreLabels,
} from "./score";

/**
 * M8.4 / M6.2 — "snapshot tests of every score-bearing component in three
 * locales", plus the rule that no score renders without its disclaimer.
 *
 * These snapshots render through `react-dom/server` with the *real* disclaimer
 * text from `@markus/tm-data`, not a fixture: the point is to prove that the
 * versioned legal copy a real assessment carries survives rendering intact in
 * every locale. A fixture would let the two drift apart silently.
 */

const CATALOGS = { en, "zh-CN": zhCN, "zh-TW": zhTW } as Record<Locale, typeof en>;

function labelsFor(locale: Locale): ScoreLabels {
  const s = CATALOGS[locale].score;
  return {
    resultHeading: s.resultHeading,
    guidanceHeading: s.guidanceHeading,
    pRegistrationLabel: s.pRegistrationLabel,
    headlineConfidenceLabel: s.headlineConfidenceLabel,
    statusLabel: s.statusLabel,
    methodLabel: s.methodLabel,
    localeLabel: s.localeLabel,
    modelVersionLabel: s.modelVersionLabel,
    disclaimerVersionLabel: s.disclaimerVersionLabel,
    corpusFreshnessLabel: s.corpusFreshnessLabel,
    isLegalAdviceLabel: s.isLegalAdviceLabel,
    notEnoughData: s.notEnoughData,
    riskFlagsHeading: s.riskFlagsHeading,
    actionsHeading: s.actionsHeading,
    disclaimersHeading: s.disclaimersHeading,
    degradedNotice: s.degradedNotice,
    noReferences: s.noReferences,
    referencesHeading: s.referencesHeading,
  };
}

/** The genuine, versioned legal copy — never a hand-written stand-in. */
async function realDisclaimers(): Promise<DisclaimerTexts> {
  const { disclaimersByLocale } = await import("@markus/tm-data");
  return disclaimersByLocale() as DisclaimerTexts;
}

const MODEL_VERSION = "bootstrap-0.1.0";
const DISCLAIMER_VERSION = "disclaimer-1.0.0";

const CITATIONS: GuidanceCitation[] = [
  { index: 1, url: "https://example.org/kb/tm-what", title: "What is a trademark" },
];

const scoreFixture = {
  status: "scored",
  pRegistration: 0.62,
  headlineConfidence: "MEDIUM",
  method: "hybrid",
  corpusFreshnessStatus: "fresh",
  isLegalAdvice: false as const,
  riskFlags: ["SHARED_WORD_ELEMENT", "INSUFFICIENT_CORPUS"],
  recommendedNextActions: ["Narrow the class list", "Have an attorney review the result"],
};

describe.each(LOCALES)("score-bearing components in %s", (locale) => {
  const labels = labelsFor(locale);

  it("snapshots the disclaimer block with the real 3-locale legal copy", async () => {
    const disclaimers = await realDisclaimers();
    const markup = renderToStaticMarkup(
      <DisclaimerBlock
        disclaimers={disclaimers}
        modelVersion={MODEL_VERSION}
        disclaimerVersion={DISCLAIMER_VERSION}
        labels={labels}
      />,
    );
    expect(markup).toMatchSnapshot();
  });

  it("snapshots the score value", () => {
    expect(
      renderToStaticMarkup(
        <ScoreValue
          status={scoreFixture.status}
          pRegistration={scoreFixture.pRegistration}
          headlineConfidence={scoreFixture.headlineConfidence}
          labels={labels}
        />,
      ),
    ).toMatchSnapshot();
  });

  it("snapshots the provenance grid", () => {
    expect(
      renderToStaticMarkup(
        <ProvenanceGrid
          method={scoreFixture.method}
          status={scoreFixture.status}
          corpusFreshnessStatus={scoreFixture.corpusFreshnessStatus}
          isLegalAdvice={scoreFixture.isLegalAdvice}
          labels={labels}
        />,
      ),
    ).toMatchSnapshot();
  });

  it("snapshots the risk flags and recommended actions", () => {
    expect(
      renderToStaticMarkup(
        <>
          <RiskFlagList flags={scoreFixture.riskFlags} labels={labels} />
          <RecommendedActions actions={scoreFixture.recommendedNextActions} labels={labels} />
        </>,
      ),
    ).toMatchSnapshot();
  });

  it("snapshots the full assessment panel", async () => {
    const disclaimers = await realDisclaimers();
    const markup = renderToStaticMarkup(
      <ScorePanel
        {...scoreFixture}
        disclaimers={disclaimers}
        modelVersion={MODEL_VERSION}
        disclaimerVersion={DISCLAIMER_VERSION}
        labels={labels}
      />,
    );
    expect(markup).toMatchSnapshot();
  });

  it("snapshots the guidance panel, degraded and answered", async () => {
    const disclaimers = await realDisclaimers();
    const markup = renderToStaticMarkup(
      <>
        <GuidancePanel
          status="ok"
          answer="A trademark protects a mark used in commerce for specific classes."
          locale={locale}
          provider="primary"
          model="test-model"
          citations={CITATIONS}
          isLegalAdvice={false}
          disclaimers={disclaimers}
          disclaimerVersion={DISCLAIMER_VERSION}
          modelVersion={MODEL_VERSION}
          labels={labels}
        />
        <GuidancePanel
          status="degraded"
          answer={null}
          locale={locale}
          citations={[]}
          isLegalAdvice={false}
          disclaimers={disclaimers}
          disclaimerVersion={DISCLAIMER_VERSION}
          modelVersion={MODEL_VERSION}
          labels={labels}
        />
      </>,
    );
    expect(markup).toMatchSnapshot();
  });
});

describe("M6.2: a score never renders without its disclosure", () => {
  it.each(LOCALES)("carries all three disclaimers, both versions and the flag (%s)", async (locale) => {
    const disclaimers = await realDisclaimers();
    const markup = renderToStaticMarkup(
      <ScorePanel
        {...scoreFixture}
        disclaimers={disclaimers}
        modelVersion={MODEL_VERSION}
        disclaimerVersion={DISCLAIMER_VERSION}
        labels={labelsFor(locale)}
      />,
    );

    expect(markup).toContain("62%");
    expect(markup).toContain(disclaimers.en);
    expect(markup).toContain(disclaimers["zh-CN"]);
    expect(markup).toContain(disclaimers["zh-TW"]);
    expect(markup).toContain(MODEL_VERSION);
    expect(markup).toContain(DISCLAIMER_VERSION);
    expect(markup).toContain("false");
  });

  it.each(LOCALES)("degrades to an explicit 'not enough data' (%s)", (locale) => {
    const markup = renderToStaticMarkup(
      <ScoreValue status="INSUFFICIENT_DATA" pRegistration={null} headlineConfidence="LOW" labels={labelsFor(locale)} />,
    );

    // M6.4: a fabricated headline is worse than an honest blank.
    expect(markup).toContain(labelsFor(locale).notEnoughData);
    expect(markup).not.toContain("%");
  });

  it("renders no disclaimer block for an empty risk/action list rather than an empty section", () => {
    expect(renderToStaticMarkup(<RiskFlagList flags={[]} labels={labelsFor("en")} />)).toBe("");
    expect(
      renderToStaticMarkup(<RecommendedActions actions={[]} labels={labelsFor("en")} />),
    ).toBe("");
  });
});