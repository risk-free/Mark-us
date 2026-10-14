/**
 * Suggestion engine (P5.5, mandate M6.2).
 *
 * Turns the **non-probabilistic** sub-signals of an assessment into a
 * confidence band, the contract's `riskFlags` and a short list of
 * `recommendedNextActions`. It is deliberately rule-based and pure: the same
 * sub-signals always yield the same suggestions (M6.1 replay), and it never
 * invents a probability or a legal opinion — the model owns `P(registration)`,
 * the attorney owns the decision.
 *
 * `headlineConfidence` describes how much the corpus comparison actually
 * supports, **not** the odds of registration: `HIGH` means strong, class-relevant
 * overlap was found, `INSUFFICIENT_DATA` means the corpus could not be compared.
 */

/** The contract's closed confidence vocabulary (`ARCH-03` `AssessmentConfidence`). */
export type AssessmentConfidence = "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_DATA";

/** The contract's closed risk-flag vocabulary (`ARCH-03` `Assessment.riskFlags`). */
export type RiskFlag =
  | "DESCRIPTIVE"
  | "DISTINCTIVE"
  | "LIKELY_CONFLICT"
  | "INSUFFICIENT_SPECIMEN"
  | "INSUFFICIENT_CORPUS";

/** Lexical overlap at or above this is treated as a class-relevant collision. */
export const COLLISION_TRIGRAM = 0.6;
/** Phonetic agreement at or above this is a collision regardless of class. */
export const COLLISION_PHONETIC = 0.8;
/** Overlap at or above this with a same-class candidate is a strong collision. */
export const STRONG_TRIGRAM = 0.8;
/** Goods/services overlap below this is too shallow to sharpen the comparison. */
const SHALLOW_GOODS = 0.2;

export interface SuggestionInput {
  candidateCount: number;
  maxTrigram: number;
  maxPhonetic: number;
  minClassDistance: number;
  goodsMax: number;
  /** True when the corpus could not be compared (empty candidate set). */
  degraded: boolean;
}

export interface Suggestions {
  headlineConfidence: AssessmentConfidence;
  riskFlags: RiskFlag[];
  recommendedNextActions: string[];
}

const ATTORNEY_REVIEW = "Have a qualified trademark attorney review the result before filing.";

export function deriveSuggestions(input: SuggestionInput): Suggestions {
  if (input.degraded || input.candidateCount === 0) {
    return {
      headlineConfidence: "INSUFFICIENT_DATA",
      riskFlags: ["INSUFFICIENT_CORPUS"],
      recommendedNextActions: [
        "Not enough comparable marks were found to screen this mark — treat the result as incomplete.",
        ATTORNEY_REVIEW,
      ],
    };
  }

  const flags: RiskFlag[] = [];
  const actions: string[] = [];

  const sameClass = input.minClassDistance <= 1;
  const strongCollision =
    (input.maxTrigram >= COLLISION_TRIGRAM && sameClass) || input.maxPhonetic >= COLLISION_PHONETIC;

  if (strongCollision) {
    flags.push("LIKELY_CONFLICT");
    actions.push("Review the listed conflicting marks before filing.");
    actions.push("Consider narrowing the goods/services or a coexistence strategy.");
  }

  if (input.minClassDistance >= 2) {
    actions.push("Confirm the Nice class coverage matches the goods/services.");
  }

  if (input.goodsMax < SHALLOW_GOODS) {
    actions.push("Describe the goods/services more precisely to sharpen the comparison.");
  }

  const headlineConfidence: AssessmentConfidence =
    strongCollision && input.maxTrigram >= STRONG_TRIGRAM
      ? "HIGH"
      : strongCollision || input.maxTrigram >= COLLISION_TRIGRAM
        ? "MEDIUM"
        : "LOW";

  actions.push(ATTORNEY_REVIEW);

  return {
    headlineConfidence,
    riskFlags: flags,
    recommendedNextActions: [...new Set(actions)],
  };
}
