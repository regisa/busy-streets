# Current status

- As of: 2026-08-30
- Phase: 1, data discovery
- Current machine-audit recommendation: limited corridor or station explorer
- Local visualization: multi-street comparison implemented, browser-verified, and production-built

Busy Streets has a tested source catalogue, artifact acquisition path, schema
inspector, DREAL point adapters for 2019-2023 and 2024, a CD64 latest-count point
adapter, and a DREAL linear adapter for 2023.
It also has the official Biarritz geographic frame, tested point and line
classification primitives, reconciliation and continuity views, a dated
OpenStreetMap matchability probe, and a working deterministic audit runner. It
does not yet have adapters for the other source generations. A local-only
Next.js/MapLibre evidence explorer and deterministic visualization exporter are
implemented. After focused desktop and mobile browser verification resolved the
MapLibre 6 worker and viewport integration defects, the operator completed the
final production build. The current
machine recommendation is provisional because three catalogue sources remain
blocked and neither target avenue has an exact, plausible road match.

## Status at a glance

| Area | State | Evidence or next gate |
| --- | --- | --- |
| Domain contracts | Implemented and verified | Zod schemas and TypeScript contracts exist in `src/traffic/contracts.ts`. Unit tests cover observation bounds and the Phase 1 interpolation ban. |
| Source catalogue | Implemented and verified | Six required DREAL definitions cover point datasets for 2011-2015, 2015-2019, 2019-2023, and 2024, plus linear datasets for 2023 and 2024. One supplemental CD64 definition covers its latest annual count per location. |
| Source acquisition | Implemented and verified | HTTP, WFS feature sample, WFS schema, and manual registration paths use SHA-256 content addressing and provenance metadata, including a snapshot of catalogue licence evidence. Tests cover HTML fallback, deduplication, manual registration, and WFS CRS provenance. Further licence research remains planned. |
| Dataset inspection | Implemented and verified | GeoJSON and zipped Shapefile inspection reports fields, inferred types, null counts, representative values, geometry, CRS, and encoding. WFS inspection merges declared fields from `DescribeFeatureType` with sampled statistics. Tests cover malformed or incomplete ZIP files, missing CRS evidence, projected CRS identification, missing encoding evidence, and explicit encoding overrides. |
| Source adapters | Partly implemented and verified | Version 1 adapters for `dreal-2019-2023-point`, `dreal-2023-linear`, `dreal-2024-point`, and `cd64-latest-road-counts-point` read immutable GeoJSON source records and map their inspected schemas. Other source generations remain unimplemented or blocked. |
| Normalization | Partly implemented and verified | The point adapters emit source-scoped stations and measured annual observations. The CD64 adapter retains unknown counter type because its record schema does not identify permanent versus rotating counters. The 2023 linear adapter derives vehicles per day from `veh_km / long_km` and marks every observation `unknown` because the source does not identify measured and estimated records separately. Adapters preserve missing values, reject invalid evidence with attributable issues, and never interpolate. |
| Biarritz geography | Implemented and verified | The official `64122` MultiPolygon is validated and retained in a gitignored SHA-256 cache with parser version and dated ODbL evidence. A deterministic 2 km buffer supports boundary-inclusive point scope, line intersection and municipality-length metrics, and the strict buffer-only ingress rule. An immutable derived view applies this frame to stations, observations, and linear records without changing normalized source evidence. |
| Reconciliation and continuity | Implemented and verified | The derived reconciliation view retains source links, resolves quality and publication precedence, excludes equal-authority conflicts from comparisons, and forbids interpolated input. Continuity scoring implements the accepted 150 m gate, evidence weights, thresholds, name normalization, and hard road-reference conflict. A dated local-only Biarritz check is recorded below. |
| OSM matchability probe | Implemented and verified | A content-addressed Overpass acquisition records query bounds, checksum, OSM base time, and ODbL evidence and rejects partial responses carrying runtime remarks. Parsing retains supported non-degenerate motor-road ways. A snapshot-scoped result envelope and matching implement the accepted search radii, evidence weights, hard reference rejection, full-precision thresholds, and deterministic ordering. A dated local Biarritz probe is recorded below. |
| Audit summary, runner, and CLI | Partly implemented and verified | The runner orchestrates the official boundary, supported source adapters, geographic scope, in-scope continuity and reconciliation, and the dated OSM probe. `traffic:audit --as-of YYYY-MM-DD` writes deterministic summary JSON. `traffic:inspect` remains operational; `traffic:register` and `traffic:verify` remain unimplemented. |
| Machine summary and human report | Partly implemented and verified | A gitignored machine summary was generated twice from the live sources with byte-identical output. The English human report remains pending and will not be generated until its claims can be reviewed against the summary and open blockers. |
| Visualization bundle | Implemented and statically verified | `traffic:visualize` combines the audit snapshot with IGN BD TOPO reference streets. Two live runs were byte-identical. The gitignored bundle contains 2,603 named street subjects, 7 station groups, 12 clipped linear records, both pending target corridors, and zero traffic-to-street assignments. |
| Local web application | Implemented and verified locally | A French Next.js/MapLibre interface provides an attributed OpenFreeMap Positron OSM-derived contextual basemap, IGN evidence geometry, overview and year controls, fuzzy grouped-street selection for up to ten streets, an accepted-only automatic year matrix, optional uncertain linear evidence, station history, provenance, and same-location comparison. Focused desktop and 390 × 844 checks cover the new autocomplete and comparison layout, and the operator completed the final `pnpm build`. |
| Database and public release | Deferred | No database, deployment, publication, or production road identity exists. Local evidence is refused in production runtime. |

