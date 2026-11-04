# Scoring and Evidence Contract

| Field | Value |
|---|---|
| **Version** | 1.0 |
| **Status** | **FROZEN** — changing it requires a contract version bump and an ADR |
| **Frozen at** | 2026-11-02 |
| **Owner** | Architect |
| **Authority** | ADR D-32 |
| **Implements** | BUG-017 (residual scoring/provenance gaps) |
| **Related** | D-03 (target and metrics), D-24 / D-26 (cohort and labels), D-25 (release floor), DQ-010 / R-010 (no score before M5) |
| **Schema** | `packages/db/prisma/schema.prisma`; invariants in `prisma/migrations/0P3__p0_3_backlog/fragments/30-scoring-evidence.sql` |

This document freezes **how a probability is represented, attributed, reviewed, evaluated and
promoted**. It is the contract every future writer, API handler and promotion script is measured
against. It deliberately does **not** choose a corpus source, approve compute spend, name an
attorney, run an evaluation, or activate a model.

---

## 1. Definitions

| Term | Meaning |
|---|---|
| **Headline score** | `P(eventual registration)` for one mark + Nice class + goods/services. The only figure a client may ever see (D-03). |
| **Model** | One immutable trained artifact, registered under a stable `modelVersion`. |
| **Bootstrap** | The in-code cold-start scorer (`bootstrap-0.1.0`). Internal only; never client-servable. |
| **Baseline** | The constant base-rate comparator (`baseline-base-rate`). Used to measure lift; never promotable. |
| **Evaluation** | One measurement of one artifact on one frozen label set and configuration. |
| **Label** | A resolved outcome for one mark: `POSITIVE` (registered), `NEGATIVE` (abandoned), or `CENSORED` (unresolved). |
| **Censored** | No trustworthy outcome inside the horizon. **Never** a negative (D-24). |
| **Promotion** | Making a trained artifact the single model that production may serve. Not the same as deployment. |
| **Servable** | An assessment that satisfies every predicate in §3.3. Anything else must not render a number. |

Cohort and label semantics come from D-24 and D-26, not from this document:

- cohort = whole LIVE USPTO corpus (`TmCorpusMark`, status 600 + 700), no origin filter;
- horizon = `+12` months primary / `+24` months secondary, held in configuration;
- positive = registration inside the horizon; negative = verified abandonment event inside the
  horizon (TDXF event history, not research status codes); unresolved = censored.

D-03's older "filings 2021–2023" wording is superseded by D-24 for cohort assembly; D-03 still
owns the target, the metric family and the disclaimer duty.

---

## 2. Score representation

### 2.1 Storage

| Rule | Enforcement |
|---|---|
| Canonical scale is `0..1`, never `0..100`. `0..100` is presentation only. | API layer; this document |
| Stored as `Decimal(5,4)` in both `TrademarkAssessment.pRegistration` and the denormalised `Trademark.probabilityScore`. | Prisma type + `ck_assessment_score_range` / `ck_score_range` |
| Resolution is `0.0001` (0.01 percentage point). | `Decimal(5,4)` |
| Repeated reads cannot change the value. | Exact decimal storage; no binary float in the column |
| `0` and `1` are valid scores, not placeholders. | Range CHECK is inclusive |
| `NULL` means **no score**, never "zero risk". | `ck_assessment_score_coupling` |

A model that emits `0.0` or `1.0` is clamped by the scorer; the database refuses anything outside
`0..1`.

### 2.2 Write path

1. The scorer produces a finite number in `0..1`.
2. At the persistence boundary it is rounded **once**, half-up, to 4 decimal places and converted
   from the decimal string (never from a binary float artefact).
3. The stored value is the value that is displayed. No second rounding at render time.
4. The wire representation is the same 4-decimal value; clients must not re-round it.

Evaluation code may use full-precision `number` values internally. Only the persisted client
assessment score is quantised. `CorpusLabel.predictionScore` retains the full-precision holdout or
training prediction so the evaluation can be recomputed; it is never a client-visible score.

### 2.3 Degraded results

`TrademarkAssessment.outcome` is `SCORED` or `INSUFFICIENT_DATA`.

- `SCORED` ⇔ `pRegistration IS NOT NULL`.
- `INSUFFICIENT_DATA` ⇔ `pRegistration IS NULL`.

A degraded result is recorded so the refusal is auditable. It is never converted to `0`, `0.5`, or
any other "safe" number (M6.4).

---

## 3. Assessment record

