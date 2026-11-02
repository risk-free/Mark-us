-- ---------------------------------------------------------------------------
-- Scoring and evidence contract invariants
-- Authority: docs/SCORING-EVIDENCE-CONTRACT.md (ADR D-32)
--
-- Prisma can express the columns but not CHECK constraints, partial unique
-- indexes, append-only triggers or reference rows. Everything below is part of
-- the contract, not an implementation detail.
-- ---------------------------------------------------------------------------

-- A client-visible score always names the model that produced it, and a
-- review verdict never exists without the score it reviewed.
ALTER TABLE "Trademark" ADD CONSTRAINT ck_trademark_score_model
  CHECK ("probabilityScore" IS NULL OR "probabilityModelId" IS NOT NULL);
ALTER TABLE "Trademark" ADD CONSTRAINT ck_trademark_review_triad
  CHECK (
    ("probabilityVerdict" IS NULL AND "probabilityReviewedById" IS NULL AND "probabilityReviewedAt" IS NULL)
    OR
    ("probabilityVerdict" IS NOT NULL AND "probabilityReviewedById" IS NOT NULL AND "probabilityReviewedAt" IS NOT NULL)
  );
ALTER TABLE "Trademark" ADD CONSTRAINT ck_trademark_verdict_has_score
  CHECK ("probabilityVerdict" IS NULL OR "probabilityScore" IS NOT NULL);

-- A degraded assessment stores NULL, never 0. A stored score is exactly
-- representable at 0.01 percentage-point resolution and always 0..1.
ALTER TABLE "TrademarkAssessment" ADD CONSTRAINT ck_assessment_score_coupling
  CHECK (("outcome" = 'SCORED') = ("pRegistration" IS NOT NULL));
ALTER TABLE "TrademarkAssessment" ADD CONSTRAINT ck_assessment_score_range
  CHECK ("pRegistration" IS NULL OR ("pRegistration" >= 0 AND "pRegistration" <= 1));
ALTER TABLE "TrademarkAssessment" ADD CONSTRAINT ck_assessment_disclaimer
  CHECK (length(btrim("disclaimerVersion")) > 0);
ALTER TABLE "TrademarkAssessment" ADD CONSTRAINT ck_assessment_corpus_snapshot
  CHECK ("outcome" = 'INSUFFICIENT_DATA' OR "corpusSnapshotAt" IS NOT NULL);

-- A trained artifact is complete at registration; non-trained descriptors
-- cannot acquire artifact/training evidence. Only a TRAINED model can be
-- promoted, and promotion binds the exact evaluation that justified it.
ALTER TABLE "ProbabilityModel" ADD CONSTRAINT ck_probability_model_identity
  CHECK (
    length(btrim("modelVersion")) > 0
    AND length(btrim("cohort")) > 0
    AND "labelHorizonMonths" > 0
  );
ALTER TABLE "ProbabilityModel" ADD CONSTRAINT ck_probability_model_trained_evidence
  CHECK (
    (
      "kind" = 'TRAINED'
      AND "artifactSchemaVersion" IS NOT NULL
      AND "artifactSchemaVersion" = 2
      AND "artifactSha256" IS NOT NULL
      AND "artifactJson" IS NOT NULL
      AND jsonb_typeof("artifactJson") = 'object'
      AND "trainingCutoff" IS NOT NULL
      AND "censusAt" IS NOT NULL
      AND "trainedAt" IS NOT NULL
    )
    OR
    (
      "kind" <> 'TRAINED'
      AND "artifactSchemaVersion" IS NULL
      AND "artifactSha256" IS NULL
      AND "artifactJson" IS NULL
      AND "trainingCutoff" IS NULL
      AND "censusAt" IS NULL
      AND "trainedAt" IS NULL
    )
  );
