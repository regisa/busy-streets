# Project context

This file is the shared vocabulary and operating contract for Busy Streets.
Code and documentation use these terms consistently.

## Authority

The original application brief defines the long-term product vision. The
approved Biarritz traffic data discovery plan is the binding contract for Phase
1. If they differ, the Phase 1 plan governs current implementation until the
audit is complete and the operator approves the next phase.

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
- **Linear traffic record**: traffic evidence supplied on a source road
  geometry. Phase 1 preserves that geometry and any intersections derived from
  it.
- **Continuity candidate**: a derived proposal that two source stations may be
  the same counter over time. It never rewrites either station.
- **Road-match candidate**: a dated Phase 1 assessment of whether a station can
  be associated with a current OpenStreetMap road. It is not a production road
  ID.
- **Audit summary**: the deterministic machine-readable result from which the
  human audit report will be generated.

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
- Report the commune and 2 km buffer separately.
- Do not turn a nearby station into an ingress candidate unless a plausible road
  corridor crosses the commune boundary.
- Treat the OSM probe as current and dated. Preserve its checksum and ODbL
  attribution.
- Never calculate a citywide traffic total by summing road segments.
- Do not place raw downloads, unclear-licence data, credentials, or cache
  artifacts in Git.

## Operating boundaries

Package installation, server startup, database changes, Git staging and
commits, deployment, and publication remain operator-controlled. Phase 1 does
not start a web server or mutate a database.

Code, domain identifiers, tests, prompts, and repository documentation use
English. The eventual product interface uses French. Official names and
acronyms remain in their recognized form when translation would reduce clarity.

## Deferred work

The following are outside Phase 1:

- Next.js and React application scaffolding;
- PostgreSQL/PostGIS or Supabase;
- MapLibre and the production map;
- TomTom or another commercial provider;
- permanent internal road-segment IDs;
- production map matching;
- interpolation and seasonal analysis;
- citywide traffic totals.