`TrademarkAssessment` is the **append-only source of truth**. `Trademark.probabilityScore`,
`probabilityModelId`, `probabilityVerdict`, `probabilityReviewedById` and `probabilityReviewedAt`
are a denormalised cache of the latest assessment + review. If the cache and the assessment rows
disagree, the rows win and the cache is rebuilt.

### 3.1 Required fields

| Field | Contract |
|---|---|
| `outcome` | `SCORED` or `INSUFFICIENT_DATA`. |
| `pRegistration` | `Decimal(5,4)`, nullable only for `INSUFFICIENT_DATA`. |
| `modelId` | FK to the exact `ProbabilityModel` row. A free-text model name is not evidence. |
| `disclaimerVersion` | Non-empty; must equal the disclaimer version rendered with the result. |
| `subSignals` | Non-probabilistic features only. Never rendered as a percentage or as odds. |
| `featureSnapshot` | Query, top candidates, class and the model version used. |
| `corpusSnapshotAt` | Required for `SCORED`: the corpus watermark the features were computed against. May be null for `INSUFFICIENT_DATA` when no watermark can be established. |
| `corpusIngestRunId` | The ingest run that produced that watermark, when known. |
| `createdAt` | Server time. |

### 3.2 Immutability

- No `UPDATE`, `DELETE` or `TRUNCATE` on `TrademarkAssessment`. Triggers reject all three.
- `TrademarkAssessment.trademark` uses `ON DELETE RESTRICT`: deleting a mark cannot erase its
  scoring history.
- A correction is a **new assessment**, not an edit.
- Replay is idempotent through `@@unique([trademarkId, modelId, createdAt])`.

### 3.3 Servability predicate (R-010)

A number, percentage, band, or "likely to register" phrasing may be rendered **only** when all of
the following are true:

1. `assessment.outcome = 'SCORED'` and `pRegistration` is non-null;
2. `model.kind = 'TRAINED'`;
3. `model.status = 'PROMOTED'`;
4. `model.promotedEvaluationId` is set and points at the evaluation referenced by the promotion
   approvals;
5. the request is behind the post-M5 feature gate;
6. the rendered copy carries the three D-03 locale disclaimers and the matching
   `disclaimerVersion`.

If any predicate fails, the surface shows mark intake, document checklist, "start a conversation"
and claim only — never a fabricated or provisional number. `BOOTSTRAP` and `BASELINE` can never
satisfy predicates 2–4, so they are structurally non-servable.

---

## 4. Model registry and provenance

### 4.1 `ProbabilityModel`

One row per deployable descriptor. `modelVersion` is the stable artifact name and is immutable.

| Field | Contract |
|---|---|
| `kind` | `BOOTSTRAP` \| `TRAINED` \| `BASELINE`. |
| `status` | `CANDIDATE` \| `PROMOTED` \| `REJECTED` \| `RETIRED`. |
| `artifactSchemaVersion` | `2` for every `TRAINED` model. Schema-v2 is the frozen artifact format. |
| `artifactSha256` | SHA-256 of the exact UTF-8 bytes of the artifact file. Required for `TRAINED`. |
| `artifactJson` | The canonical artifact snapshot, written once at registration and immutable thereafter. Required for `TRAINED`. |
| `cohort`, `labelHorizonMonths` | The exact cohort name and horizon used for training. |
| `trainingCutoff`, `censusAt`, `trainedAt` | Required for `TRAINED`. |
| `promotedAt`, `promotedById`, `promotedEvaluationId` | Required when `status = 'PROMOTED'`. |
| `notes` | Free text, never evidence. |

`BOOTSTRAP` and `BASELINE` have no artifact hash and no evaluation; they exist so every assessment
has a real FK target. They can never be `PROMOTED` (`ck_probability_model_promoted_shape`).

### 4.2 Lifecycle

```
CANDIDATE ──(evaluation fails / rejected)──> REJECTED
    │
    └──(evaluation passes + approval quorum)──> PROMOTED ──> RETIRED
```

- Every row starts as an unpromoted `CANDIDATE`; retrospective `PROMOTED` or `RETIRED` inserts are
  rejected. Promotion metadata may be set only by `CANDIDATE → PROMOTED`, and `retiredAt` only by
  `PROMOTED → RETIRED`.
- At most one row may be `PROMOTED` (`ux_probability_model_one_promoted`).
- Promotion is a state change on an existing row, not a new row.
- `RETIRED` is terminal for serving and must retain its promotion evidence; the row and its evidence
  remain forever.
- `REJECTED` and `RETIRED` are terminal lifecycle states; only mutable operations metadata may
  still change. Artifact identity, training evidence and promotion evidence are immutable.
- A rejected candidate is kept. Deleting or truncating inconvenient evidence is not a lifecycle
  transition.