## Fresh verification

The following checks passed on 2026-08-30:

```text
pnpm test
Test Files  38 passed (38)
Tests       255 passed (255)

pnpm typecheck
Exit code 0
```

The operator ran `pnpm build` successfully with Next.js 16.3.3 and Turbopack,
then confirmed the final build rerun on 2026-08-30 after the browser-discovered
MapLibre worker and viewport fixes and the multi-street implementation.

Focused verification against the operator-run `pnpm dev` instance at
`http://localhost:3000/` then confirmed:

- the full IGN street network, commune boundary, priority corridors, and
  station markers render over the attributed OpenFreeMap Positron contextual
  basemap, with a neutral local style retained as the request-failure fallback;
- direct map selection and the complete named-street selector open consistent
  detail sheets;
- Avenue de Verdun and Avenue de la Gare remain explicit priority corridors
  with `Correspondance à vérifier`, `Comparaison indisponible`, and
  `Aucune donnée` states;
- the optional 2023 linear layer starts hidden and exposes
  `Qualité indéterminée` when enabled;
- the inside-municipality D810 group displays measured 2021-2024 history,
  source provenance, and a 2021-to-2024 comparison of +3,070 vehicles per day
  and +9.4%;
- the 390 × 844 mobile layout preserves the map, controls, scrollable detail
  sheet, annual values, and close control; and
- clean reloads produce no browser console warnings or errors.

The initial browser run exposed two integration defects. MapLibre's stylesheet
overrode the map container position, and MapLibre 6's module worker could not
load its shared sibling under Next/Turbopack. The app now uses a more specific
full-viewport rule and follows MapLibre's official Turbopack setup: matching
worker files are copied from the installed package into a gitignored public
runtime directory by `predev` and `prebuild`, then loaded from the same origin.
The favicon 404 was also removed with an App Router icon.

One bounded live check also passed:

```text
pnpm traffic:inspect --source dreal-2024-point --sample-size 10
Result: 10 Point features, EPSG:4326, UTF-8, 14 inspected fields
```

