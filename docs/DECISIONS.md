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
An exact duplicate has the same explicit comparison subject, annual year,
traffic values, and quality. The caller supplies the comparison subject;
reconciliation does not infer station continuity or create a production ID.

Conflicts use this precedence:

1. `measured` over `modeled` over `unknown`;
2. newer authoritative publication when quality is equal;
3. no canonical value when equally authoritative observations disagree.

Unresolved conflicts remain visible and are excluded from comparisons. Phase 1
does not emit interpolated observations. Publication precedence uses the dated
official source definition. A repeated value may retain links from several
publications without duplicating the value variant.

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

The 150 m candidate gate contributes the full distance weight. Exact external
IDs use their source-normalized values. Road references ignore case and spaces;
road names ignore case, accents, and punctuation. A counter-type match scores
only when both values are known. Missing and unknown evidence scores zero.

## D-008: Treat OSM matching as a dated probe

- Status: Accepted
- Accepted: 2026-08-29

Phase 1 uses a dated current OpenStreetMap extract for the commune and buffer. It
records the timestamp and checksum and retains OpenStreetMap attribution under
the ODbL.

Candidate search starts within 75 m and expands to 200 m only when the first
search finds no candidate, including a candidate later rejected for conflicting
evidence. Contradictory known road references reject a candidate. OSM `ref`
values are split on semicolons and compared after
removing spaces and hyphens and normalizing case. Names ignore case, accents,
and punctuation.

| Evidence | Weight |
| --- | ---: |
| Distance | 0.40 |
| Exact road reference | 0.30 |
| Normalized name | 0.15 |
| Road class | 0.10 |
| Bearing | 0.05 |

A match is plausible only when its score is at least `0.80` and leads the next
candidate by at least `0.15`. A qualifying candidate with no runner-up is
unopposed and therefore satisfies the lead rule. Other results are ambiguous or
unmatched.

Distance credit decreases linearly from `0.40` at the station to zero at 200 m.
Road-class credit is available only when a known French road reference supplies
an expected class: `A` accepts motorway or trunk, `N` accepts trunk or primary,
and `D` accepts primary, secondary, or tertiary, including their link classes.
Bearing credit decreases linearly to zero at a 45-degree difference and treats
opposite OSM digitization directions as the same road axis. Missing evidence
scores zero. Candidate ordering is score descending, distance ascending, then
numeric OSM way ID. The probe does not create production road IDs or change
observations. Ordering, threshold checks, and runner-up comparisons use
full-precision scores; rounding is presentation-only.
Inclusive threshold decisions allow a `1e-12` numerical tolerance solely for
binary floating-point representation of mathematically exact decimal sums. The
tolerance does not alter or round the retained score.

## D-009: Use a Node-first TypeScript workspace under operator control

- Status: Accepted
- Accepted: 2026-08-29

Phase 1 uses pnpm 10, Node 24, strict TypeScript, Zod, Vitest, streaming
Shapefile parsing, Proj4, and focused Turf modules. Domain code belongs under
`src/traffic/`; commands belong under `scripts/traffic/`.

Package installation, database mutation, server startup, Git staging and
commits, deployment, and publication require operator action. D-017 separately
authorizes a local-only web prototype without authorizing the agent to start it.

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

## D-013: Admit the CD64 latest-count source to Phase 1

- Status: Accepted
- Accepted: 2026-08-29

The official CD64 `Comptages routiers` GeoJSON source joins the six required
DREAL sources. Its Open Licence 2.0 metadata permits tracked samples. The source
retains only the most recent annual count at each location, so it cannot be
presented as a complete 2012-2022 series.

The adapter treats MJA and heavy-vehicle share as measured annual evidence. It
keeps counter type `unknown` because the record schema does not identify each
counter as permanent or rotating. The source-scoped station ID retains CD64 ID
`86`. When road and PR fields are valid, the adapter also derives the
source-normalized continuity identifier used by the DREAL schema, for example
`64-D810-12+520`. Reconciliation must retain links to both CD64 and DREAL when
they describe the same comparison subject.

The separate CD64 monthly source remains supplementary. Its catalogue licence
is unspecified and its aggregates do not yet establish a valid denominator for
annual normalization.

## D-014: Keep navigation data outside the measured-count pipeline

- Status: Accepted
- Accepted: 2026-08-29

Google Routes, Roads, TrafficLayer, Waze, TomTom Traffic Stats, and HERE Traffic
Analytics do not provide open measured annual road counts suitable for the
Phase 1 pipeline. Congestion, speed, route duration, and probe sample size remain
separate evidence types.

Google Roads Management Insights may reflect tourist route use through
aggregated Google Maps data, but collection starts after commercial onboarding.
It is not a retroactive 2011-2024 archive. TomTom Traffic Stats has historical
France coverage from 2008 and is the strongest commercial comparison source
found for speed and travel time, not vehicle counts.

No commercial provider enters Phase 1 without operator approval for access,
cost, credentials, terms, and retained-data rules. Detailed evidence and links
live in [Traffic source research](SOURCE-RESEARCH.md).

## D-015: Make the two-street comparison a product viability gate

- Status: Accepted
- Accepted: 2026-08-29

The eventual product must compare traffic evolution on Avenue de Verdun and
Avenue de la Gare. Evidence on a nearby D810 station or another road does not
meet this requirement. The audit may still finish successfully with sparse open
data, but Phase 2 must not start as the intended product unless the project has a
credible evidence path for both exact street corridors.

