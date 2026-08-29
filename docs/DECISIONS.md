# Project decisions

This file records durable choices. New decisions receive a stable ID. A changed
decision keeps its original entry marked `Superseded` and links to its
replacement. Git history carries edits; this file is not a chronological status
log.

## D-001: Separate the product vision from the Phase 1 contract

- Status: Accepted
- Accepted: 2026-08-29

The original application brief remains the long-term vision. The approved
Biarritz traffic data discovery plan governs Phase 1 and takes precedence where
the two differ.

Phase 1 stops at source discovery, normalization evidence, geographic coverage,
continuity, and current OSM matchability. It must produce an audit before the
project selects the final visualization architecture.

## D-002: Use Biarritz and data through 2024 as the audit frame

- Status: Accepted
- Accepted: 2026-08-29

The commune is Biarritz, INSEE code `64122`. Results inside the official commune
and inside a separate 2 km buffer are reported separately. The latest in-scope
traffic year is 2024.

Biarritz is the product focus. Configuration may make another boundary possible
later, but Phase 1 does not design a general multi-city platform.

## D-003: Preserve source evidence and control redistribution

- Status: Accepted
- Accepted: 2026-08-29

Raw source records are immutable and stay separate from normalized records.
Every acquired artifact records its URL, filename, retrieval or registration
time, SHA-256 checksum, byte size, CRS evidence, adapter version, and licence
evidence.

Stable official resources may be acquired automatically. HTML responses,
interactive download pages, and HTTP 401 or 403 responses require manual input.
The project does not scrape an interactive map.

Tracked samples may contain only records whose licence explicitly permits
redistribution. Unclear-licence artifacts and derived records remain local.

## D-004: Use strict traffic quality semantics

- Status: Accepted
- Accepted: 2026-08-29

Normalized observations use `measured`, `modeled`, `interpolated`, or `unknown`.

- `measured` requires source evidence tying the value to a counter observation.
- `modeled` requires explicit estimated or theoretical source evidence.
- `unknown` is used when neither claim can be supported.
- `interpolated` is reserved for later compatibility and forbidden as a Phase 1
  output.

Blank and invalid numbers become issues, not zero. `no-data` is a future display
state, not a stored observation.

## D-005: Keep geography classifications explicit

- Status: Accepted
- Accepted: 2026-08-29

Point records are classified as `inside-municipality`, `buffer-only`, or
`outside`. Linear records retain their original geometry plus derived commune
intersection, buffer intersection, and length inside Biarritz.

A buffer-only station is an ingress candidate only when a plausible road
corridor crosses the commune boundary.

## D-006: Reconcile observations in a derived view

- Status: Accepted
- Accepted: 2026-08-29

The project keeps every normalized observation. It collapses exact duplicates
only in a derived reconciliation view and retains links to every source record.

Conflicts use this precedence:

1. `measured` over `modeled` over `unknown`;
2. newer authoritative publication when quality is equal;
3. no canonical value when equally authoritative observations disagree.

Unresolved conflicts remain visible and are excluded from comparisons. Phase 1
does not emit interpolated observations.

## D-007: Score station continuity without merging source stations

- Status: Accepted
- Accepted: 2026-08-29

Continuity candidates are limited to pairs within 150 m. Contradictory known road
references reject a pair.

| Evidence | Weight |
| --- | ---: |
| Exact external ID | 0.40 |
| Road reference | 0.25 |
| Distance | 0.20 |
| Normalized name | 0.10 |
| Counter type | 0.05 |

A score of at least `0.85` is probable continuity. Scores from `0.65` through
`0.849` require review. Lower scores remain separate stations. This classification
does not mutate either source station.

## D-008: Treat OSM matching as a dated probe

- Status: Accepted
- Accepted: 2026-08-29

Phase 1 uses a dated current OpenStreetMap extract for the commune and buffer. It
records the timestamp and checksum and retains OpenStreetMap attribution under
the ODbL.

Candidate search starts within 75 m and expands to 200 m only when the first
search finds none. Contradictory known road references reject a candidate.

| Evidence | Weight |
| --- | ---: |
| Distance | 0.40 |
| Exact road reference | 0.30 |
| Normalized name | 0.15 |
| Road class | 0.10 |
| Bearing | 0.05 |

A match is plausible only when its score is at least `0.80` and leads the next
candidate by at least `0.15`. Other results are ambiguous or unmatched. The probe
does not create production road IDs or change observations.

## D-009: Use a Node-first TypeScript workspace under operator control

- Status: Accepted
- Accepted: 2026-08-29

Phase 1 uses pnpm 10, Node 24, strict TypeScript, Zod, Vitest, streaming
Shapefile parsing, Proj4, and focused Turf modules. Domain code belongs under
`src/traffic/`; commands belong under `scripts/traffic/`.

Package installation, database mutation, server startup, Git staging and
commits, deployment, and publication require operator action. Phase 1 does not
scaffold or start the web application.

## D-010: Keep implementation English and the product French

- Status: Accepted
- Accepted: 2026-08-29

Code, identifiers, prompts, tests, and repository documentation use English. The
first application release uses a French-only interface with a translation
boundary for a later English locale.

The public title is **Trafic routier à Biarritz**. Visible quality labels are
**Mesuré**, **Modélisé**, **Interpolé**, **Qualité indéterminée**, and **Aucune
donnée**. The last two remain distinct: unknown quality means a value exists but
its evidence is inconclusive; no data means no usable observation exists.
Official names and acronyms remain unchanged when appropriate.

## D-011: Licence code separately from data

- Status: Accepted
- Accepted: 2026-08-29

Project code targets Apache-2.0. DREAL artifacts, normalized samples, and
OpenStreetMap-derived data retain their own terms. A source-code licence never
stands in for dataset redistribution permission or attribution.

## D-012: Maintain documentation as current evidence

- Status: Accepted
- Accepted: 2026-08-29

`README.md` is the gateway. `docs/VISION.md` defines the product,
`docs/STATUS.md` records dated current truth, `docs/DECISIONS.md` records durable
choices, and `CONTEXT.md` defines vocabulary and invariants.

Status uses `Implemented`, `Verified`, `Blocked/manual input`, `Planned`, and
`Deferred`. A feature is verified only when the status names a fresh check and
date. The human audit report is generated only after its machine summary exists;
the repository does not keep a placeholder report.