### 4.3 Evidence chain

```
artifact file bytes ──sha256──> ProbabilityModel.artifactSha256
        │                              │
        └──> ModelEvaluation.artifactSha256
                                       │
                    ModelPromotionReview.evaluationId
                                       │
                    ProbabilityModel.promotedEvaluationId
                                       │
                    TrademarkAssessment.modelId
```

Every arrow is a foreign key or a hash comparison. No link is "the filename looked right".

---

## 5. Evaluation and label evidence

### 5.1 `ModelEvaluation`

One row per `(artifact, cohort, label set, configuration)`. Contract v1.0 evaluations are always
`split = HOLDOUT`, matching the single report in a schema-v2 artifact. Their `CorpusLabel` rows retain
the full train+holdout label set. The artifact JSON remains canonical: its model identity, corpus
configuration, holdout counts, global censored count, metrics, calibration buckets and release gate
must equal the evaluation columns exactly. A summary from one artifact cannot be attached to another.

`configurationJson` stores the exact logical evaluation configuration. `evaluationKey` is the
SHA-256 of its canonical JSON encoding (lexicographically sorted keys, no whitespace):

```json
{
  "accuracyThreshold": 0.5,
  "artifactSha256": "…",
  "cohort": "live-v1",
  "labelHorizonMonths": 12,
  "maxExamples": 50000,
  "modelVersion": "…",
  "samplingAlgorithm": "hash-top-n-v1",
  "seed": 0,
  "split": "HOLDOUT",
  "thresholds": { "maxCiHalfWidthPp": 5, "minAuc": 0.7, "minLiftPp": 10, "minResolvedLabels": 500 },
  "trainingCutoff": "2020-01-01",
  "censusAt": "2022-01-01"
}
```

Consequences:

- Re-running the same evaluation is a no-op (`evaluationKey` unique).
- `configurationJson` contains every field needed to reproduce that hash; a bare hash without its
  configuration is not evidence.
- Changing a threshold, horizon, cohort, seed or cutoff requires a new training run and artifact,
  a newly registered model, and a **new** evaluation row. It never edits history or attaches a
  different report to an existing immutable artifact.
- `trainerCommit` is the exact 40-hex git commit of the trainer.
- Persisted schema-v2 evaluations are releasable and `releaseReasons` is an empty JSON array; failed
  runs are handled explicitly in §5.4.
- `calibrationJson` is the per-bucket array from `buildCalibrationReport`.
- `accuracyThreshold` is frozen at `0.5` for contract/artifact v1.0/v2 because it changes accuracy,
  lift, CI and releasability. Changing it requires a new contract and artifact schema version.
- Only `split = HOLDOUT` metrics may satisfy the release gate (D-25).

### 5.2 Evidence finalization

An evaluation summary is not approvable merely because it says `releasable = true`. Before the first
promotion review, one transaction must:

1. lock the model and then the evaluation (the database lock order), and load every `CorpusLabel` row;
2. reconcile train, holdout and global censored counts against the evaluation and artifact;
3. recompute AUC, accuracy at `0.5`, majority baseline, accuracy lift, 95% CI half-width and every
   calibration bucket from `predictionScore + outcome` on the HOLDOUT rows, using `eval.ts` semantics;
4. require exact count/bucket-population equality and numeric agreement within `1e-9`, and require
   the stored summary, calibration and release gate to match `artifactJson`;
5. reproduce `evaluationKey` from canonical `configurationJson` and verify the artifact-file hash.

Only then may the first review be inserted. The database repeats the count, bucket-population and
artifact checks at review and promotion. The first review freezes the label set: later label INSERTs,
like UPDATE/DELETE/TRUNCATE, are rejected. Any correction requires a new model evaluation and label
set, never an edit to the approved evidence.

### 5.3 `CorpusLabel`

The exact labelled sample behind one evaluation, one row per mark across both temporal splits:

| Field | Contract |
|---|---|
| `serialNumber` | USPTO serial; unique per evaluation. |
| `outcome` | `POSITIVE` / `NEGATIVE` / `CENSORED`. |
| `split` | `TRAIN` iff `filingDate < trainingCutoff`; otherwise `HOLDOUT`. |
| `predictionScore` | Full-precision model output in `0..1`; required iff resolved, null iff censored. Used only for evaluation recomputation. |
| `filingDate`, `horizonAt` | The filing date and the exact calendar-month horizon derived from `labelHorizonMonths`. |
| `resolvedAt` | Registration/abandon event date on or before both horizon and census; `NULL` iff censored. |
| `sourceStatusCode` | The corpus status code observed when the label was assembled. |