These checks verify the current contracts, catalogue, acquisition, inspection,
inspection and audit commands, immutable GeoJSON source records, all three point
adapters, the 2023 linear adapter, deterministic audit-summary construction, and
audit-runner orchestration. They also
verify Biarritz boundary acquisition,
deterministic buffering, boundary-inclusive point classification, line
intersection and length calculations, polygon-hole handling, and the ingress
candidate guard. Geographic projection tests cover observations that precede
their station, buffer-only and outside scope propagation, duplicate station IDs,
and observations that cannot be scoped. Bounded WFS tests cover WFS 2.0
latitude-longitude BBOX order, extent validation, acquisition, and provenance.
Reconciliation tests cover duplicate collapse, measured-versus-modeled
precedence, publication precedence, unresolved equal-authority conflicts,
deterministic ordering, uncatalogued sources, and the interpolation ban. Continuity
tests cover probable, review, separate, normalized names, hard reference
conflicts, distance exclusion, deterministic pairs, duplicate station IDs, and
unknown counter types.
They do not verify adapters for the three unsupported DREAL source generations.

Visualization tests cover IGN WFS pagination and deterministic acquisition,
connected named-street subjects, exact Verdun and Gare corridor extraction,
bundle invariants, source links, coordinate validity, the interpolation ban,
linear clipping, deterministic serialization, local-only loading, fixed map
source/layer order, hover and multi-street selection state, normalized-name
grouping, fuzzy search and aliases, the ten-street cap, accepted-only comparison
rows, explicit no-data cells, independent counter rows, overview and layer
controls, French detail views, accessibility labels, provenance, and
same-location comparison including a zero baseline. The earlier browser checks
above were supplemented on 2026-08-30 by a focused multi-street pass against the
operator-run development server. It confirmed the three default streets,
explicit no-data rows, `gare du midi` fuzzy alias, keyboard selection, persistent
collapsed state through selection changes, mouse selection, and restoration of
the default state. Opening and closing a station detail preserved the street
selection and restored the comparison sheet.
At 390 × 844, chips wrapped across rows, autocomplete results stayed within the
viewport, the page had no horizontal overflow, and the comparison matrix
scrolled within its own wrapper. The desktop viewport was restored after the
check. Map click interaction remains covered by the automated controller and
component tests rather than this focused pass.

OSM tests cover bounded POST acquisition, content-addressed provenance,
snapshot validation, HTML and HTTP error rejection, supported motor-road
parsing, reference normalization, invalid geometry, duplicate ways, weighted
scoring, axial bearing, hard reference conflicts, 75 m and 200 m search,
threshold and runner-up rules, deterministic ties, missing evidence, ambiguous
results, unmatched results, partial Overpass responses, degenerate geometry,
full-precision threshold decisions, literal radius staging, and snapshot-scoped
result envelopes.

## Local visualization prototype

`pnpm traffic:visualize --as-of 2026-08-29` completed twice on 2026-08-30
with byte-identical output. The gitignored bundle SHA-256 is
`fc9f63f15776bf9a976f38df3ce829f43f3393577e76076bb4443d25f8051902`.
Its IGN BD TOPO artifact SHA-256 is
`a459dbddf031ea28a2a527ca279725ea5f2e75a5ee5bfb74a457077a9a41af48`.

The bundle contains 2,603 named street subjects, 7 station groups, and 12
linear records clipped to the display buffer. It extracts one connected street
subject for Avenue de Verdun and one for Avenue de la Gare. Both target
corridors remain `pending` operator geometry review. There are zero accepted or
candidate traffic-to-street assignments, so neither target displays a traffic
series or comparison. These counts describe this dated local bundle, not a
production road network or citywide traffic total.

The application implementation uses those local streets as interaction
geometry and OSM only as the dated station-matchability probe. It does not turn
an ambiguous OSM result, a matching name, or proximity into assigned traffic.
The development runtime, focused desktop/mobile browser checks, and final
operator-controlled production build pass.

