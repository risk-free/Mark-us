/**
 * Shared denylist for the M8.4 marketing-claims lint.
 *
 * M8.4 forbids a surface from *stating or implying* a registration guarantee, a
 * success rate, an accuracy figure, or a competitor comparison. That makes this
 * a denylist of phrase families rather than a grammar: it catches the literal
 * phrases a writer reaches for, in all three locales.
 *
 * Two honest limitations, stated rather than hidden:
 *
 * 1. It is a lexical check. "The best choice for your brand" needs no denylisted
 *    token and will pass. The snapshots plus human review are the second layer.
 * 2. It does not model implications. Only phrasing can be checked mechanically.
 */

/** Phrases that state or imply a prohibited claim. */
export const DENYLIST = [
  // Guarantee / outcome.
  { phrase: "guarantee", locales: ["en"] },
  { phrase: "guaranteed", locales: ["en"] },
  { phrase: "guarantees", locales: ["en"] },
  { phrase: "assured", locales: ["en"] },
  { phrase: "risk-free", locales: ["en"] },
  { phrase: "will be approved", locales: ["en"] },
  { phrase: "certain to register", locales: ["en"] },
  { phrase: "保证", locales: ["zh-CN"] },
  { phrase: "確保", locales: ["zh-CN"] },
  { phrase: "保證", locales: ["zh-TW"] },
  { phrase: "確保", locales: ["zh-TW"] },
  { phrase: "零风险", locales: ["zh-CN"] },
  { phrase: "零風險", locales: ["zh-TW"] },
  { phrase: "必过", locales: ["zh-CN"] },
  { phrase: "包过", locales: ["zh-CN"] },
  { phrase: "必過", locales: ["zh-TW"] },
  { phrase: "包過", locales: ["zh-TW"] },

  // Success rate / accuracy figures.
  { phrase: "success rate", locales: ["en"] },
  { phrase: "approval rate", locales: ["en"] },
  { phrase: "accuracy", locales: ["en"] },
  { phrase: "success rates", locales: ["en"] },
  { phrase: "成功率", locales: ["zh-CN"] },
  { phrase: "通过率", locales: ["zh-CN"] },
  { phrase: "准确率", locales: ["zh-CN"] },
  { phrase: "成功率", locales: ["zh-TW"] },
  { phrase: "通過率", locales: ["zh-TW"] },
  { phrase: "準確率", locales: ["zh-TW"] },
  { phrase: "100%", locales: ["zh-CN", "zh-TW", "en"] },

  // Superlative / leadership claims.
  { phrase: "industry-leading", locales: ["en"] },
  { phrase: "industry leading", locales: ["en"] },
  { phrase: "the leading", locales: ["en"] },
  { phrase: "the best", locales: ["en"] },
  { phrase: "number one", locales: ["en"] },
  { phrase: "no. 1", locales: ["en"] },
  { phrase: "the fastest", locales: ["en"] },
  { phrase: "most accurate", locales: ["en"] },
  { phrase: "the cheapest", locales: ["en"] },
  { phrase: "业内领先", locales: ["zh-CN"] },
  { phrase: "业界第一", locales: ["zh-CN"] },
  { phrase: "行业第一", locales: ["zh-CN"] },
  { phrase: "排名第一", locales: ["zh-CN"] },
  { phrase: "无人能及", locales: ["zh-CN"] },
  { phrase: "独家", locales: ["zh-CN"] },
  { phrase: "最专业", locales: ["zh-CN"] },
  { phrase: "最快", locales: ["zh-CN"] },
  { phrase: "最便宜", locales: ["zh-CN"] },
  { phrase: "领先", locales: ["zh-CN"] },
  { phrase: "第一品牌", locales: ["zh-CN"] },
  { phrase: "業內領先", locales: ["zh-TW"] },
  { phrase: "業界第一", locales: ["zh-TW"] },
  { phrase: "行業第一", locales: ["zh-TW"] },
  { phrase: "排名第一", locales: ["zh-TW"] },
  { phrase: "無人能及", locales: ["zh-TW"] },
  { phrase: "獨家", locales: ["zh-TW"] },
  { phrase: "最專業", locales: ["zh-TW"] },
  { phrase: "最快", locales: ["zh-TW"] },
  { phrase: "最便宜", locales: ["zh-TW"] },
  { phrase: "領先", locales: ["zh-TW"] },
  { phrase: "第一品牌", locales: ["zh-TW"] },

  // Competitor comparison.
  { phrase: "competitor", locales: ["en"] },
  { phrase: "competitors", locales: ["en"] },
  { phrase: "outperform", locales: ["en"] },
  { phrase: "better than", locales: ["en"] },
  { phrase: "compared to competitors", locales: ["en"] },
  { phrase: "竞争对手", locales: ["zh-CN"] },
  { phrase: "优于", locales: ["zh-CN"] },
  { phrase: "優於", locales: ["zh-TW"] },
  { phrase: "競爭對手", locales: ["zh-TW"] },
];

