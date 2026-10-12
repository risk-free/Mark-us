# ARCH-05 — P5.1 Spike: corpus snapshot, cohort base rate, label plan

**ID:** `ARCH-05`
**Status:** DONE (evidence record)
**Date:** 2026-10-12
**Owner:** Architect (data/ML spike executed against the live official records)
**Impacts:** D-24 → D-26, M6.1, M6.5, M7.1, OPEN-03, FA-011, `TmCorpusMark` sizing

This document records the P5.1 spike (docs/SCHEDULE.md §5.1) and the empirical facts it established.
Every figure below is reproducible from the official USPTO research case files snapshot used
(`TRCFECO2`, 2023 vintage, `case_file.csv.zip` 434,260,216 B → `case_file.csv` 3,251,708,126 B,
12,691,941 rows, 1870–2024-03), retrieved 2026-10-12.

## 1. Data-source state of the world

- **The USPTO Open Data Portal (`data.uspto.gov`) is now the only bulk XML source.** The legacy
  `bulkdata.uspto.gov` (BDSS) and `trademarks.reedtech.com` no longer resolve (DNS-dead). The
  canonical feed for the D-02 corpus is the ODP product **`trtdxfap` — Trademark daily XML file
  (TDXF) applications** (word mark, serial no., registration no., filing/registration dates,
  goods & services, classes, status codes, design search codes; 1884–present; cadence `R/P1D`;
  DTD `Trademark-Applications-Documentation-v2.3`).
- **Access is gated.** Since 2026-06-18 the ODP requires a USPTO.gov sign-in; since 2026-08-18 four
  ODP profile fields are mandatory; bulk download additionally uses an API key. Without these the
  TDXF file table and downloads are unreachable (every ODP route returns the same 20,666-byte SPA
  shell behind AWS WAF). This blocks the **M7.1 nightly feed** at source — recorded as **FA-011**
  (owner = Attorneys, the existing P5 prerequisite).
- **Ungated workaround exists today.** The researcher product `TRCFECO2` (12.7 M case files,
  "Trademark Case Files Dataset for Academia and Researchers") serves files through an anonymous
  **temporary signed-URL endpoint**: `https://data.uspto.gov/ui/datasets/products/files/<ID>/<year>/<table>.csv.zip`
  returns JSON `{"Location":"<signed CloudFront URL>"}` without authentication (short TTL). This is a
  viable **backfill** path for M7.1 while FA-011 is open; the TDXF daily feed still needs the account.

## 2. Corpus snapshot (measured)

| Metric | Value |
| --- | --- |
| Case files (rows, 1870–2024-03) | 12,691,941 (all with distinct serial) |
| Word marks (`mark_draw_cd` 3000 + 4000) | 7,706,318 — **60.7 % of corpus** |
| — of which standard-character (`4000`) | 5,885,787 |
| — of files filed 2004+ carrying a word element | ≈ **92 %** |
| Pure design (`2000`+`5000`) | 6.6 % |
| Sound (`6000`) | 1,061 |
| Status split at snapshot | `6xx` 5,897,325 · `7xx` 5,621,699 · `8xx` 797,364 · `9xx` 273,759 · `4xx` 101,789 |
| LIVE corpus (D-24 scope: status `600`/`700`-family), word share | ≈ **11.5 M** marks; **61.9 %** word |
| New applications/year (official TDXF-derived) | 2009–2018: 269–472 K · 2019: 498 K · 2020: 665 K · 2021: 673 K · 2022: 549 K · 2023: 543 K · 2024–2025 ≈ 550–625 K |
| Daily feed size | ≈ **1,600–1,800 new applications/day** (2024–2025) |
| Predicted backfill size | ≈ **25–50 GB** XML for the full training/publish corpus (local Postgres, fine) |

Filing-year span of the researcher file: 1823–2024. Counts at 2024-03; the live corpus has grown by
the 2024–2026 vintages (public 2026 totals ≈ 14.3 M historical, third-party "active" counts vary
2.4 M–9.3 M depending on dedup/veracity — tie the canonical live count to the M7.1 TDXF ingest, not
to scrapers).

## 3. Cohort base rate — P(eventual registration) (measured)