A live boundary check against the official endpoint also passed on 2026-08-29.
The response was an 8-member MultiPolygon, occupied 8,261 bytes, and produced a
2 km Polygon buffer. The exact response is retained only in the gitignored
content-addressed cache. The associated
[administrative-contours dataset](https://www.data.gouv.fr/datasets/contours-administratifs)
states that it supplies the API and is licensed under ODbL. These geometry facts
are not traffic coverage counts. Buffer repeatability means byte-identical
geometry for identical input with the repository's exact Turf version; a Turf
upgrade requires fresh verification.

## Deterministic machine audit

`pnpm traffic:audit --as-of 2026-08-29` completed twice on 2026-08-30. Both
runs produced byte-identical gitignored summaries with SHA-256
`da01b99a664715aab0f30bc87258316689d948bb77ca0220c40ccb911bdc5d3a`.
Acquisition timestamps remain in provenance rather than the summary.

Four catalogue sources were audited: the 2019-2023 and 2024 DREAL point
sources, the 2023 DREAL linear source, and the latest CD64 point export. The
2011-2015 point, 2015-2019 point, and 2024 linear sources are explicitly
blocked because their adapters are not implemented. This is a software blocker,
not evidence that those datasets contain no usable Biarritz records.

The retained source evidence contains 284 source-scoped stations: 3 inside the
commune, 9 in the 2 km buffer, and 272 outside. The outside records come from
auditing the full CD64 export and remain classified evidence; they are excluded
from continuity, reconciliation, recommendation, and OSM matching. The 12
in-scope station records produced 7 probable continuity pairs, 18 canonical
annual comparison groups, and 12 ambiguous OSM matches. There were no plausible
or unmatched in-scope OSM results under the accepted thresholds.

Across all retained point and line source evidence, the summary records 834
annual observations: 292 measured point observations and 542 linear
observations of unknown quality. The 542 linear records include 78 commune
intersections. These counts are evidence coverage, not a deduplicated road
network and not a citywide traffic total.

The current rule-based recommendation is `limited-corridor-or-station-explorer`
because at least one probable in-scope station group has measured values in
multiple years. This does not establish comparable evidence for Avenue de
Verdun or Avenue de la Gare. The mandatory product criterion therefore remains
open.

## Biarritz geographic evidence check

A bounded live check on 2026-08-29 queried each implemented official WFS for
the bounding rectangle of Biarritz plus its 2 km buffer. Separate WFS
`resultType=hits` requests confirmed that the 1,000-record acquisition limit did
not truncate any response. The first longitude-latitude BBOX attempt returned
empty FeatureCollections. A controlled comparison confirmed that these WFS 2.0
endpoints require latitude-longitude axis order for `EPSG:4326`; the request
builder now encodes that rule.

| Source | WFS matches in rectangle | Inside Biarritz | Buffer-only or buffer-intersecting | Outside buffer but inside rectangle | Normalized evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| `dreal-2019-2023-point` | 3 stations | 1 station | 2 stations | 0 stations | 11 measured annual observations |
| `dreal-2024-point` | 3 stations | 1 station | 2 stations | 0 stations | 3 measured annual observations |
| `dreal-2023-linear` | 542 line records | 78 intersect the commune | 387 intersect the buffer | 155 line records | 542 annual observations with `unknown` quality |

All six point records describe permanent counters. In the 2019-2023 source,
the two buffer-only stations each have measured observations for 2019, 2021,
2022, and 2023. The station inside Biarritz has measured observations for 2021,
2022, and 2023. The 2024 source has one measured 2024 observation per station.
No point observation was emitted for 2020 because the inspected traffic fields
remain empty.

The 2023 linear records contain about 6.402535 km of summed geometry inside the
commune. This is a segment-overlap diagnostic, not the length of a deduplicated
road network and not a citywide traffic total. Buffer-only stations are not
ingress candidates until a later plausible-corridor assessment proves that a
road crosses the commune boundary. All three runs completed without a
normalization or geographic-classification issue.

The source licences remain unspecified. Raw responses and record-level derived
evidence stay in the gitignored cache. The table retains aggregate audit
evidence.

## Reconciliation and continuity check

A local-only check on 2026-08-29 applied the accepted continuity rules to the
three `dreal-2019-2023-point` stations and three `dreal-2024-point` stations in
the Biarritz-plus-buffer rectangle. It found three candidate pairs within 150 m.
All three scored `0.90` and were classified as probable continuity. None were
classified for review or as separate, and no pair had a contradictory road
reference.

The check then used each probable pair's exact external station ID as an
explicit comparison subject. The 14 point observations produced 14 annual
subject groups, all with a canonical value and one retained source link. There
were no duplicate values to collapse and no unresolved conflicts because the
2019-2023 and 2024 point sources do not overlap in annual coverage. This result
does not test publication precedence against a live disagreement.

Probable continuity remains a derived assessment. It does not merge the six
source stations, create three production station IDs, or establish a final
station count. The underlying source licences remain unspecified, so the raw
records and record-level results stay in the gitignored cache.

## Dated OSM matchability probe

A one-off bounded Overpass request on 2026-08-29 used the Biarritz 2 km buffer
rectangle. The response records OSM base time `2026-08-29T14:56:01Z`, SHA-256
`0137a2df5fa5c4d3aaff2d413ce5e295fcf032305ceab3ce0f0f8f92aa37e50d`,
and 7,118,022 response bytes. The parser retained 5,180 supported motor-road
ways. The raw extract remains in the gitignored cache. The probe computed a
result envelope tied to this artifact ID, checksum, and OSM base time. The
current summary persists aggregate outcomes; retaining the record-level
envelope as separate local working data remains planned. OSM data is © OpenStreetMap contributors
and available under ODbL; acquisition provenance retains the required
attribution and licence evidence.

Applying the accepted rules to the six source-scoped DREAL point stations gave
no plausible result, six ambiguous results, and no unmatched result. Every
station had at least one non-rejected candidate within the initial 75 m search,
so none required expansion to 200 m. Candidate counts ranged from two through
eight and full-precision selected scores from `0.784013` through `0.798205`. No
candidate within the searched 75 m radii was rejected for a contradictory known
road reference.

By geographic scope, the two inside-municipality station records and all four
buffer-only records were ambiguous. Because the strict ingress rule requires a
plausible road match before testing whether its corridor crosses the boundary,
the probe establishes zero ingress candidates. These are source-record results:
the probable continuity pairs mean they must not be presented as six distinct
physical counters.

This current OSM snapshot measures matchability only. It neither validates the
historical shape of a road nor creates a production road identity, and it does
not make the ambiguous matches usable for road-level comparisons.

A separate bounded normalization check used the first 1,000 records returned by
the official 2024 point WFS on 2026-08-29. It produced 1,000 source-scoped
stations and 776 observations without a normalization issue: 781 counters were
`permanent` and 219 were `rotating`. These regional sample counts are not
Biarritz coverage counts and are not a complete-dataset result.

A separate bounded normalization check used the first 1,000 records returned by
the official 2019-2023 point WFS on 2026-08-29. It produced 1,000 source-scoped
stations and 3,381 measured observations without a normalization issue: 858 for
2019, 880 for 2021, 785 for 2022, and 858 for 2023. No 2020 observation appeared
because both inspected 2020 traffic fields were null throughout this bounded
sample. The adapter classified 745 route values as formal road references and
255 as road names. These regional sample counts are not Biarritz coverage
counts and are not a complete-dataset result.

A bounded normalization check used the first 1,000 records returned by the
official 2023 linear WFS on 2026-08-29. It produced 1,000 linear records without
a normalization issue. All observations have `unknown` quality. In the sample,
`veh_km / long_km` ranged from about 130 to 24,766 vehicles per day and was
within 0.0004 of an integer for every record. The conversion follows the
[CEREMA definition of vehicle-kilometres](https://dtrf.cerema.fr/pdf/pj/Dtrf/0001/Dtrf-0001924/DT1924.pdf?openerPage=notice),
where traffic volume is flow multiplied by network length. This is a unit
conversion, not interpolation. The derived value fell outside `tmja_class` for
66 records. Doubling it brought 64 of those records into the published band,
mostly on divided roads, roundabouts, and autoroutes. This suggests directional
or carriageway-level segmentation that the exposed fields do not explain. The
adapter therefore preserves the segment-level quotient and `unknown` quality;
it does not treat the result as a canonical road-level total. The sample does
not establish whether any record was measured or estimated, and it is not a
Biarritz coverage or complete-dataset result.

All four current official WFS sources completed the same bounded inspection on
2026-08-29:

| Source ID | Sample records | Geometry | Declared fields |
| --- | ---: | --- | ---: |
| `dreal-2019-2023-point` | 10 | Point | 22 |
| `dreal-2023-linear` | 10 | LineString | 14 |
| `dreal-2024-point` | 10 | Point | 14 |
| `dreal-2024-linear` | 10 | LineString | 10 |

These are schema and sample-inspection counts, not Biarritz coverage counts.
The resulting inspection files remain local because all four catalogue licences
are unspecified.

## CD64 latest-count check

The official CD64
[Comptages routiers](https://data.le64.fr/explore/dataset/comptages_routiers/)
GeoJSON export was acquired and inspected on 2026-08-29. Its metadata states
Open Licence 2.0 and says the dataset retains the most recent annual count for
each departmental-road location. The 98,478-byte export had SHA-256
`19192384820663b6d46441cf7a040eb284c74c85ec4945ef7cecec28a2d23c15`, 278
Point records, EPSG:4326 geometry, UTF-8 encoding, and observation years from
2012 through 2022.

Full normalization produced 278 source-scoped stations and 278 measured annual
observations with no issue. One record has Biarritz INSEE code `64122`: source
station `86`, RD810 at PR 12+520, year 2022, MJA 35,551 vehicles per day, and
2.66% heavy vehicles. The adapter keeps counter type `unknown` because the
record does not identify whether station 86 is permanent or rotating.

The source-scoped station ID remains `86`. Road and PR fields derive continuity
identifier `64-D810-12+520`, which matches the DREAL station identifier. The two
locations are 116.82 m apart and score `0.85`, probable continuity under the
accepted rules. Their 2022 MJA and heavy-vehicle share match exactly, so the
reconciliation view collapses the value to one variant while retaining both
source links.

This is evidence of probable continuity, not proof of one physical counter, and
the CD64 source is not a complete historical series. Geographic classification
remains part of the end-to-end audit. Raw acquisition data stays in the
gitignored content-addressed cache even though the stated licence permits
redistribution.

## Official source access findings

The [source catalogue](../src/traffic/source-catalog.ts) contains six official
DREAL Nouvelle-Aquitaine sources and one supplemental CD64 source. Current
research found that the SIGENA download links return an HTML application rather
than a stable dataset file. The acquisition layer treats HTML as manual input
instead of accepting it as data. The CD64 API provides a stable GeoJSON export.

| Source ID | Catalogue licence | Machine-readable evidence found | Current audit status |
| --- | --- | --- | --- |
| `dreal-2011-2015-point` | Open Licence 2.0 | WMS rendering only; no downloadable artifact or WFS schema confirmed | Blocked/manual input |
| `dreal-2015-2019-point` | Open Licence 2.0 | No downloadable artifact or feature API confirmed | Blocked/manual input |
| `dreal-2019-2023-point` | Not specified | The [official description](https://www.data.gouv.fr/datasets/nouvelle-aquitaine-trafic-routier-2019-2023-des-reseaux-autoroutiers-non-concede-national-et-departemental-localisation-ponctuel) defines the three counter types and identifies annual TMJA and heavy-vehicle share as measurements; the WFS exposes the corresponding 2019-2023 fields | Version 1 WFS adapter and bounded Biarritz-plus-buffer check verified; licence evidence pending |
| `dreal-2023-linear` | Not specified | The [official description](https://www.data.gouv.fr/datasets/nouvelle-aquitaine-trafic-routier-2023-du-reseau-autoroutier-concede-du-reseau-national-et-departemental-lineaire) says missing traffic is estimated. The WFS exposes `veh_km`, `long_km`, `pc_pl`, and a traffic band, but no record-level measured/estimated flag. | Version 1 WFS adapter with `unknown` quality and bounded Biarritz-plus-buffer check verified; licence evidence pending |
| `dreal-2024-point` | Not specified | The [official description](https://www.data.gouv.fr/datasets/nouvelle-aquitaine-trafic-routier-2024-des-reseaux-autoroutiers-non-concede-national-et-departemental-localisation-ponctuel) identifies TMJA and heavy-vehicle share as station measurements and defines permanent, rotating, and occasional counters; WFS inspection exposes the corresponding fields | Version 1 WFS adapter and bounded Biarritz-plus-buffer check verified; licence evidence pending |
| `dreal-2024-linear` | Not specified | The [official description](https://www.data.gouv.fr/datasets/nouvelle-aquitaine-trafic-routier-2024-du-reseau-autoroutier-concede-du-reseau-national-et-du-reseau-departemental-lineaire) says missing traffic is estimated. The WFS exposes a traffic band but no exact numeric TMJA, heavy-vehicle percentage, or record-level measured/estimated flag. | Blocked for exact traffic values; redistribution blocked pending licence evidence |
| `cd64-latest-road-counts-point` | Open Licence 2.0 | Stable official GeoJSON with annual MJA, heavy-vehicle count and share, road, PR, commune, INSEE code, and point geometry | Version 1 adapter, complete-source inspection, and normalization verified; geographic reconciliation pending |

The dated [traffic source research](SOURCE-RESEARCH.md) records the Google Maps,
Google Roads Management Insights, TomTom, HERE, Waze, CD64 monthly, and other
French public-data findings. None of the navigation products enters the measured
annual-count pipeline.

## Mandatory two-street comparison

The intended product must compare Avenue de Verdun and Avenue de la Gare. The
retained DREAL and CD64 evidence does not currently assign an annual traffic
series to either street. Current OSM geometry identifies both corridors, but OSM
does not supply traffic values. Nearby D810 point and linear evidence cannot be
presented as either avenue.

Research on 2026-08-29 found two credible acquisition paths, neither yet
verified for both streets:

- archived public files may exist behind the 2015 STACBA/AUDAP summer and
  off-season traffic survey, which used 165 count stations, and behind the 2018
  and 2022 Biarritz strategic-noise models;
- Michelin Mobility Intelligence and MyTraffic advertise street-segment vehicle
  passage or volume products in France. Their public material does not prove the
  historical depth, sample quality, or exact coverage of both target streets.

TomTom Traffic Stats has historical French speed and travel-time data from 2008,
and INRIX Roadway Analytics has a historical speed archive from 2014. Those
products can corroborate congestion change if both streets have adequate probe
coverage, but speed is not vehicle volume. HERE has a shorter archive beginning
in 2021. Google Roads Management Insights accumulates only after onboarding and
cannot reconstruct the historical comparison.

On 2026-08-29, operator-approved exact-street sample and quote requests were
submitted through the official Michelin Mobility Intelligence and MyTraffic
contact forms. Both requests make usable historical coverage of both streets a
condition of proceeding and ask for geometry, comparable periods, methodology,
quality metadata, retention, pricing, and public derived-chart rights. No trial
has been started and no commercial data has been purchased.

On 2026-08-30, administrative-document requests were submitted through the
official Communauté Pays Basque and Ville de Biarritz forms. They request
existing digital traffic-count evidence for all of Biarritz from 2011 through
2024. Avenue de Verdun and Avenue de la Gare remain the minimum priority if the
broader request is too costly to process. The requests also ask for station and
segment inventories, measurement methods, quality evidence, metadata, and reuse
conditions. AUDAP and DDTM 64 have not yet been contacted directly.

The POC has a total external data and service budget of EUR 100 including VAT.
Free evidence remains the default. Any purchase remains blocked until both
street geometries, at least three comparable historical periods, methodology,
quality metadata, retention, and public-display rights pass the accepted
procurement test. A quote above the budget cannot proceed.

## What the retained evidence can support now

The current evidence can support the Phase 1 audit and three bounded
demonstrations:

- a source and coverage map showing retained official point stations and 2023
  line records inside Biarritz and its separate 2 km buffer;
- one probable continuous point-counter series for 2021, 2022, 2023, and 2024,
  with the 2022 CD64 record reconciled as a duplicate value;
- a 2023 road-segment snapshot with `unknown` quality, accompanied by visible
  gaps, provenance, and warnings against treating it as a citywide total.

The point series cannot yet be assigned to Avenue de Verdun, Avenue de la Gare,
or another production road identity. The OSM probe found only ambiguous matches.
The 2023 line source provides one year, mixes measured and estimated evidence
without a record-level flag, and cannot show change over time.

The retained evidence therefore cannot yet support the mandatory comparison of
the two avenues, a citywide traffic trend, a citywide traffic total, or a claim
about tourist driving. The public-body and vendor replies determine whether the
intended road-level historical product has a credible data path.

The accessible official WFS capabilities and layer names are:

- [2019-2023 point WFS](https://datacarto.sigena.fr/wfs/5f0e7e36-dc34-4983-903a-e1a27f570d90?service=WFS&request=GetCapabilities),
  layer `ms:l_comptage_trafic_p_r75`;
- [2023 linear WFS](https://datacarto.sigena.fr/wfs/31e35ea7-c328-4411-ae8f-306ca536678a?service=WFS&request=GetCapabilities),
  layer `ms:l_tmja2023_l_r74`;
- [2024 point WFS](https://datacarto.sigena.fr/wfs/c19722dc-3abf-4cb1-a539-eb3d759b202e?service=WFS&request=GetCapabilities),
  layer `ms:l_tmja_2024_p_r75`;
- [2024 linear WFS](https://datacarto.sigena.fr/wfs/79905218-085a-441f-8492-3003eea64fef?service=WFS&request=GetCapabilities),
  layer `ms:l_tmja_2024_l_r75`.

The official Biarritz endpoint
[`geo.api.gouv.fr/communes/64122`](https://geo.api.gouv.fr/communes/64122?format=geojson&geometry=contour)
returns a GeoJSON MultiPolygon. Boundary acquisition and geographic
classification are implemented and support the bounded evidence checks above,
but the geometry has not yet been used for a complete traffic-source audit.

## Manual input contract

When no stable official file endpoint is available, the operator may register a
downloaded file against its source ID. The expected manual input for each DREAL
source is a ZIP archive containing a complete ESRI Shapefile set:

```text
dataset.shp
dataset.shx
dataset.dbf
dataset.prj
dataset.cpg  # required unless --encoding supplies known encoding evidence
```

The original filename is not known until the official SIGENA download
application provides it. Renaming the archive is allowed because registration
records its source ID, registered filename, source catalogue URL, content
checksum, byte size, and registration time. The inspection command rejects a
GeoJSON artifact without recorded CRS evidence and a Shapefile bundle without a
valid `.shx` or `.prj`. It also rejects a bundle without `.cpg` encoding
evidence unless the operator passes the known encoding explicitly with
`--encoding`. Manual registration alone does not perform that inspection.

Manual files stay in the gitignored, content-addressed cache. Data from the four
sources with an unspecified catalogue licence stays local unless later licence
evidence permits redistribution.

## Planned next work

The documentation and inspection foundation are complete. Phase 1 continues in
this order:

1. Record and assess replies from Communauté Pays Basque, Ville de Biarritz,
   Michelin Mobility Intelligence, and MyTraffic. Register any supplied public
   files through the existing manual-input path. Reject commercial offers above
   EUR 100 including VAT.
2. Contact AUDAP and DDTM 64 directly if the public bodies do not route the
   requests or identify the relevant records.
3. Inspect and adapt the two historical DREAL point sources when manual
   artifacts are supplied.
4. Review the generated machine summary and persist any record-level audit
   views needed to support the human report.
5. Generate the English audit report from the verified machine evidence.
6. Reassess the provisional MVP recommendation after replies and historical
   source adapters are incorporated.

The final recommendation must remain one of: a road-level measured MVP, a
limited corridor or station explorer, or insufficient open data. The current
machine result selects the second option provisionally.

## Deferred

Next.js, React, Supabase/PostGIS, MapLibre, TomTom, production road IDs,
production map matching, interpolation, seasonal analysis, deployment, and
publication remain outside Phase 1.