/**
 * Negation markers. A denylisted phrase immediately preceded by one of these is
 * a *disclaimer*, not a claim — "not a guarantee" and "不保证可注册性" are the
 * exact sentences M8.4 wants on the page. Without this rule the lint would
 * fail on its own required copy and would eventually be switched off.
 */
export const NEGATIONS = [
  "not",
  "no",
  "never",
  "cannot",
  "can't",
  "won't",
  "without",
  "neither",
  "nor",
  "non-",
  "不",
  "未",
  "无",
  "無",
  "非",
  "别",
  "別",
  "免",
  "勿",
];

/**
 * Clause boundaries.
 *
 * Full-width punctuation always ends a clause because in Chinese it separates
 * clauses. ASCII comma is NOT a boundary: in English it is usually a list
 * separator ("success rates, accuracy figures, or comparisons"), and treating
 * it as a clause edge would flag the negated second and third items of a list.
 */
const ALWAYS_BOUNDARY = new Set([
  "\n",
  "\r",
  "。",
  "！",
  "？",
  "；",
  "：",
  "，",
  "、",
  ".",
  "!",
  "?",
  ";",
  ":",
]);

/**
 * How far back to look for a negation, in characters.
 *
 * Sized for a negation attached to its own phrase — "is not a guarantee of
 * registrability" puts "not" 18 characters before the keyword. A negation that
 * governs a long list ("we publish no success rate and no accuracy figure") is
 * written with a repeated negation rather than relying on a wide window, so the
 * rule stays predictable instead of excusing a claim stated later in a sentence.
 *
 * A sentence boundary always clears the window, so a negation in the previous
 * sentence can never excuse a claim in this one.
 */
export const NEGATION_WINDOW = 18;

export function isNegated(text, matchIndex) {
  const start = Math.max(0, matchIndex - NEGATION_WINDOW);
  const window = text.slice(start, matchIndex);

  let cut = -1;
  for (let i = window.length - 1; i >= 0; i -= 1) {
    if (ALWAYS_BOUNDARY.has(window[i])) {
      cut = i;
      break;
    }
  }
  const clause = (cut === -1 ? window : window.slice(cut + 1)).toLowerCase();
  return NEGATIONS.some((negation) => clause.includes(negation.toLowerCase()));
}

/**
 * Find every denylisted phrase in `text`.
 *
 * Matching is case-insensitive; overlapping hits are de-duplicated so a phrase
 * containing another ("guarantee" inside "guaranteed") is reported once.
 */
export function findClaimPhrases(text) {
  const haystack = text.toLowerCase();
  const hits = [];

  for (const { phrase } of DENYLIST) {
    let from = 0;
    for (;;) {
      const index = haystack.indexOf(phrase.toLowerCase(), from);
      if (index === -1) break;
      hits.push({
        phrase,
        index,
        negated: isNegated(text, index),
        excerpt: text.slice(Math.max(0, index - 20), index + phrase.length + 20).replace(/\s+/g, " "),
      });
      from = index + phrase.length;
    }
  }

  hits.sort((a, b) => a.index - b.index);
  return hits.filter((hit, index, all) => index === 0 || all[index - 1].index !== hit.index);
}