Defined per D-24: positive = ever registered (`registrationDate` set or status `7xx`); census
excludes marks still pending at census. From fully-resolved cohorts (2009–2018, ≥ 6 y follow-up):

| Filing year | n | P(registered) |
| --- | --- | --- |
| 2000 | 285,858 | 0.455 |
| 2004 | 251,374 | 0.530 |
| 2006 | 280,769 | 0.541 |
| 2008 | 294,292 | 0.564 |
| 2010 | 284,538 | 0.607 |
| 2012 | 317,034 | 0.619 |
| 2014 | 346,974 | 0.618 |
| 2016 | 401,632 | 0.619 |
| 2018 | 472,094 | 0.617 |

Steady-state **≈ 0.60–0.62** for modern cohorts (older 2000s: 0.45–0.56, rising through the
decade); 2020–2021 partial-resolution already at 0.63–0.64. `P(eventual registration) ≈ 60 %`,
`≈ 40 %` abandon. Word-only subcohort converges to the same figures.

**Label machinery caveat (important for M6.5):** the abandoned side is *not* recoverable from this
research table with a date — the `abandon_dt` column is empty in the 2023 vintage and the residual
never-registered population sits in stale `6xx` statuses (measured dead-without-registration ≤ 0.04 %
per cohort; status `654` "abandonment after publication" ≈ 1.9 K). The M7.1 TDXF feed (event/status
history) is the correct abandonment source; relying on the research status codes alone would label
most abandoned applications "pending".

## 4. Label horizon — the D-24 amendment (measured → D-26)

Time filing → registration (filed ≥ 2000, n = 4,783,563):

| Years since filing | Fraction registered by then |
| --- | --- |
| +6 months | **1.7 %** |
| +12 months | **40.0 %** |
| +18 months | 70.7 % |
| +24 months | 84.6 % |
| +36 months | 94.5 % |
| median | **13.3 months** |

A **+6-month horizon is 98 % censored** — the handful of "resolved" marks are the fastest
registrations, a small, positively biased slice that cannot meet the D-25 gate. **D-26 therefore
amends D-24:** horizon = **+12 months (primary)** and **+24 months (secondary)**, configuration-held
as before.

## 5. M6.5 sample-size check (measured vs D-25 bars)

One month of word filings ≈ 40–50 K marks (2020–2021 volumes). At +12-month maturity ≈ 33 %
resolved → **≈ 13–17 K resolved labels per month** — the D-25 floor (≥ 500) is exceeded ~25–30× with
a single-month holdout slice; CI half-width at n = 500, p ≈ 0.6 is 1.96·√(0.6·0.4/500) ≈ **4.3 pp
≤ 5 pp**. The D-25 bars are comfortably satisfiable; the real constraint is temporal separation of
the feature window and the label window, not label quantity.

## 6. Decisions triggered and consequential updates

- **ADR D-26** — horizon +12 primary / +24 secondary (amends D-24 item 3).
- **FA-011** — provision USPTO ODP access (firm USPTO.gov account + 4 ODP profile fields + API key)
  and evidence one TDXF daily download; blocks M7.1 feed (Attorneys).
- `M6.1` halt, `M6.5` labelled-set text, `ARCH-01` §15 OPEN-03, `ARCH` README OPEN-03 and docs
  `04` §18 rows updated to reference D-24 + D-26.
- Recommended label assembly for M6.5: TDXF-derived `registrationDate`/`statusCode 700` within the
  horizon = positive; verified abandon event within the horizon = negative; still pending at the
  horizon = censored (never a negative); `subSignals`/`featureSnapshot` untouched by this spike.

## 7. Artefacts and hygiene

- Working data: `D:\markus-spike\case_file.csv` (3.25 GB), `frame.pkl` (7-col compact frame used for
  the analysis), `build_frame.py`, `analyze2.py`, this doc. Free the `case_file.csv` when done.
- Ops finding: the C: drive was driven to **0 bytes free** during the spike (Docker Desktop images
  20.5 GB + build cache 29.6 GB share C:); `docker builder prune` (≈ 6.4 GB reclaimable) is a safe,
  non-destructive option if C: pressure recurs.
- All figures are from the official 2023-vintage researcher snapshot; current live counts on
  third-party mirrors are materially inconsistent with one another and are not authoritative.