ALTER TABLE "ProbabilityModel" ADD CONSTRAINT ck_probability_model_hash_shape
  CHECK ("artifactSha256" IS NULL OR "artifactSha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "ProbabilityModel" ADD CONSTRAINT ck_probability_model_promoted_shape
  CHECK (
    "status" <> 'PROMOTED'
    OR (
      "kind" = 'TRAINED'
      AND "promotedAt" IS NOT NULL
      AND "promotedById" IS NOT NULL
      AND "promotedEvaluationId" IS NOT NULL
      AND "retiredAt" IS NULL
    )
  );
ALTER TABLE "ProbabilityModel" ADD CONSTRAINT ck_probability_model_unpromoted_shape
  CHECK (
    "status" NOT IN ('CANDIDATE', 'REJECTED')
    OR (
      "promotedAt" IS NULL
      AND "promotedById" IS NULL
      AND "promotedEvaluationId" IS NULL
      AND "retiredAt" IS NULL
    )
  );
ALTER TABLE "ProbabilityModel" ADD CONSTRAINT ck_probability_model_retired_shape
  CHECK (
    "status" <> 'RETIRED'
    OR (
      "kind" = 'TRAINED'
      AND "promotedAt" IS NOT NULL
      AND "promotedById" IS NOT NULL
      AND "promotedEvaluationId" IS NOT NULL
      AND "retiredAt" IS NOT NULL
    )
  );
CREATE UNIQUE INDEX ux_probability_model_one_promoted
  ON "ProbabilityModel" ("status") WHERE "status" = 'PROMOTED';

-- Registration always starts a candidate with no retrospective promotion or
-- retirement evidence. This also applies to the internal descriptor seeds.
CREATE OR REPLACE FUNCTION enforce_probability_model_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'CANDIDATE'
    OR NEW."promotedAt" IS NOT NULL
    OR NEW."promotedById" IS NOT NULL
    OR NEW."promotedEvaluationId" IS NOT NULL
    OR NEW."retiredAt" IS NOT NULL
  THEN
    RAISE EXCEPTION 'a ProbabilityModel must be registered as an unpromoted CANDIDATE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_probability_model_registration
  BEFORE INSERT ON "ProbabilityModel"
  FOR EACH ROW EXECUTE FUNCTION enforce_probability_model_insert();

-- These composite FKs make cross-model evaluation evidence unrepresentable.
-- ModelEvaluation (id, modelId) is unique in the Prisma schema.
ALTER TABLE "ProbabilityModel" ADD CONSTRAINT fk_promoted_model_evaluation
  FOREIGN KEY ("promotedEvaluationId", "id")
  REFERENCES "ModelEvaluation"("id", "modelId") ON DELETE RESTRICT;
ALTER TABLE "ModelPromotionReview" ADD CONSTRAINT fk_promotion_review_model_evaluation
  FOREIGN KEY ("evaluationId", "modelId")
  REFERENCES "ModelEvaluation"("id", "modelId") ON DELETE RESTRICT;

-- Evaluation evidence is internally consistent and replay-identifiable.
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_label_counts
  CHECK (
    "sampleSize" >= 0
    AND "positiveLabels" >= 0
    AND "negativeLabels" >= 0
    AND "censoredLabels" >= 0
    AND "sampleSize" = "positiveLabels" + "negativeLabels"
  );
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_metric_range
  CHECK (
    "auc" >= 0 AND "auc" <= 1
    AND "accuracy" >= 0 AND "accuracy" <= 1
    AND "baselineAccuracy" >= 0 AND "baselineAccuracy" <= 1
    AND "accuracyLiftPp" >= -100 AND "accuracyLiftPp" <= 100
    AND "ciHalfWidthPp" >= 0
  );
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_derived_metrics
  CHECK (
    abs("accuracyLiftPp" - (100 * ("accuracy" - "baselineAccuracy"))) <= 0.000000001
    AND (
      (
        "sampleSize" = 0
        AND "baselineAccuracy" = 0
        AND "ciHalfWidthPp" = 0
      )
      OR
      (
        "sampleSize" > 0
        AND abs(
          "baselineAccuracy"
          - (GREATEST("positiveLabels", "negativeLabels")::double precision / "sampleSize")
        ) <= 0.000000001
        AND abs(
          "ciHalfWidthPp"
          - (196 * sqrt(("accuracy" * (1 - "accuracy")) / "sampleSize"))
        ) <= 0.000000001
      )
    )
  );
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_thresholds
  CHECK (
    "labelHorizonMonths" > 0
    AND "minResolvedLabels" >= 0
    AND "maxCiHalfWidthPp" >= 0
    AND "minAuc" >= 0 AND "minAuc" <= 1
    AND "minLiftPp" >= -100 AND "minLiftPp" <= 100
  );
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_identifiers
  CHECK (
    "artifactSha256" ~ '^[0-9a-f]{64}$'
    AND "evaluationKey" ~ '^[0-9a-f]{64}$'
    AND "trainerCommit" ~ '^[0-9a-f]{40}$'
  );
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_artifact_schema
  CHECK ("artifactSchemaVersion" = 2);
-- Schema-v2 artifacts carry one holdout report. TRAIN labels are retained in
-- CorpusLabel, but a separate train-metrics evaluation is not contract v1.0.
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_holdout_only
  CHECK ("split" = 'HOLDOUT');
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_configuration_shape
  CHECK (
    jsonb_typeof("configurationJson") = 'object'
    AND "configurationJson" ?& ARRAY[
      'accuracyThreshold', 'artifactSha256', 'cohort', 'labelHorizonMonths',
      'maxExamples', 'modelVersion', 'samplingAlgorithm', 'seed', 'split',
      'thresholds', 'trainingCutoff', 'censusAt'
    ]
  );
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_evidence_shape
  CHECK (
    jsonb_typeof("calibrationJson") = 'array'
    AND jsonb_typeof("releaseReasons") = 'array'
    AND (
      ("releasable" AND "releaseReasons" = '[]'::jsonb)
      OR (NOT "releasable" AND "releaseReasons" <> '[]'::jsonb)
    )
  );
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_release_gate
  CHECK (
    NOT "releasable"
    OR (
      "split" = 'HOLDOUT'
      AND "minResolvedLabels" >= 500
      AND "maxCiHalfWidthPp" <= 5
      AND "minAuc" >= 0.70
      AND "minLiftPp" >= 10
      AND "sampleSize" >= "minResolvedLabels"
      AND "ciHalfWidthPp" <= "maxCiHalfWidthPp"
      AND "auc" >= "minAuc"
      AND "accuracyLiftPp" >= "minLiftPp"
    )
  );
-- Schema v2 is deliberately a releasable-artifact format: train.ts neither
-- emits nor parses a failed artifact. Contract v1.0 therefore has no failed
-- ModelEvaluation row; failed runs retain their reports in the trainer log.
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT ck_eval_schema_v2_releasable
  CHECK ("releasable");

-- An evaluation must describe the same immutable artifact and training
-- configuration as its registry row. Bootstrap/baseline have no evaluations.
CREATE OR REPLACE FUNCTION bind_model_evaluation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  model_row "ProbabilityModel"%ROWTYPE;
BEGIN
  SELECT * INTO model_row FROM "ProbabilityModel" WHERE "id" = NEW."modelId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ProbabilityModel % does not exist', NEW."modelId";
  END IF;
  IF model_row."kind" <> 'TRAINED' THEN
    RAISE EXCEPTION 'only a TRAINED ProbabilityModel can have an evaluation';
  END IF;
  IF model_row."status" <> 'CANDIDATE' THEN
    RAISE EXCEPTION 'evaluations can only be added to a CANDIDATE model';
  END IF;
  IF ROW(
    NEW."artifactSchemaVersion", NEW."artifactSha256", NEW."cohort",
    NEW."labelHorizonMonths", NEW."trainingCutoff", NEW."censusAt"
  ) IS DISTINCT FROM ROW(
    model_row."artifactSchemaVersion", model_row."artifactSha256", model_row."cohort",
    model_row."labelHorizonMonths", model_row."trainingCutoff", model_row."censusAt"
  ) THEN
    RAISE EXCEPTION 'evaluation does not match the model artifact and training configuration';
  END IF;

  -- The registered schema-v2 JSON, not a similarly named file, is canonical.
  IF ROW(
    (model_row."artifactJson"->>'schemaVersion')::integer,
    model_row."artifactJson"->>'modelVersion',
    (model_row."artifactJson"->>'trainingCutoff')::timestamptz,
    (model_row."artifactJson"->>'censusAt')::timestamptz,
    (model_row."artifactJson"->>'labelHorizonMonths')::integer,
    model_row."artifactJson"->'corpus'->>'cohort',
    (model_row."artifactJson"->'corpus'->>'seed')::bigint,
    (model_row."artifactJson"->'corpus'->>'maxExamples')::bigint,
    model_row."artifactJson"->'corpus'->>'samplingAlgorithm'
  ) IS DISTINCT FROM ROW(
    model_row."artifactSchemaVersion",
    model_row."modelVersion",
    model_row."trainingCutoff",
    model_row."censusAt",
    model_row."labelHorizonMonths",
    model_row."cohort",
    (NEW."configurationJson"->>'seed')::bigint,
    (NEW."configurationJson"->>'maxExamples')::bigint,
    NEW."configurationJson"->>'samplingAlgorithm'
  ) THEN
    RAISE EXCEPTION 'registered artifactJson does not match the model and evaluation configuration';
  END IF;

  -- configurationJson is not decorative: every value duplicated into a
  -- queryable column must describe this exact evaluation and model.
  IF ROW(
    NEW."configurationJson"->>'artifactSha256',
    NEW."configurationJson"->>'modelVersion',
    NEW."configurationJson"->>'cohort',
    (NEW."configurationJson"->>'labelHorizonMonths')::integer,
    NEW."configurationJson"->>'split',
    (NEW."configurationJson"->>'trainingCutoff')::timestamptz,
    (NEW."configurationJson"->>'censusAt')::timestamptz,
    (NEW."configurationJson"->'thresholds'->>'minResolvedLabels')::integer,
    (NEW."configurationJson"->'thresholds'->>'maxCiHalfWidthPp')::double precision,
    (NEW."configurationJson"->'thresholds'->>'minAuc')::double precision,
    (NEW."configurationJson"->'thresholds'->>'minLiftPp')::double precision
  ) IS DISTINCT FROM ROW(
    NEW."artifactSha256",
    model_row."modelVersion",
    NEW."cohort",
    NEW."labelHorizonMonths",
    NEW."split"::text,
    NEW."trainingCutoff",
    NEW."censusAt",
    NEW."minResolvedLabels",
    NEW."maxCiHalfWidthPp",
    NEW."minAuc",
    NEW."minLiftPp"
  ) THEN
    RAISE EXCEPTION 'configurationJson does not match the evaluation columns and model';
  END IF;

  IF NEW."configurationJson"->>'samplingAlgorithm' IS DISTINCT FROM 'hash-top-n-v1' THEN
    RAISE EXCEPTION 'unsupported evaluation samplingAlgorithm';
  END IF;
  IF (NEW."configurationJson"->>'accuracyThreshold')::double precision
    IS DISTINCT FROM 0.5::double precision
  THEN
    RAISE EXCEPTION 'contract v1.0 freezes accuracyThreshold at 0.5';
  END IF;
  IF (NEW."configurationJson"->>'maxExamples')::bigint IS NULL
    OR (NEW."configurationJson"->>'maxExamples')::bigint <= 0
  THEN
    RAISE EXCEPTION 'evaluation maxExamples must be positive';
  END IF;
  IF (NEW."configurationJson"->>'seed')::bigint IS NULL
    OR (NEW."configurationJson"->>'seed')::bigint NOT BETWEEN 0 AND 4294967295
  THEN
    RAISE EXCEPTION 'evaluation seed must be an unsigned 32-bit integer';
  END IF;

  -- A summary cannot be mixed with a different artifact's report or gate.
  IF ROW(
    (model_row."artifactJson"->'evalReport'->>'sampleSize')::integer,
    (model_row."artifactJson"->'evalReport'->>'auc')::double precision,
    (model_row."artifactJson"->'evalReport'->>'accuracy')::double precision,
    (model_row."artifactJson"->'evalReport'->>'baselineAccuracy')::double precision,
    (model_row."artifactJson"->'evalReport'->>'accuracyLiftPp')::double precision,
    (model_row."artifactJson"->'evalReport'->>'ciHalfWidthPp')::double precision,
    model_row."artifactJson"->'evalReport'->'buckets',
    (model_row."artifactJson"->'releaseGate'->>'releasable')::boolean,
    model_row."artifactJson"->'releaseGate'->'reasons',
    (model_row."artifactJson"->'releaseGate'->'thresholds'->>'minResolvedLabels')::integer,
    (model_row."artifactJson"->'releaseGate'->'thresholds'->>'maxCiHalfWidthPp')::double precision,
    (model_row."artifactJson"->'releaseGate'->'thresholds'->>'minAuc')::double precision,
    (model_row."artifactJson"->'releaseGate'->'thresholds'->>'minLiftPp')::double precision,
    (model_row."artifactJson"->'labelCounts'->'holdout'->>'positive')::integer,
    (model_row."artifactJson"->'labelCounts'->'holdout'->>'negative')::integer,
    (model_row."artifactJson"->'labelCounts'->>'censored')::integer
  ) IS DISTINCT FROM ROW(
    NEW."sampleSize", NEW."auc", NEW."accuracy", NEW."baselineAccuracy",
    NEW."accuracyLiftPp", NEW."ciHalfWidthPp", NEW."calibrationJson",
    NEW."releasable", NEW."releaseReasons", NEW."minResolvedLabels",
    NEW."maxCiHalfWidthPp", NEW."minAuc", NEW."minLiftPp",
    NEW."positiveLabels", NEW."negativeLabels", NEW."censoredLabels"
  ) THEN
    RAISE EXCEPTION 'evaluation metrics, labels or release gate do not match artifactJson';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_model_evaluation_binding
  BEFORE INSERT ON "ModelEvaluation"
  FOR EACH ROW EXECUTE FUNCTION bind_model_evaluation();

-- Censored is the absence of a resolution inside the horizon, not a negative.
-- Resolved labels retain the exact full-precision prediction used by eval.ts.
ALTER TABLE "CorpusLabel" ADD CONSTRAINT ck_corpus_label_resolution
  CHECK (("outcome" = 'CENSORED') = ("resolvedAt" IS NULL));
ALTER TABLE "CorpusLabel" ADD CONSTRAINT ck_corpus_label_prediction
  CHECK (("outcome" = 'CENSORED') = ("predictionScore" IS NULL));
ALTER TABLE "CorpusLabel" ADD CONSTRAINT ck_corpus_label_prediction_range
  CHECK ("predictionScore" IS NULL OR ("predictionScore" >= 0 AND "predictionScore" <= 1));
ALTER TABLE "CorpusLabel" ADD CONSTRAINT ck_corpus_label_dates
  CHECK (
    "horizonAt" >= "filingDate"
    AND (
      "resolvedAt" IS NULL
      OR ("resolvedAt" >= "filingDate" AND "resolvedAt" <= "horizonAt")
    )
  );
ALTER TABLE "CorpusLabel" ADD CONSTRAINT ck_corpus_label_serial
  CHECK (length(btrim("serialNumber")) > 0);
ALTER TABLE "CorpusLabel" ADD CONSTRAINT ck_corpus_label_source_status
  CHECK (length(btrim("sourceStatusCode")) > 0);

-- Labels follow the evaluation's horizon, census and temporal cutoff. All
-- writers lock model before evaluation, serialising status changes, label
-- insertion and the first review without lock-order inversion. Once any review
-- exists, its frozen evidence set cannot grow.
CREATE OR REPLACE FUNCTION bind_corpus_label() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  evaluation_row "ModelEvaluation"%ROWTYPE;
  evaluation_model_id text;
  model_status "ProbabilityModelStatus";
BEGIN
  -- The unlocked lookup only discovers the lock target. The locked evaluation
  -- read below verifies it before any evidence is accepted.
  SELECT "modelId" INTO evaluation_model_id FROM "ModelEvaluation"
    WHERE "id" = NEW."evaluationId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ModelEvaluation % does not exist', NEW."evaluationId";
  END IF;

  SELECT "status" INTO model_status FROM "ProbabilityModel"
    WHERE "id" = evaluation_model_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ProbabilityModel % does not exist', evaluation_model_id;
  END IF;
  SELECT * INTO evaluation_row FROM "ModelEvaluation"
    WHERE "id" = NEW."evaluationId" FOR UPDATE;
  IF evaluation_row."modelId" IS DISTINCT FROM evaluation_model_id THEN
    RAISE EXCEPTION 'evaluation model changed while binding a label';
  END IF;
  IF model_status <> 'CANDIDATE' THEN
    RAISE EXCEPTION 'labels can only be added while their model is a CANDIDATE';
  END IF;
  IF EXISTS (SELECT 1 FROM "ModelPromotionReview" WHERE "evaluationId" = NEW."evaluationId") THEN
    RAISE EXCEPTION 'the label set is frozen once promotion review starts';
  END IF;

  IF NEW."horizonAt" IS DISTINCT FROM
    (NEW."filingDate" + make_interval(months => evaluation_row."labelHorizonMonths"))::date
  THEN
    RAISE EXCEPTION 'label horizon does not match the evaluation labelHorizonMonths';
  END IF;
  IF (NEW."split" = 'TRAIN') IS DISTINCT FROM
    ((NEW."filingDate"::timestamp AT TIME ZONE 'UTC') < evaluation_row."trainingCutoff")
  THEN
    RAISE EXCEPTION 'label split does not match the evaluation trainingCutoff';
  END IF;
  -- labels.ts censors the entire row when its horizon has not elapsed, even
  -- if an early registration or abandonment date is already known.
  IF NEW."outcome" <> 'CENSORED'
    AND (NEW."horizonAt"::timestamp AT TIME ZONE 'UTC') > evaluation_row."censusAt"
  THEN
    RAISE EXCEPTION 'resolved label horizon has not elapsed at evaluation censusAt';
  END IF;
  IF NEW."resolvedAt" IS NOT NULL
    AND (NEW."resolvedAt"::timestamp AT TIME ZONE 'UTC') > evaluation_row."censusAt"
  THEN
    RAISE EXCEPTION 'resolved label falls after the evaluation censusAt';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_corpus_label_binding
  BEFORE INSERT ON "CorpusLabel"
  FOR EACH ROW EXECUTE FUNCTION bind_corpus_label();

-- An attorney override always carries its replacement score; a confirmation
-- carries none. Rationale is mandatory either way.
ALTER TABLE "AssessmentReview" ADD CONSTRAINT ck_assessment_review_override
  CHECK (("verdict" = 'OVERRIDDEN') = ("reviewedScore" IS NOT NULL));
ALTER TABLE "AssessmentReview" ADD CONSTRAINT ck_assessment_review_score_range
  CHECK ("reviewedScore" IS NULL OR ("reviewedScore" >= 0 AND "reviewedScore" <= 1));
ALTER TABLE "AssessmentReview" ADD CONSTRAINT ck_assessment_review_rationale
  CHECK (length(regexp_replace("rationale", '[[:space:]]', '', 'g')) >= 10);

-- The reviewer FK proves identity; this trigger proves that the identity was
-- an active attorney (EXPERT) when the immutable review was recorded.
CREATE OR REPLACE FUNCTION enforce_assessment_review_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  reviewer_role text;
  reviewer_status text;
BEGIN
  SELECT "role"::text, "status"::text INTO reviewer_role, reviewer_status
  FROM "StaffUser" WHERE "id" = NEW."reviewerId";
  IF NOT FOUND OR reviewer_status <> 'ACTIVE' OR reviewer_role <> 'EXPERT' THEN
    RAISE EXCEPTION 'assessment reviewer must be an ACTIVE EXPERT StaffUser';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assessment_review_reviewer_role
  BEFORE INSERT ON "AssessmentReview"
  FOR EACH ROW EXECUTE FUNCTION enforce_assessment_review_insert();

ALTER TABLE "ModelPromotionReview" ADD CONSTRAINT ck_promotion_review_rationale
  CHECK (length(regexp_replace("rationale", '[[:space:]]', '', 'g')) >= 10);
ALTER TABLE "ModelPromotionReview" ADD CONSTRAINT ck_promotion_review_spotcheck
  CHECK (
    (
      "reviewerRole" = 'ATTORNEY'
      AND "decision" = 'APPROVE'
      AND "spotCheckSampleSize" IS NOT NULL
      AND "spotCheckSampleSize" >= 50
      AND "spotCheckAgreementPct" IS NOT NULL
      AND "spotCheckAgreementPct" >= 0
      AND "spotCheckAgreementPct" <= 100
    )
    OR
    (
      ("reviewerRole" <> 'ATTORNEY' OR "decision" <> 'APPROVE')
      AND "spotCheckSampleSize" IS NULL
      AND "spotCheckAgreementPct" IS NULL
    )
  );

-- Reconcile the denormalised evaluation summary with its immutable rows before
-- any review or promotion. Application finalisation additionally recomputes
-- every metric and calibration bucket from predictionScore + outcome.
CREATE OR REPLACE FUNCTION assert_evaluation_evidence(evaluation_id text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  evaluation_row "ModelEvaluation"%ROWTYPE;
  model_row "ProbabilityModel"%ROWTYPE;
  evaluation_model_id text;
  actual_sample integer;
  actual_positive integer;
  actual_negative integer;
  actual_censored integer;
  actual_train_positive integer;
  actual_train_negative integer;
  calibration_count bigint;
BEGIN
  -- Use the same model-before-evaluation order as label/evaluation writers.
  -- A model UPDATE already holds its row lock before entering this function.
  SELECT "modelId" INTO evaluation_model_id FROM "ModelEvaluation" WHERE "id" = evaluation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ModelEvaluation % does not exist', evaluation_id;
  END IF;
  SELECT * INTO model_row FROM "ProbabilityModel" WHERE "id" = evaluation_model_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ProbabilityModel % does not exist', evaluation_model_id;
  END IF;
  SELECT * INTO evaluation_row FROM "ModelEvaluation" WHERE "id" = evaluation_id FOR UPDATE;
  IF evaluation_row."modelId" IS DISTINCT FROM evaluation_model_id THEN
    RAISE EXCEPTION 'evaluation model changed while checking evidence';
  END IF;

  SELECT
    count(*) FILTER (WHERE "split" = evaluation_row."split" AND "outcome" <> 'CENSORED')::integer,
    count(*) FILTER (WHERE "split" = evaluation_row."split" AND "outcome" = 'POSITIVE')::integer,
    count(*) FILTER (WHERE "split" = evaluation_row."split" AND "outcome" = 'NEGATIVE')::integer,
    count(*) FILTER (WHERE "outcome" = 'CENSORED')::integer,
    count(*) FILTER (WHERE "split" = 'TRAIN' AND "outcome" = 'POSITIVE')::integer,
    count(*) FILTER (WHERE "split" = 'TRAIN' AND "outcome" = 'NEGATIVE')::integer
  INTO
    actual_sample, actual_positive, actual_negative, actual_censored,
    actual_train_positive, actual_train_negative
  FROM "CorpusLabel" WHERE "evaluationId" = evaluation_id;

  IF ROW(actual_sample, actual_positive, actual_negative, actual_censored)
    IS DISTINCT FROM ROW(
      evaluation_row."sampleSize", evaluation_row."positiveLabels",
      evaluation_row."negativeLabels", evaluation_row."censoredLabels"
    )
  THEN
    RAISE EXCEPTION 'evaluation label counts do not reconcile with CorpusLabel rows';
  END IF;
  IF ROW(actual_train_positive, actual_train_negative) IS DISTINCT FROM ROW(
    (model_row."artifactJson"->'labelCounts'->'train'->>'positive')::integer,
    (model_row."artifactJson"->'labelCounts'->'train'->>'negative')::integer
  ) THEN
    RAISE EXCEPTION 'training label counts do not reconcile with artifactJson';
  END IF;

  SELECT COALESCE(sum((bucket->>'n')::integer), 0) INTO calibration_count
  FROM jsonb_array_elements(evaluation_row."calibrationJson") AS bucket;
  IF calibration_count <> evaluation_row."sampleSize" THEN
    RAISE EXCEPTION 'calibration bucket counts do not reconcile with sampleSize';
  END IF;
END;
$$;

-- Reviews are limited to the actual staff role at review time, on a candidate
-- and its fully reconciled evidence set. The first review freezes the labels.
CREATE OR REPLACE FUNCTION enforce_promotion_review_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  evaluation_row "ModelEvaluation"%ROWTYPE;
  model_row "ProbabilityModel"%ROWTYPE;
  reviewer_role text;
  reviewer_status text;
BEGIN
  PERFORM assert_evaluation_evidence(NEW."evaluationId");
  SELECT * INTO evaluation_row FROM "ModelEvaluation" WHERE "id" = NEW."evaluationId";
  IF evaluation_row."modelId" IS DISTINCT FROM NEW."modelId" THEN
    RAISE EXCEPTION 'promotion review and evaluation belong to different models';
  END IF;
  SELECT * INTO model_row FROM "ProbabilityModel" WHERE "id" = NEW."modelId";
  IF model_row."status" <> 'CANDIDATE' THEN
    RAISE EXCEPTION 'promotion reviews are only accepted for a CANDIDATE model';
  END IF;

  SELECT "role"::text, "status"::text INTO reviewer_role, reviewer_status
  FROM "StaffUser" WHERE "id" = NEW."reviewerId";
  IF NOT FOUND OR reviewer_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'promotion reviewer must be an ACTIVE StaffUser';
  END IF;
  IF (NEW."reviewerRole" = 'ATTORNEY' AND reviewer_role <> 'EXPERT')
    OR (NEW."reviewerRole" = 'MASTER_ADMIN' AND reviewer_role <> 'MASTER_ADMIN')
  THEN
    RAISE EXCEPTION 'reviewerRole does not match the StaffUser role';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_promotion_review_binding
  BEFORE INSERT ON "ModelPromotionReview"
  FOR EACH ROW EXECUTE FUNCTION enforce_promotion_review_insert();

-- Evidence rows are append-only. Corrections are new rows, never edits,
-- deletes or truncation. The model registry allows lifecycle UPDATEs below,
-- but its rows cannot be deleted or truncated.
CREATE OR REPLACE FUNCTION reject_protected_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is protected evidence; this mutation is not permitted', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER trg_trademark_assessment_append_only
  BEFORE UPDATE OR DELETE ON "TrademarkAssessment"
  FOR EACH ROW EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_trademark_assessment_no_truncate
  BEFORE TRUNCATE ON "TrademarkAssessment"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_assessment_review_append_only
  BEFORE UPDATE OR DELETE ON "AssessmentReview"
  FOR EACH ROW EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_assessment_review_no_truncate
  BEFORE TRUNCATE ON "AssessmentReview"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_model_evaluation_append_only
  BEFORE UPDATE OR DELETE ON "ModelEvaluation"
  FOR EACH ROW EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_model_evaluation_no_truncate
  BEFORE TRUNCATE ON "ModelEvaluation"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_corpus_label_append_only
  BEFORE UPDATE OR DELETE ON "CorpusLabel"
  FOR EACH ROW EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_corpus_label_no_truncate
  BEFORE TRUNCATE ON "CorpusLabel"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_model_promotion_review_append_only
  BEFORE UPDATE OR DELETE ON "ModelPromotionReview"
  FOR EACH ROW EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_model_promotion_review_no_truncate
  BEFORE TRUNCATE ON "ModelPromotionReview"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_probability_model_no_delete
  BEFORE DELETE ON "ProbabilityModel"
  FOR EACH ROW EXECUTE FUNCTION reject_protected_evidence_mutation();
CREATE TRIGGER trg_probability_model_no_truncate
  BEFORE TRUNCATE ON "ProbabilityModel"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_protected_evidence_mutation();

-- Artifact identity and training evidence never change. Promotion/retirement
-- metadata is written only by its lifecycle transition. Promotion rechecks the
-- exact evaluation, frozen labels, release gate and two-role approval quorum.
CREATE OR REPLACE FUNCTION enforce_probability_model_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  evaluation_row "ModelEvaluation"%ROWTYPE;
  approval_count integer;
  promoter_role text;
BEGIN
  IF ROW(
    OLD."id", OLD."modelVersion", OLD."kind", OLD."artifactSchemaVersion",
    OLD."artifactSha256", OLD."artifactJson", OLD."cohort",
    OLD."labelHorizonMonths", OLD."trainingCutoff", OLD."censusAt",
    OLD."trainedAt", OLD."createdAt"
  ) IS DISTINCT FROM ROW(
    NEW."id", NEW."modelVersion", NEW."kind", NEW."artifactSchemaVersion",
    NEW."artifactSha256", NEW."artifactJson", NEW."cohort",
    NEW."labelHorizonMonths", NEW."trainingCutoff", NEW."censusAt",
    NEW."trainedAt", NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'ProbabilityModel artifact identity and training evidence are immutable';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status"
    AND NOT (
      (OLD."status" = 'CANDIDATE' AND NEW."status" IN ('REJECTED', 'PROMOTED'))
      OR (OLD."status" = 'PROMOTED' AND NEW."status" = 'RETIRED')
    )
  THEN
    RAISE EXCEPTION 'invalid ProbabilityModel lifecycle transition: % -> %', OLD."status", NEW."status";
  END IF;

  IF ROW(OLD."promotedAt", OLD."promotedById", OLD."promotedEvaluationId")
    IS DISTINCT FROM ROW(NEW."promotedAt", NEW."promotedById", NEW."promotedEvaluationId")
    AND NOT (OLD."status" = 'CANDIDATE' AND NEW."status" = 'PROMOTED')
  THEN
    RAISE EXCEPTION 'promotion evidence can only be set by CANDIDATE -> PROMOTED';
  END IF;
  IF OLD."retiredAt" IS DISTINCT FROM NEW."retiredAt"
    AND NOT (OLD."status" = 'PROMOTED' AND NEW."status" = 'RETIRED')
  THEN
    RAISE EXCEPTION 'retiredAt can only be set by PROMOTED -> RETIRED';
  END IF;

  IF OLD."status" = 'CANDIDATE' AND NEW."status" = 'PROMOTED' THEN
    PERFORM assert_evaluation_evidence(NEW."promotedEvaluationId");
    SELECT * INTO evaluation_row FROM "ModelEvaluation" WHERE "id" = NEW."promotedEvaluationId";
    IF evaluation_row."modelId" IS DISTINCT FROM NEW."id" OR NOT evaluation_row."releasable" THEN
      RAISE EXCEPTION 'promotion requires a releasable evaluation of the same model';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "ModelPromotionReview"
      WHERE "evaluationId" = NEW."promotedEvaluationId" AND "decision" = 'REJECT'
    ) THEN
      RAISE EXCEPTION 'an evaluation with a REJECT review cannot be promoted';
    END IF;

    SELECT count(DISTINCT "reviewerId") INTO approval_count
    FROM "ModelPromotionReview"
    WHERE "evaluationId" = NEW."promotedEvaluationId" AND "decision" = 'APPROVE';
    IF approval_count < 2
      OR NOT EXISTS (
        SELECT 1 FROM "ModelPromotionReview"
        WHERE "evaluationId" = NEW."promotedEvaluationId"
          AND "decision" = 'APPROVE' AND "reviewerRole" = 'ATTORNEY'
      )
      OR NOT EXISTS (
        SELECT 1 FROM "ModelPromotionReview"
        WHERE "evaluationId" = NEW."promotedEvaluationId"
          AND "decision" = 'APPROVE' AND "reviewerRole" = 'MASTER_ADMIN'
      )
    THEN
      RAISE EXCEPTION 'promotion requires distinct ATTORNEY and MASTER_ADMIN approvals';
    END IF;

    SELECT "role"::text INTO promoter_role FROM "StaffUser" WHERE "id" = NEW."promotedById";
    IF promoter_role IS DISTINCT FROM 'MASTER_ADMIN' THEN
      RAISE EXCEPTION 'promotedById must name a MASTER_ADMIN StaffUser';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_probability_model_immutable_evidence
  BEFORE UPDATE ON "ProbabilityModel"
  FOR EACH ROW EXECUTE FUNCTION enforce_probability_model_update();

-- Reference descriptors required before any assessment can be persisted.
-- Both are in-code scorers: no artifact hash, and neither can be promoted.
INSERT INTO "ProbabilityModel"
  ("id", "modelVersion", "kind", "status", "cohort", "labelHorizonMonths", "notes")
VALUES
  (
    'pm_bootstrap_0_1_0',
    'bootstrap-0.1.0',
    'BOOTSTRAP',
    'CANDIDATE',
    'bootstrap',
    12,
    'In-code cold-start scorer. Internal only; never client-servable.'
  ),
  (
    'pm_baseline_base_rate',
    'baseline-base-rate',
    'BASELINE',
    'CANDIDATE',
    'base-rate-comparator',
    12,
    'Constant base-rate comparator used by M5a lift. Never promotable.'
  )
ON CONFLICT ("modelVersion") DO NOTHING;