`sampleSize` on the evaluation equals HOLDOUT `positiveLabels + negativeLabels`. `censoredLabels`
is the global censored count across the full train+holdout sample, matching the schema-v2 artifact;
censored rows never enter accuracy, AUC or calibration. Storing them is intentional: it proves how
much mass was excluded.

### 5.4 Release floor (D-25)

The gate is evaluated from configuration, and the **threshold values used are stored on the row**
so a later configuration change cannot rewrite history:

- `>= 500` resolved labels;
- `95% CI half-width on accuracy <= 5 pp`;
- `AUC >= 0.70`;
- accuracy lift over the majority baseline `>= 10 pp` (M5a).

Stored thresholds may be stricter but never weaker than these floors. The gate is not lowered to fit
the data.

Schema v2 is a **releasable-artifact** format. A training run that fails the gate throws
`ModelReleaseError`, writes no artifact, and creates no `ProbabilityModel`, `ModelEvaluation` or
`CorpusLabel` rows; its report and reasons remain in the trainer run log. The same rule applies to a
failed re-evaluation: it cannot overwrite or attach a different report to an immutable artifact.
Changed labels or configuration require a new training run, artifact and candidate registration.
Persisting failed runs as first-class database evidence would require a separate run-evidence model
and a contract/artifact version change; it is not silently mixed into contract v1.0.

---

## 6. Attorney review and promotion approval

### 6.1 Assessment review

`AssessmentReview` is the authoritative review of one assessment. One row per assessment; the row
is immutable.

| Field | Contract |
|---|---|
| `verdict` | `CONFIRMED` (attorney accepts the model score) or `OVERRIDDEN` (attorney supplies a replacement). |
| `reviewedScore` | Required iff `OVERRIDDEN`; `Decimal(5,4)` in `0..1`; `NULL` for `CONFIRMED`. |
| `reviewerId` | FK to `StaffUser`; the reviewer must be `ACTIVE` and hold `EXPERT` at insertion. |
| `rationale` | At least 10 non-whitespace characters. |

The model's original score is never overwritten. An override is additional evidence, and the
denormalised `Trademark.probabilityVerdict` / `probabilityReviewedById` / `probabilityReviewedAt`
must be all-null or all-set.

### 6.2 Promotion review

`ModelPromotionReview` records one staff decision on one evaluation.

A model may move to `PROMOTED` only when all of the following hold:

1. `evaluation.releasable = true` and every D-25/M5a threshold passed;
2. `>= 2` `APPROVE` rows with distinct reviewers;
3. at least one `APPROVE` has `reviewerRole = 'ATTORNEY'`;
4. at least one `APPROVE` has `reviewerRole = 'MASTER_ADMIN'`;
5. every `APPROVE` references the same `evaluationId` that becomes
   `ProbabilityModel.promotedEvaluationId`;
6. no `REJECT` row exists for that evaluation;
7. the attorney review carries a label spot-check: `spotCheckSampleSize >= 50` and a reported
   `spotCheckAgreementPct` in `0..100`.

The two spot-check fields are required together only on an attorney `APPROVE`; they are null on a
Master-Admin approval and on rejections. The 50-label floor is the D-24 golden-fixture floor, not a
new legal standard. Raising it is a contract change; lowering it is prohibited.

The promoter must hold `MASTER_ADMIN`. `promotedById` names that person; the approval rows name the
reviewers. A person may not approve and promote the same model without a second approver existing.

---

## 7. Promotion checklist

Run in order. Any failed step stops the promotion; none may be skipped or "noted and accepted".

1. Artifact parses as `MODEL_ARTIFACT_SCHEMA_VERSION = 2` and `releaseGate.releasable = true`.
2. SHA-256 of the artifact file equals `artifactSha256` recorded on the registry and evaluation.
3. Evaluation `evaluationKey` is reproducible from the recorded configuration.
4. Run §5.2 finalization: reconcile every label count and recompute every metric and calibration
   bucket from the retained HOLDOUT `predictionScore + outcome` rows; censored rows are excluded.
5. Require `sampleSize >= 500`, `ciHalfWidthPp <= 5`, `auc >= 0.70`, `accuracyLiftPp >= 10`, with
   the summary and release gate equal to `artifactJson`.
6. Attorney spot-check recorded with `spotCheckSampleSize >= 50`.
7. Approval quorum from §6.2 exists for the exact evaluation; no rejection exists.
8. Disclaimers for all three locales are current and their `disclaimerVersion` is recorded.
9. Registry row is updated to `PROMOTED` with `promotedAt`, `promotedById`,
   `promotedEvaluationId`; the database rechecks evidence and quorum.
