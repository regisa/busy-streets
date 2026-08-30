# Project context

This file is the shared vocabulary and operating contract for Busy Streets.
Code and documentation use these terms consistently.

## Authority

The original application brief defines the long-term product vision. The
approved Biarritz traffic data discovery plan is the binding contract for Phase
1. If they differ, the Phase 1 plan governs current implementation until the
audit is complete and the operator approves the next phase. D-017 is the
approved exception for a local-only visualization aid; it does not relax the
evidence, licensing, assignment, deployment, or publication gates.

## Domain vocabulary

- **Source definition**: versioned catalogue metadata for an official dataset,
  including coverage, geometry kind, URLs, publication date, licence evidence,
  and adapter version.
- **Source artifact**: an acquired file plus its URL, original filename,
  acquisition time, checksum, byte size, CRS evidence, and adapter version. The
  acquisition result also identifies its gitignored local cache path.
- **Source record**: an immutable record read from a source artifact. It retains
  original values and source-scoped identity.
- **Source inspection**: a schema report produced before normalization. It lists
  fields, inferred types, null counts, representative values, geometry, CRS, and
  encoding.
- **Source adapter**: code for one discovered schema generation. It inspects and
  normalizes an artifact without changing the raw record.
- **Traffic station**: a source-scoped point counter. Stations are not merged
  merely because they are nearby.
- **Traffic observation**: an annual value tied to source evidence and,
  optionally, a source station.
- **Comparison subject**: an explicit derived key used to compare observations
  that the audit has already decided belong together. It is not a production
  station or road ID and does not merge source evidence.
- **Reconciled observation**: a derived annual group that keeps all distinct
  value-and-quality variants and their source links. It has a canonical variant
  only when the precedence rules resolve the evidence.
- **Continuity candidate**: a derived proposal that two source stations may be
  the same counter over time. It never rewrites either station.
- **Road-match candidate**: a dated Phase 1 assessment of whether a station can
  be associated with one current OpenStreetMap way. A rejected candidate can
  retain a hard road-reference conflict for audit evidence.
- **Station road-match result**: the plausible, ambiguous, or unmatched outcome
  derived from the ordered candidates for one source-scoped station. It is not
  a production road ID and does not mutate the station or its observations.
- **Audit summary**: the deterministic machine-readable result from which the
  human audit report will be generated.
- **Visualization bundle**: a deterministic, versioned, gitignored view model
  derived from the audit evidence snapshot and IGN reference geometry. It
  contains only canonical point observations, source links, explicit
  assignments, and public-safe provenance. Acquisition timestamps do not affect
  its analytical bytes.
- **Street subject**: one connected set of named IGN BD TOPO segments grouped
  by an approved normalized street name. It is a local interaction identity,
  not a permanent road ID and not evidence that traffic belongs to the street.
- **Target corridor**: the explicit local overlay for Avenue de Verdun or
  Avenue de la Gare, composed from matching street subjects and pending operator
  geometry review. It remains distinct from a traffic assignment.
- **Street traffic assignment**: an explicit derived link between one street
  subject and one station group. `candidate-review` may be displayed as an
  uncertainty but never as assigned traffic; only `accepted` can expose the
  station series on the street.
- **Traffic count**: a vehicle volume tied to a counter or an explicitly modeled
  volume. Route duration, speed, congestion class, and navigation-probe sample
  size are not traffic counts.
- **Target street corridor**: a fixed, reviewed geometry for Avenue de Verdun or
  Avenue de la Gare. A nearby station, similarly named road, or broader D810
  corridor is not a substitute.
- **Connected-vehicle passage count**: the number of contributing provider-panel
  vehicle trips observed on a road section. It is not a total traffic count
  unless the provider documents and supplies a validated expansion method.

## Traffic quality

| Value | Meaning |
| --- | --- |
| `measured` | The source ties the value to a counter observation. |
| `modeled` | The source explicitly calls the value estimated or theoretical. |
| `interpolated` | A derived value between observations. Reserved for future compatibility and forbidden as Phase 1 output. |
| `unknown` | The source does not provide enough evidence to classify the value as measured or modeled. |

`no-data` is not a stored observation. It is a future display state for a road
and period with no usable observation.

Counter type uses `permanent`, `rotating`, `occasional`, or `unknown`. Geographic
scope uses `inside-municipality`, `buffer-only`, or `outside`.

## Documentation evidence states

- **Implemented** means the code or document exists.
- **Verified** means a named check passed on the recorded date.
- **Blocked/manual input** means progress needs a specific external artifact or
  operator action.
- **Planned** means the work is approved but not implemented.
- **Deferred** means the work is intentionally outside the current phase.

Implementation does not imply verification. Source inspection, a passing unit
test, a completed audit, and a deployed product are different kinds of evidence.

## Phase 1 invariants

- Preserve raw records and normalized records separately.
- Never coerce blank or invalid numbers to zero.
- Reject impossible values and unknown coordinate systems.
- Never emit an interpolated observation.
- Keep every normalized observation. Reconciliation is a derived view.
- Preserve unresolved equal-authority conflicts and exclude them from
  comparisons.
- Never infer a comparison subject inside reconciliation. Continuity remains a
  separate derived assessment.
- Report the commune and 2 km buffer separately.
- Do not turn a nearby station into an ingress candidate unless a plausible road
  corridor crosses the commune boundary.
- Treat the OSM probe as current and dated. Preserve its checksum and ODbL
  attribution.
- Never calculate a citywide traffic total by summing road segments.
- Do not claim that the product goal is met unless Avenue de Verdun and Avenue de
  la Gare have at least three comparable historical periods on their exact
  corridors.
- Do not compare vendor probe counts across years without evidence that panel,
  penetration, map-version, and normalization changes cannot explain the trend.
- Do not buy a commercial source before an exact-street sample proves coverage
  for both avenues and the contract permits permanent retention and public
  derived charts.
- Keep total external data and service spending for the POC at or below EUR 100
  including VAT. This cap does not authorize a purchase, subscription, paid
  trial, payment method, or account creation.
- Do not place raw downloads, credentials, or cache artifacts in Git. The
  tracked visualization snapshot is an explicit POC exception and must remain
  derived, attributable, and separate from raw source downloads.
- Keep street reference geometry, station evidence, and traffic assignment as
  separate layers. Never infer an assignment from name or proximity alone.
- Production may load the tracked complete POC visualization snapshot. Licence
  review and any required permissions remain a gate before broad promotion or
  a production launch.

## Operating boundaries

Package installation, builds, server startup, database changes, Git staging and
commits, deployment, and publication remain operator-controlled. The approved
local visualization exception does not start a server or mutate a database.

Code, domain identifiers, tests, prompts, and repository documentation use
English. The eventual product interface uses French. Official names and
acronyms remain in their recognized form when translation would reduce clarity.

## Deferred work

The following are outside Phase 1:

- PostgreSQL/PostGIS or Supabase;
- deployment, public hosting, and a production map architecture;
- Google Maps, TomTom, HERE, or another commercial provider integration;
- permanent internal road-segment IDs;
- production map matching;
- interpolation and seasonal analysis;
- citywide traffic totals.