Commercial acquisition is allowed as a researched option. Before any purchase,
the provider must return a sample or coverage report for both corridors and at
least three materially separated historical periods using the same metric and
methodology. The evidence must state whether values are physical counts,
connected-vehicle passage samples, or modeled total volumes. It must also expose
sample coverage or confidence, missing periods, map-version handling, and
methodological changes that could imitate a traffic trend.

The contract must permit permanent retention of the purchased history and
public display of non-reconstructive, street-level derived charts in the French
application. A purchase must include a no-charge or termination condition if
either target street fails the agreed coverage threshold. Account creation,
trials, vendor contact, purchase, and contract acceptance remain under operator
control.

The preferred acquisition order is:

1. request existing 2015 traffic-survey files and 2018/2022 noise-model inputs
   from the responsible public bodies;
2. request exact-street samples and quotes from Michelin Mobility Intelligence
   and MyTraffic for passage or modeled-volume history;
3. use TomTom Traffic Stats or INRIX Roadway Analytics as a separate historical
   speed and travel-time corroborator when exact-street coverage is adequate;
4. commission simultaneous counts on both streets to establish a measured 2026
   baseline and repeatable future series.

Google Roads Management Insights is not a historical substitute because it
starts accumulating after route onboarding. New physical counts cannot recreate
past years. Neither source can meet the mandatory comparison by itself.

## D-016: Cap external POC spending at EUR 100 including VAT

- Status: Accepted
- Accepted: 2026-08-30

The POC may spend at most EUR 100 including VAT across all external data and
services. Free public records, open data, and free evaluation samples take
priority. The cap does not authorize a purchase, subscription, trial, payment
method, or account creation. Those actions remain under operator control.

A commercial source must pass every coverage, comparability, quality,
retention, and publication-right requirement in D-015 and fit within the total
budget. The project rejects a quote above the cap. It also rejects automatic
renewal and a trial that requires payment details. A no-cost sample may be used
only after its terms and exact-street coverage are checked.

## D-017: Build a local-only map-led evidence prototype

- Status: Accepted
- Accepted: 2026-08-30

The project may implement a local Next.js and MapLibre prototype before the
Phase 1 data audit is complete. This is a visualization aid and evidence probe,
not approval for deployment, publication, a database, or Phase 2 production
architecture. Visible application copy is French; code and documentation stay
English.

IGN BD TOPO `troncon_de_route` is the current reference geometry for the full
named Biarritz street network and the separate 2 km buffer. Adjacent segments
with the same normalized name form a source-scoped **street subject** for
interaction. Avenue de Verdun and Avenue de la Gare are extracted as explicit
**target corridors** and remain pending operator geometry review. These
identities are prototypes, not permanent road IDs.

The original map used a neutral local background. That background-only choice
is superseded by D-018. OpenStreetMap remains the dated station-matchability
probe and is not replaced by IGN. Traffic is assigned to a
street only through an explicit accepted assignment. Name equality, proximity,
an ambiguous OSM match, or a candidate-review assignment never displays a
station value as street traffic. The generated visualization bundle and source
artifacts remain gitignored, and the loader refuses local evidence in a
production runtime until release rights receive separate approval.

## D-018: Use OSM raster tiles as local prototype context

- Status: Superseded by D-019
- Accepted: 2026-08-30

The local prototype uses the standard OpenStreetMap raster tile service as a
contextual basemap beneath IGN reference streets and traffic evidence. The
neutral background remains underneath the raster layer so local evidence still
has a usable canvas when tiles are unavailable. The municipality buffer uses a
light translucent tint rather than obscuring the basemap.

The map displays linked `© OpenStreetMap contributors` attribution alongside
the IGN attribution. In accordance with the
[OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/),
this local POC performs only normal interactive tile viewing in a browser: it
does not prefetch, scrape, proxy, or offer offline tiles. The standard community
tile service is best-effort and is not selected as the provider for a public
release. Publication requires a fresh provider, capacity, caching, privacy,
licence, attribution, and cost decision.

## D-019: Use OpenFreeMap Positron as local prototype context

- Status: Accepted
- Accepted: 2026-08-30

The local prototype uses OpenFreeMap's OSM-derived Positron vector style as a
quieter contextual basemap beneath IGN reference streets and traffic evidence.
The style is fetched and validated before MapLibre starts. A neutral local
style remains the fallback when the request fails or returns malformed data, so
the evidence layers keep a usable canvas.

At the date of this decision, OpenFreeMap documents its public instance as
requiring no registration, API key, cookies, or stated request limit. The map
retains the provider, OpenMapTiles, OpenStreetMap, and IGN attribution supplied
by the style and application. The service has no SLA and is approved only for
normal local POC viewing. A public release still requires a fresh provider,
capacity, privacy, licence, attribution, caching, and cost review.

## D-020: Compare a grouped multi-street selection without aggregating evidence

- Status: Accepted
- Accepted: 2026-08-30

The local prototype groups disconnected IGN street subjects that share one
normalized street name into one interaction choice while retaining every source
subject ID. A dependency-free fuzzy autocomplete selects at most ten streets.
It starts with Avenue de Verdun, Avenue de la Marne, and Avenue de la Gare;
`gare du midi` is a search alias for the official Avenue de la Gare name.

Two or more selected streets open a comparison matrix automatically. The
matrix uses accepted traffic-to-street assignments only. Streets without an
accepted assignment remain visible as `Aucune donnée`. Several independent
station groups assigned to one street remain separate attributable rows and are
never added or averaged into a street total. Collapsing the matrix preserves
selection, and station details may open without clearing it.

The source street layer owns map clicks beneath the priority overlay so one
pointer action cannot toggle a street twice. Candidate-review assignments and
target-corridor status remain visible evidence states but never supply traffic
values.