10. Only then may the serving layer select the model. Production selection is a separate,
    audited deploy step.

Steps 1–7 are evidence. Step 8 is copy review. Steps 9–10 are operations. **M5a is not "the model
trained"; it is steps 1–8 plus the owner-visible gate in `SCHEDULE.md`.**

---

## 8. Invariants

| # | Invariant | Enforced by |
|---|---|---|
| 1 | A stored score is in `0..1` at 4 dp. | `Decimal(5,4)` + CHECK |
| 2 | `SCORED` ⇔ non-null score. | `ck_assessment_score_coupling` |
| 3 | A visible score names a model. | `ck_trademark_score_model` + FK |
| 4 | A review verdict never exists without a reviewer, timestamp and score. | `ck_trademark_review_triad`, `ck_trademark_verdict_has_score` |
| 5 | A degraded result is never `0`. | `pRegistration IS NULL` contract |
| 6 | Only `TRAINED` can be `PROMOTED`. | `ck_probability_model_promoted_shape` |
| 7 | At most one model is `PROMOTED`. | `ux_probability_model_one_promoted` |
| 8 | Promotion and reviews bind an evaluation of the same model. | `promotedEvaluationId`, `modelId` + composite FKs |
| 9 | Evaluation counts reconcile. | `ck_eval_label_counts` |
| 10 | `releasable` agrees with `releaseReasons` and the stored holdout gate. | `ck_eval_evidence_shape`, `ck_eval_release_gate` |
| 11 | Censored ≠ negative; resolved labels fall inside an elapsed horizon and on/before census. | label CHECKs + `bind_corpus_label` |
| 12 | An override carries its replacement score. | `ck_assessment_review_override` |
| 13 | Assessment, review, evaluation, label and promotion rows reject UPDATE, DELETE and TRUNCATE. | triggers |
| 14 | A mark cannot be deleted out from under its assessments. | `ON DELETE RESTRICT` |
| 15 | Model identity, artifact/training evidence and promotion binding cannot be rewritten. | lifecycle trigger + delete/truncate triggers |
| 16 | An evaluation hash retains the configuration needed to reproduce it. | `configurationJson`, `ck_eval_configuration_shape` |
| 17 | Evaluation summary, label counts, calibration and release gate match the canonical artifact. | `bind_model_evaluation`, `assert_evaluation_evidence` |
| 18 | Labels follow the configured horizon, census and temporal split, and freeze at first review. | `bind_corpus_label` + review lock |
| 19 | Resolved labels retain the prediction needed to recompute metrics; censored labels do not. | `ck_corpus_label_prediction` |
| 20 | Promotion requires a releasable same-model evaluation, no rejection, and distinct attorney/Master-Admin approvals. | promotion trigger + composite FKs |
| 21 | Models start as candidates; promotion and retirement evidence can only be written by their lifecycle transitions. | registration/lifecycle triggers |
| 22 | Assessment reviewers are active EXPERT staff; promotion reviewer roles match active staff roles. | reviewer-role triggers |

Application code still enforces the rules that require artifact files, canonical encoding or the
`eval.ts` algorithms: full metric/calibration recomputation in §5.2, canonical `evaluationKey`
reproduction, artifact-file hash equality, model status before serving, and disclaimer currency.
Reviewer identity/role at insertion, approval quorum and aggregate count reconciliation are also
rechecked by the database. `packages/tm-data/src/scoring-evidence.integration.test.ts` exercises the
database half against PostgreSQL 16 in CI; a schema that merely applies is not sufficient evidence.

---

## 9. Change control

- The score scale, decimal precision, `0.5` accuracy threshold, label enums, artifact schema
  version, evidence tables and promotion quorum are **frozen**.
- A change requires: a new ADR, a version bump here, a migration, and a re-run of the full
  promotion checklist against a real corpus.
- Configuration-only values (release thresholds, horizon, seed, sample size) may change without a
  schema migration, but each change requires a new training run, artifact, candidate registration
  and `ModelEvaluation` rather than editing one. The `0.5` accuracy threshold is not
  configuration-only.
- This contract does not authorise bypassing `BOOTSTRAP_MODEL` in production. Activation requires
  M5a plus the owner's promotion decision.

---

## 10. Explicitly out of scope

- Corpus source, access, licensing, storage location and refresh cadence.
- Compute budget and the decision to run a real-corpus evaluation.
- Identity of the attorney reviewer.
- P5.4.2 execution-profile work.
- Model activation, deployment and rollout.

Those remain owner decisions. This contract only guarantees that when they are made, the evidence
they produce is representable, attributable, reviewable and impossible to quietly rewrite.
