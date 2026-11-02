-- GENERATED FILE — do not edit.
-- Rebuild with: pnpm --filter @markus/db db:build-migration
-- Sources: prisma/schema.prisma + prisma/migrations/0P3__p0_3_backlog/fragments/*.sql
-- Authority: docs/architecture/02-data-model.md (ARCH-02) §5, §7

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MASTER_ADMIN', 'EXPERT', 'SALESPERSON');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'QUALIFIED', 'ONBOARDING', 'ACTIVE', 'DORMANT');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ASSIGNED', 'CONTACTED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'ASSESSED', 'PROPOSAL', 'PAYMENT', 'FILED', 'REGISTERED', 'AFTERSALE');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WECOM_KF', 'WECOM_CONTACT', 'WEB_WIDGET');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'WAITING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LineKind" AS ENUM ('SERVICE_FEE', 'USPTO_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PAYPAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'ALIPAY', 'WECHAT_PAY', 'PAYPAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_ACTION', 'SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TrademarkStatus" AS ENUM ('ASSESSING', 'DRAFT', 'FILED', 'REGISTERED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'USPTO_ASSIGNED', 'OFFICE_ACTION', 'RESPONSE_FILED', 'PUBLISHED', 'REGISTERED', 'ABANDONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('SESSION_ARCHIVE', 'PIPL_PRIVACY', 'MARKETING');

-- CreateEnum
CREATE TYPE "DocKind" AS ENUM ('IDENTITY', 'SPECIMEN', 'POWER_OF_ATTORNEY', 'CORRESPONDENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WECHAT', 'EMAIL', 'PORTAL');

-- CreateEnum
CREATE TYPE "ProbabilityModelKind" AS ENUM ('BOOTSTRAP', 'TRAINED', 'BASELINE');

-- CreateEnum
CREATE TYPE "ProbabilityModelStatus" AS ENUM ('CANDIDATE', 'PROMOTED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ProbabilityVerdict" AS ENUM ('CONFIRMED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "AssessmentOutcome" AS ENUM ('SCORED', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "CorpusLabelOutcome" AS ENUM ('POSITIVE', 'NEGATIVE', 'CENSORED');

-- CreateEnum
CREATE TYPE "EvaluationSplit" AS ENUM ('TRAIN', 'HOLDOUT');

-- CreateEnum
CREATE TYPE "PromotionDecision" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "PromotionReviewerRole" AS ENUM ('ATTORNEY', 'MASTER_ADMIN');

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'SALESPERSON',
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Hong_Kong',
    "wecomUserid" TEXT,
    "lastLoginAt" TIMESTAMPTZ(3),
    "usptoUsername" TEXT,
    "usptoPasswordCipher" BYTEA,
    "usptoKeyVersion" INTEGER,
    "usptoVaultUpdatedAt" TIMESTAMPTZ(3),
    "totpSecretCipher" BYTEA,
    "totpEnabledAt" TIMESTAMPTZ(3),
    "vaultStepUpAt" TIMESTAMPTZ(3),
    "vaultRotatedAt" TIMESTAMPTZ(3),
    "disabledAt" TIMESTAMPTZ(3),
    "lastAssignedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "wechatAlias" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ContactStatus" NOT NULL DEFAULT 'NEW',
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "assignedSalespersonId" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "contactId" TEXT,
    "assignedSalespersonId" TEXT,
    "assignedAt" TIMESTAMPTZ(3),
    "assignedById" TEXT,
    "assignedBy" TEXT,
    "reassignReason" TEXT,
    "convertedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "handledByStaff" BOOLEAN NOT NULL DEFAULT false,
    "resolution" TEXT,
    "sentiment" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "wecomSessionId" TEXT,
    "lastMessageAt" TIMESTAMPTZ(3),
    "contactId" TEXT NOT NULL,
    "assignedSalespersonId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "wecomMsgid" TEXT,
    "redactedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeComLink" (
    "id" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "WeComLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'portal',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestIp" TEXT,
    "requestUa" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactId" TEXT NOT NULL,
    "issuedById" TEXT,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trademark" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageText" TEXT,
    "niceClass" INTEGER NOT NULL,
    "goodsServices" TEXT NOT NULL,
    "status" "TrademarkStatus" NOT NULL DEFAULT 'ASSESSING',
    "filingBasis" TEXT,
    "serialNumber" TEXT,
    "registrationNumber" TEXT,
    "filedAt" TIMESTAMPTZ(3),
    "filedDate" TEXT,
    "registeredAt" TIMESTAMPTZ(3),
    "registrationDate" TEXT,
    "probabilityScore" DECIMAL(5,4),
    "probabilityModelId" TEXT,
    "probabilityReviewedAt" TIMESTAMPTZ(3),
    "probabilityReviewedById" TEXT,
    "probabilityVerdict" "ProbabilityVerdict",
    "corpusStatus" TEXT,
    "consentForCorpusAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Trademark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "filingBasis" TEXT,
    "filedAt" TIMESTAMPTZ(3),
    "filedDate" TEXT,
    "filingMethod" TEXT NOT NULL DEFAULT 'ATTENDED',
    "filingSessionId" TEXT,
    "filingStartedAt" TIMESTAMPTZ(3),
    "filingChecklist" JSONB,
    "receiptKey" TEXT,
    "filedById" TEXT,
    "responseDeadline" TIMESTAMPTZ(3),
    "responseDeadlineDate" TEXT,
    "nextReminderAt" TIMESTAMPTZ(3),
    "tsdrLastSyncAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "trademarkId" TEXT NOT NULL,
    "expertAssignedId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeAction" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "usptoActionCode" TEXT,
    "issuedAt" TIMESTAMPTZ(3),
    "responseDeadline" TIMESTAMPTZ(3),
    "responseDeadlineDate" TEXT,
    "rawActionKey" TEXT,
    "bodyText" TEXT,
    "analysis" JSONB,
    "responseFiledAt" TIMESTAMPTZ(3),
    "approvedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "applicationId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OfficeAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "kind" "DocKind" NOT NULL DEFAULT 'OTHER',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "checksum" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMPTZ(3),
    "contactId" TEXT NOT NULL,
    "trademarkId" TEXT,
    "applicationId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "mimeType" TEXT,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ocrText" TEXT,
    "proofreadStatus" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "uploadedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "priceListVersion" TEXT,
    "contactId" TEXT NOT NULL,
    "trademarkId" TEXT,
    "applicationId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "displayRateCny" DECIMAL(12,6),
    "displayRateAsOf" TIMESTAMPTZ(3),
    "displayRateSource" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "LineKind" NOT NULL DEFAULT 'SERVICE_FEE',
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "refundable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "niceClass" INTEGER,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "pdfKey" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingName" TEXT NOT NULL,
    "billingEmail" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "dueAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "provider" "PaymentProvider" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_ACTION',
    "transactionId" TEXT,
    "providerEventId" TEXT,
    "idempotencyKey" TEXT,
    "rawEvent" JSONB,
    "paidAt" TIMESTAMPTZ(3),
    "refundedAt" TIMESTAMPTZ(3),
    "orderId" TEXT,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "providerRefundId" TEXT,
    "reason" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundAllocation" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "refundId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,

    CONSTRAINT "RefundAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "rawBodyRetainedUntil" TIMESTAMPTZ(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" BIGSERIAL NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "traceId" TEXT,
    "requestId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMPTZ(3),
    "replayedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProbabilityModel" (
    "id" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "kind" "ProbabilityModelKind" NOT NULL,
    "status" "ProbabilityModelStatus" NOT NULL DEFAULT 'CANDIDATE',
    "artifactSchemaVersion" INTEGER,
    "artifactSha256" CHAR(64),
    "artifactJson" JSONB,
    "cohort" TEXT NOT NULL DEFAULT 'live-v1',
    "labelHorizonMonths" INTEGER NOT NULL DEFAULT 12,
    "trainingCutoff" TIMESTAMPTZ(3),
    "censusAt" TIMESTAMPTZ(3),
    "trainedAt" TIMESTAMPTZ(3),
    "promotedAt" TIMESTAMPTZ(3),
    "promotedById" TEXT,
    "promotedEvaluationId" TEXT,
    "retiredAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProbabilityModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelEvaluation" (
    "id" TEXT NOT NULL,
    "evaluationKey" CHAR(64) NOT NULL,
    "modelId" TEXT NOT NULL,
    "cohort" TEXT NOT NULL,
    "labelHorizonMonths" INTEGER NOT NULL,
    "trainingCutoff" TIMESTAMPTZ(3) NOT NULL,
    "censusAt" TIMESTAMPTZ(3) NOT NULL,
    "split" "EvaluationSplit" NOT NULL DEFAULT 'HOLDOUT',
    "artifactSchemaVersion" INTEGER NOT NULL,
    "artifactSha256" CHAR(64) NOT NULL,
    "configurationJson" JSONB NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "positiveLabels" INTEGER NOT NULL,
    "negativeLabels" INTEGER NOT NULL,
    "censoredLabels" INTEGER NOT NULL,
    "auc" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "baselineAccuracy" DOUBLE PRECISION NOT NULL,
    "accuracyLiftPp" DOUBLE PRECISION NOT NULL,
    "ciHalfWidthPp" DOUBLE PRECISION NOT NULL,
    "calibrationJson" JSONB NOT NULL,
    "minResolvedLabels" INTEGER NOT NULL,
    "maxCiHalfWidthPp" DOUBLE PRECISION NOT NULL,
    "minAuc" DOUBLE PRECISION NOT NULL,
    "minLiftPp" DOUBLE PRECISION NOT NULL,
    "releasable" BOOLEAN NOT NULL,
    "releaseReasons" JSONB NOT NULL,
    "trainerCommit" CHAR(40) NOT NULL,
    "executedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedById" TEXT,

    CONSTRAINT "ModelEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorpusLabel" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "outcome" "CorpusLabelOutcome" NOT NULL,
    "split" "EvaluationSplit" NOT NULL,
    "predictionScore" DOUBLE PRECISION,
    "filingDate" DATE NOT NULL,
    "horizonAt" DATE NOT NULL,
    "resolvedAt" DATE,
    "sourceStatusCode" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorpusLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPromotionReview" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerRole" "PromotionReviewerRole" NOT NULL,
    "decision" "PromotionDecision" NOT NULL,
    "spotCheckSampleSize" INTEGER,
    "spotCheckAgreementPct" DOUBLE PRECISION,
    "spotCheckNotes" TEXT,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelPromotionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrademarkAssessment" (
    "id" TEXT NOT NULL,
    "trademarkId" TEXT NOT NULL,
    "outcome" "AssessmentOutcome" NOT NULL DEFAULT 'SCORED',
    "pRegistration" DECIMAL(5,4),
    "subSignals" JSONB NOT NULL,
    "modelId" TEXT NOT NULL,
    "disclaimerVersion" TEXT NOT NULL,
    "featureSnapshot" JSONB NOT NULL,
    "corpusSnapshotAt" TIMESTAMPTZ(3),
    "corpusIngestRunId" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrademarkAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentReview" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "verdict" "ProbabilityVerdict" NOT NULL,
    "reviewedScore" DECIMAL(5,4),
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmCorpusMark" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "markText" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "statusCode" TEXT NOT NULL,
    "filingDate" DATE,
    "registrationDate" DATE,
    "abandonDate" DATE,
    "goodsSummary" TEXT,
    "sourceFile" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMPTZ(3),
    "ingestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingestRunId" TEXT,

    CONSTRAINT "TmCorpusMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmCorpusClass" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "TmCorpusClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmCorpusMarkClass" (
    "markId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "TmCorpusMarkClass_pkey" PRIMARY KEY ("markId","classId")
);

-- CreateTable
CREATE TABLE "TmSimilarity" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "corpusMarkId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "computedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TmSimilarity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmIngestRun" (
    "id" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "filesProcessed" INTEGER NOT NULL DEFAULT 0,
    "marksUpserted" INTEGER NOT NULL DEFAULT 0,
    "marksSkipped" INTEGER NOT NULL DEFAULT 0,
    "marksImported" INTEGER NOT NULL DEFAULT 0,
    "marksUpdated" INTEGER NOT NULL DEFAULT 0,
    "marksRejected" INTEGER NOT NULL DEFAULT 0,
    "errorLog" JSONB,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TmIngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentState" (
    "staffId" TEXT NOT NULL,
    "activeLeads" INTEGER NOT NULL DEFAULT 0,
    "lastAssignedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssignmentState_pkey" PRIMARY KEY ("staffId")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
    "allowedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedById" TEXT,
    "note" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "CSTicket" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "assignedToId" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "satisfactionScore" INTEGER,
    "slaDueAt" TIMESTAMPTZ(3),
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CSTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'GENERAL',
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "template" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "contactId" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "requestId" TEXT,
    "traceId" TEXT,
    "outcome" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "evidence" TEXT,
    "ip" TEXT,
    "policyVersion" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffId" TEXT,
    "contactId" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "budget" DECIMAL(12,2) NOT NULL,
    "spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_wecomUserid_key" ON "StaffUser"("wecomUserid");

-- CreateIndex
CREATE INDEX "StaffUser_role_status_idx" ON "StaffUser"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_email_key" ON "Contact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_phone_key" ON "Contact"("phone");

-- CreateIndex
CREATE INDEX "Contact_assignedSalespersonId_stage_idx" ON "Contact"("assignedSalespersonId", "stage");

-- CreateIndex
CREATE INDEX "Contact_stage_idx" ON "Contact"("stage");

-- CreateIndex
CREATE INDEX "Contact_deletedAt_idx" ON "Contact"("deletedAt");

-- CreateIndex
CREATE INDEX "Lead_assignedSalespersonId_status_createdAt_idx" ON "Lead"("assignedSalespersonId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_contactId_idx" ON "Lead"("contactId");

-- CreateIndex
CREATE INDEX "Conversation_assignedSalespersonId_status_lastMessageAt_idx" ON "Conversation"("assignedSalespersonId", "status", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Conversation_contactId_idx" ON "Conversation"("contactId");

-- CreateIndex
CREATE INDEX "Conversation_status_idx" ON "Conversation"("status");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeComLink_externalUserId_key" ON "WeComLink"("externalUserId");

-- CreateIndex
CREATE INDEX "WeComLink_contactId_idx" ON "WeComLink"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLinkToken_contactId_createdAt_idx" ON "MagicLinkToken"("contactId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trademark_serialNumber_key" ON "Trademark"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Trademark_registrationNumber_key" ON "Trademark"("registrationNumber");

-- CreateIndex
CREATE INDEX "Trademark_contactId_idx" ON "Trademark"("contactId");

-- CreateIndex
CREATE INDEX "Trademark_niceClass_status_idx" ON "Trademark"("niceClass", "status");

-- CreateIndex
CREATE INDEX "Trademark_status_idx" ON "Trademark"("status");

-- CreateIndex
CREATE INDEX "Trademark_deletedAt_idx" ON "Trademark"("deletedAt");

-- CreateIndex
CREATE INDEX "Trademark_probabilityModelId_idx" ON "Trademark"("probabilityModelId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_serialNumber_key" ON "Application"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Application_filingSessionId_key" ON "Application"("filingSessionId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_nextReminderAt_idx" ON "Application"("nextReminderAt");

-- CreateIndex
CREATE INDEX "Application_expertAssignedId_status_idx" ON "Application"("expertAssignedId", "status");

-- CreateIndex
CREATE INDEX "Application_responseDeadline_idx" ON "Application"("responseDeadline");

-- CreateIndex
CREATE INDEX "OfficeAction_applicationId_idx" ON "OfficeAction"("applicationId");

-- CreateIndex
CREATE INDEX "OfficeAction_responseDeadline_idx" ON "OfficeAction"("responseDeadline");

-- CreateIndex
CREATE INDEX "Document_contactId_idx" ON "Document"("contactId");

-- CreateIndex
CREATE INDEX "Document_trademarkId_idx" ON "Document"("trademarkId");

-- CreateIndex
CREATE INDEX "Document_applicationId_idx" ON "Document"("applicationId");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNo_key" ON "DocumentVersion"("documentId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_checksum_key" ON "DocumentVersion"("documentId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_contactId_createdAt_idx" ON "Order"("contactId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_trademarkId_idx" ON "Order"("trademarkId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_orderId_idx" ON "InvoiceLineItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLineItem_orderId_sortOrder_key" ON "InvoiceLineItem"("orderId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerEventId_key" ON "Payment"("providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_contactId_idx" ON "Payment"("contactId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "Refund"("providerRefundId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_createdAt_idx" ON "Refund"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RefundAllocation_refundId_lineItemId_key" ON "RefundAllocation"("refundId", "lineItemId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_id_idx" ON "OutboxEvent"("publishedAt", "id");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "ProbabilityModel_modelVersion_key" ON "ProbabilityModel"("modelVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ProbabilityModel_promotedEvaluationId_key" ON "ProbabilityModel"("promotedEvaluationId");

-- CreateIndex
CREATE INDEX "ProbabilityModel_status_idx" ON "ProbabilityModel"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ModelEvaluation_evaluationKey_key" ON "ModelEvaluation"("evaluationKey");

-- CreateIndex
CREATE INDEX "ModelEvaluation_modelId_executedAt_idx" ON "ModelEvaluation"("modelId", "executedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ModelEvaluation_id_modelId_key" ON "ModelEvaluation"("id", "modelId");

-- CreateIndex
CREATE INDEX "CorpusLabel_evaluationId_outcome_idx" ON "CorpusLabel"("evaluationId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "CorpusLabel_evaluationId_serialNumber_key" ON "CorpusLabel"("evaluationId", "serialNumber");

-- CreateIndex
CREATE INDEX "ModelPromotionReview_evaluationId_decision_idx" ON "ModelPromotionReview"("evaluationId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPromotionReview_evaluationId_reviewerId_key" ON "ModelPromotionReview"("evaluationId", "reviewerId");

-- CreateIndex
CREATE INDEX "TrademarkAssessment_trademarkId_createdAt_idx" ON "TrademarkAssessment"("trademarkId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TrademarkAssessment_modelId_idx" ON "TrademarkAssessment"("modelId");

-- CreateIndex
CREATE UNIQUE INDEX "TrademarkAssessment_trademarkId_modelId_createdAt_key" ON "TrademarkAssessment"("trademarkId", "modelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentReview_assessmentId_key" ON "AssessmentReview"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentReview_reviewerId_createdAt_idx" ON "AssessmentReview"("reviewerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TmCorpusMark_serialNumber_key" ON "TmCorpusMark"("serialNumber");

-- CreateIndex
CREATE INDEX "TmCorpusMark_statusCode_filingDate_idx" ON "TmCorpusMark"("statusCode", "filingDate" DESC);

-- CreateIndex
CREATE INDEX "TmCorpusMark_ingestedAt_idx" ON "TmCorpusMark"("ingestedAt");

-- CreateIndex
CREATE INDEX "TmCorpusMark_ingestRunId_idx" ON "TmCorpusMark"("ingestRunId");

-- CreateIndex
CREATE INDEX "TmCorpusMarkClass_classId_idx" ON "TmCorpusMarkClass"("classId");

-- CreateIndex
CREATE INDEX "TmSimilarity_assessmentId_score_idx" ON "TmSimilarity"("assessmentId", "score" DESC);

-- CreateIndex
CREATE INDEX "TmSimilarity_corpusMarkId_idx" ON "TmSimilarity"("corpusMarkId");

-- CreateIndex
CREATE UNIQUE INDEX "TmSimilarity_assessmentId_corpusMarkId_method_key" ON "TmSimilarity"("assessmentId", "corpusMarkId", "method");

-- CreateIndex
CREATE INDEX "TmIngestRun_status_startedAt_idx" ON "TmIngestRun"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TmIngestRun_runDate_key" ON "TmIngestRun"("runDate");

-- CreateIndex
CREATE INDEX "AssignmentState_activeLeads_lastAssignedAt_idx" ON "AssignmentState"("activeLeads", "lastAssignedAt");

-- CreateIndex
CREATE INDEX "CSTicket_contactId_idx" ON "CSTicket"("contactId");

-- CreateIndex
CREATE INDEX "CSTicket_status_slaDueAt_idx" ON "CSTicket"("status", "slaDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Notification_userId_status_createdAt_idx" ON "Notification"("userId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_contactId_createdAt_idx" ON "Notification"("contactId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_channel_key" ON "NotificationPreference"("userId", "channel");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ConsentRecord_contactId_kind_idx" ON "ConsentRecord"("contactId", "kind");

-- CreateIndex
CREATE INDEX "ConsentRecord_staffId_kind_idx" ON "ConsentRecord"("staffId", "kind");

-- CreateIndex
CREATE INDEX "Campaign_period_idx" ON "Campaign"("period");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_assignedSalespersonId_fkey" FOREIGN KEY ("assignedSalespersonId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedSalespersonId_fkey" FOREIGN KEY ("assignedSalespersonId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedSalespersonId_fkey" FOREIGN KEY ("assignedSalespersonId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeComLink" ADD CONSTRAINT "WeComLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trademark" ADD CONSTRAINT "Trademark_probabilityModelId_fkey" FOREIGN KEY ("probabilityModelId") REFERENCES "ProbabilityModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trademark" ADD CONSTRAINT "Trademark_probabilityReviewedById_fkey" FOREIGN KEY ("probabilityReviewedById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trademark" ADD CONSTRAINT "Trademark_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_trademarkId_fkey" FOREIGN KEY ("trademarkId") REFERENCES "Trademark"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_expertAssignedId_fkey" FOREIGN KEY ("expertAssignedId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeAction" ADD CONSTRAINT "OfficeAction_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_trademarkId_fkey" FOREIGN KEY ("trademarkId") REFERENCES "Trademark"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_trademarkId_fkey" FOREIGN KEY ("trademarkId") REFERENCES "Trademark"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundAllocation" ADD CONSTRAINT "RefundAllocation_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "InvoiceLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbabilityModel" ADD CONSTRAINT "ProbabilityModel_promotedById_fkey" FOREIGN KEY ("promotedById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProbabilityModel" ADD CONSTRAINT "ProbabilityModel_promotedEvaluationId_fkey" FOREIGN KEY ("promotedEvaluationId") REFERENCES "ModelEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT "ModelEvaluation_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ProbabilityModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorpusLabel" ADD CONSTRAINT "CorpusLabel_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "ModelEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPromotionReview" ADD CONSTRAINT "ModelPromotionReview_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ProbabilityModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPromotionReview" ADD CONSTRAINT "ModelPromotionReview_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "ModelEvaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPromotionReview" ADD CONSTRAINT "ModelPromotionReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrademarkAssessment" ADD CONSTRAINT "TrademarkAssessment_trademarkId_fkey" FOREIGN KEY ("trademarkId") REFERENCES "Trademark"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrademarkAssessment" ADD CONSTRAINT "TrademarkAssessment_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ProbabilityModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentReview" ADD CONSTRAINT "AssessmentReview_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "TrademarkAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentReview" ADD CONSTRAINT "AssessmentReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TmCorpusMarkClass" ADD CONSTRAINT "TmCorpusMarkClass_markId_fkey" FOREIGN KEY ("markId") REFERENCES "TmCorpusMark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TmCorpusMarkClass" ADD CONSTRAINT "TmCorpusMarkClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "TmCorpusClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TmSimilarity" ADD CONSTRAINT "TmSimilarity_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "TrademarkAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TmSimilarity" ADD CONSTRAINT "TmSimilarity_corpusMarkId_fkey" FOREIGN KEY ("corpusMarkId") REFERENCES "TmCorpusMark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentState" ADD CONSTRAINT "AssignmentState_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CSTicket" ADD CONSTRAINT "CSTicket_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==========================================================================
-- BEGIN AUTHORED FRAGMENTS (Prisma cannot express these; see ARCH-02 §4.2/§5.3)
-- ==========================================================================

-- Extensions and public-number sequences (ARCH-02 §1, §4.2.4).
-- Concatenated after the generated baseline DDL by
-- packages/db/scripts/build-baseline-migration.mjs — edit here, never in migration.sql.

-- unaccent is applied at INGEST time to compute TmCorpusMark.normalizedText.
-- It is deliberately not used inside an index predicate: unaccent is only
-- STABLE, not IMMUTABLE, so an index built on top of it cannot be trusted.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Human-facing numbers come from a dedicated sequence, never count+1 (ARCH-02 §1).
-- The application calls nextval() inside the same transaction that inserts the row:
--
--   Order.number   = 'MK-'  || to_char(now(),'YYYY') || '-' || lpad(nextval('seq_order_number')::text, 6, '0')
--   Invoice.number = 'INV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('seq_invoice_number')::text, 6, '0')
--
-- Uniqueness is enforced by the UNIQUE constraints already present on both columns.
CREATE SEQUENCE seq_order_number   START 1;
CREATE SEQUENCE seq_invoice_number START 1;

-- Integrity constraints, idempotency/dedupe indexes, BRIN, autovacuum.
-- Concatenated after the generated baseline DDL by
-- packages/db/scripts/build-baseline-migration.mjs — edit here, never in migration.sql.
--
-- LOCK LEVEL: ACCESS EXCLUSIVE on catalog objects only. This is a baseline
-- migration against an empty database: no table holds rows, so there is no
-- rewrite, no table copy and no long-lived lock.
--
-- ROLLBACK: irreversible as a script. This is the baseline, so rollback is
-- `DROP SCHEMA public CASCADE` + `prisma migrate reset` on a scratch database,
-- or restore-from-backup on a real one. Nothing here destroys pre-existing data
-- because nothing pre-exists. See docs/runbooks/db-migrations.md.

-- ---------------------------------------------------------------------------
-- Integrity constraints (ARCH-02 §5.3)
-- ---------------------------------------------------------------------------
ALTER TABLE "Order"             ADD CONSTRAINT ck_order_nonneg    CHECK ("subtotal" >= 0 AND "total" >= 0);
ALTER TABLE "InvoiceLineItem"   ADD CONSTRAINT ck_line_positive   CHECK ("unitAmount" > 0 AND "quantity" > 0);
ALTER TABLE "InvoiceLineItem"   ADD CONSTRAINT ck_line_refund     CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "unitAmount" * "quantity");
ALTER TABLE "Invoice"           ADD CONSTRAINT ck_invoice_nonneg  CHECK ("subtotal" >= 0 AND "total" >= 0);
ALTER TABLE "Payment"           ADD CONSTRAINT ck_pay_nonneg      CHECK ("amount" > 0);
ALTER TABLE "Refund"            ADD CONSTRAINT ck_refund_nonneg   CHECK ("amount" > 0);
ALTER TABLE "RefundAllocation"  ADD CONSTRAINT ck_refund_alloc    CHECK ("amount" > 0);
ALTER TABLE "Campaign"          ADD CONSTRAINT ck_campaign_nonneg CHECK ("budget" >= 0 AND "spent" >= 0);

-- Probability is stored 0..1 and rendered as a percentage by the API layer
-- (PRD §3.6.5's "0–100%" is a presentation scale, not a storage scale).
-- TrademarkAssessment's score constraint lives with the scoring/evidence
-- contract in 30-scoring-evidence.sql.
ALTER TABLE "Trademark"           ADD CONSTRAINT ck_score_range CHECK ("probabilityScore" IS NULL OR ("probabilityScore" >= 0 AND "probabilityScore" <= 1));
ALTER TABLE "TmSimilarity"        ADD CONSTRAINT ck_similarity_range CHECK ("score" >= 0);

-- Filing is attended; no unattended method may ever be recorded (D-01, G1).
ALTER TABLE "Application" ADD CONSTRAINT ck_filing_attended CHECK ("filingMethod" = 'ATTENDED');

-- Magic links are single-use, hashed, and always expire (D-06).
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT ck_magiclink_expiry CHECK ("expiresAt" > "createdAt");

-- Outbox payloads are schema-versioned (ARCH-02 §1).
ALTER TABLE "OutboxEvent"  ADD CONSTRAINT ck_outbox_payload_version CHECK ("payload" ? 'v');
ALTER TABLE "Notification" ADD CONSTRAINT ck_notification_key        CHECK (length("idempotencyKey") > 0);

-- ---------------------------------------------------------------------------
-- Idempotency and dedupe indexes (ARCH-02 §4.1 Q4, Q9, Q11, Q16, Q17)
-- ---------------------------------------------------------------------------
-- Payment webhook dedupe: a replayed delivery is a no-op (ARCH-01 §11.1, M10.2).
CREATE UNIQUE INDEX ux_payment_provider_event
  ON "Payment" ("providerEventId") WHERE "providerEventId" IS NOT NULL;

-- 会话存档 delivers at least once; the same msgid may arrive N times (M4.2).
CREATE UNIQUE INDEX ux_message_wecom
  ON "Message" ("conversationId", "wecomMsgid") WHERE "wecomMsgid" IS NOT NULL;

-- One conversation per WeCom session, so an archive replay cannot fork history.
CREATE UNIQUE INDEX ux_conversation_wecom_session
  ON "Conversation" ("channel", "wecomSessionId") WHERE "wecomSessionId" IS NOT NULL;

-- TSDR/ODP office-action upsert is idempotent on its natural key (Q9).
CREATE UNIQUE INDEX ux_office_action_key
  ON "OfficeAction" ("applicationId", "usptoActionCode", "responseDeadline");

-- Settlement matching reads only successful payments (Q12).
CREATE INDEX ix_payment_succeeded_created
  ON "Payment" ("createdAt") WHERE "status" = 'SUCCEEDED';

-- Outbox relay polls only unpublished rows (Q16).
CREATE INDEX ix_outbox_unpublished
  ON "OutboxEvent" ("id") WHERE "publishedAt" IS NULL;

-- Vault reads are the highest-value audit query (Q17).
CREATE INDEX ix_audit_vault
  ON "AuditLog" ("createdAt" DESC, "actorId") WHERE "action" LIKE 'VAULT_%';

-- AuditLog is append-only and grows without bound: BRIN keeps range scans cheap
-- at a fraction of a B-tree's size (Q15).
-- NOTE: monthly RANGE partitioning (ARCH-02 §6) is deliberately NOT applied here.
-- A partitioned table must carry the partition key in its primary key, which
-- Prisma cannot express for a single-field @id, so partitioning and "Prisma is
-- the only schema authority" (ARCH-02 §7.1) are in direct conflict. Escalated as
-- DQ-020 rather than improvised; BRIN + autovacuum is the interim mitigation.
CREATE INDEX ix_audit_created_brin ON "AuditLog" USING BRIN ("createdAt");

-- ---------------------------------------------------------------------------
-- Corpus search (ARCH-02 §4.1 Q7, §4.2.4) — the P5 critical path.
-- Trigram GIN, never ILIKE '%…%'. Class narrowing goes through TmCorpusMarkClass,
-- which is indexed on classId in the generated DDL.
-- ---------------------------------------------------------------------------
CREATE INDEX ix_corpus_normalized_trgm
  ON "TmCorpusMark" USING GIN ("normalizedText" gin_trgm_ops);

-- CRM tag filters: a String[] needs GIN or every filter is a sequential scan.
CREATE INDEX ix_contact_tags ON "Contact" USING GIN ("tags");

-- ---------------------------------------------------------------------------
-- Identity normalisation (BUG-018). Email identity is case-insensitive: a plain
-- @unique lets `Admin@x.com` and `admin@x.com` become two staff accounts or two
-- clients. Phone is normalised to E.164 in the Zod layer rather than constrained
-- here, because the format policy belongs to DQ-006.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX ux_staff_email_lower   ON "StaffUser" (lower("email"));
CREATE UNIQUE INDEX ux_contact_email_lower ON "Contact" (lower("email")) WHERE "email" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Autovacuum tuning for high-churn tables (ARCH-02 §4.2.5). Hot-update bloat on
-- append-only tables is a known failure mode.
-- ---------------------------------------------------------------------------
ALTER TABLE "Message"      SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE "Payment"      SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE "AuditLog"     SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE "OutboxEvent"  SET (autovacuum_vacuum_scale_factor = 0.02);
ALTER TABLE "Notification" SET (autovacuum_vacuum_scale_factor = 0.02);

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
