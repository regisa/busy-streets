# Local traffic visualization design

- Status: Approved design with implementation plan
- Date: 2026-08-30
- Product title: Trafic routier à Biarritz
- Delivery boundary: local-only prototype

## Purpose

Build a functional map-led prototype that lets a French-speaking user inspect
the traffic evidence currently available for Biarritz. The prototype tests the
product interaction while public-source requests, historical adapters, exact
street attribution, and redistribution rights remain unresolved.

The prototype must make incomplete evidence obvious. It must not imply that the
current data supports a historical comparison of Avenue de Verdun and Avenue de
la Gare. Those two corridors remain the mandatory product-success criterion.

## Scope

The first slice will:

- use Next.js App Router and MapLibre in the existing Node/TypeScript workspace;
- run locally against a gitignored visualization bundle;
- show the official Biarritz boundary and separate 2 km buffer;
- show the full named Biarritz street network from IGN BD TOPO;
- show in-scope traffic stations and optional 2023 linear evidence;
- show annual history and same-location year comparisons;
- draw Avenue de Verdun and Avenue de la Gare as priority target corridors;
- preserve source, quality, continuity, and road-match uncertainty;
- use a French-only, translation-ready interface;
- use the approved local-editorial visual direction.

The slice excludes deployment, publication, authentication, Supabase,
PostgreSQL/PostGIS, permanent road IDs, production map matching, interpolation,
traffic forecasting, seasonal claims, and citywide traffic totals.

## Architecture

The repository remains one package. It will not become a monorepo.

Next.js supplies the application shell and server-side local-data loader. A
client-only MapLibre adapter owns map creation, layers, feature state, hover,
selection, and viewport changes. Presentation components consume a validated
view model and do not know how MapLibre stores its sources.

The traffic pipeline will expose an internal deterministic evidence snapshot.
The existing audit summary and the new visualization exporter will both derive
their outputs from that snapshot. This prevents the web application from
reimplementing acquisition, geography, continuity, reconciliation, or quality
rules.

The exporter writes a versioned JSON bundle under
`artifacts/traffic/visualization/`. The directory remains gitignored. The
Next.js server page reads the bundle directly and passes the validated view
model to the client. Raw DREAL artifacts are never served or fetched by the
browser.

The local-data loader refuses to load unclear-licence data outside the Next.js
development environment. A production build or missing bundle shows an
unavailable state rather than silently embedding local evidence.

No database or application API is needed for this slice. A later server data
source can replace the file loader without changing the map view model.

## Geographic reference data

The official IGN Géoplateforme BD TOPO WFS is the preferred source for the
current Biarritz street network. Its `troncon_de_route` data contains road names
and line geometry. The acquisition will request only the Biarritz boundary and
2 km buffer, record the edition, URL, retrieval time, checksum, CRS, and licence
evidence, and retain the response in the content-addressed cache.

The visualization bundle contains named, relevant road segments inside the
requested area. It keeps original IGN identifiers. For interaction, the
exporter groups adjacent segments with the same normalized street name into a
source-scoped display subject. This is a prototype selection identity, not a
permanent production road ID.

Every named BD TOPO road segment in the requested area is interactive, including
named streets without traffic evidence. Vehicle-access attributes remain in the
bundle so the interface can distinguish roads from pedestrian or cycle ways.
Unnamed segments appear only in a subdued reference layer. The implementation
will inspect the current BD TOPO schema before finalizing name-field mapping.

Avenue de Verdun and Avenue de la Gare are extracted as explicit target
corridors. The operator must review their combined geometry on the map before
the prototype treats each overlay as the intended street. Their source edition
and geometry checksum remain visible in provenance.

OpenStreetMap remains the dated station-matchability probe. IGN reference
geometry does not convert an ambiguous station match into a confirmed traffic
assignment. The bundle retains both sources and their roles separately.

The first slice uses a neutral MapLibre background beneath the IGN street
network. Evaluating PLAN IGN as a rendered background is separate work because
its service terms are not inferred from the BD TOPO data licence.

## Visualization bundle

The bundle has a schema version and deterministic ordering. It contains:

- audit as-of date and Biarritz identity;
- Biarritz MultiPolygon and separate 2 km buffer;
- source statuses and public-safe provenance references;
- derived in-scope station groups;
- each group's immutable source-scoped station members;
- canonical annual point observations and retained source links;
- quality, counter type, heavy-vehicle percentage, and issues;
- station continuity classification and evidence score;
- OSM road-match classification and candidate explanation;
- 2023 linear records clipped for display and linked to original records;
- IGN street subjects and their source segments;
- the two reviewed target-corridor overlays;
- bundle-level warnings and generation metadata.

Acquisition timestamps stay in provenance. They do not make identical evidence
produce different analytical content. Collections are sorted by stable source
identities. The bundle never contains an interpolated observation.

The schema rejects the wrong commune, an unsupported version, duplicate IDs,
invalid coordinates, impossible traffic values, an observation without a
known source link, or an interpolated Phase 1 value.

## User experience

### Initial state

The application opens on a full-screen Biarritz map in `Vue d'ensemble`. It
does not default to 2024. The overview shows every in-scope evidence location
and identifies its latest available year. The header contains the product
title, the overview or year control, `Couches`, and `Comparer`.

Station marker size remains neutral. Colour communicates evidence quality, not
traffic volume. This avoids creating a visual heat map from sparse observations.

The 2023 linear layer is off by default. Enabling it displays `Qualité
indéterminée` next to the layer control and in selected-record details.

### Street interaction

Hovering a named street highlights the complete display geometry and shows its
name and evidence state. Clicking opens the bottom sheet. Touch devices use tap
instead of hover.

Street evidence states are:

- `Données disponibles` when the audit has an exact accepted assignment;
- `Correspondance à vérifier` when only unresolved candidate evidence exists;
- `Aucune donnée` when no observation is assigned.

Traffic values are never assigned by street-name equality or proximity alone.
Most streets will initially show `Aucune donnée`. That is an intended result,
not an error.

Avenue de Verdun and Avenue de la Gare remain easy to find and visually marked
as priority corridors. Their bottom sheets initially show `Comparaison
indisponible` and explain the missing evidence.

### Station selection and comparison

Selecting a station group opens a low editorial bottom sheet while preserving
most of the map. The sheet is draggable on smaller screens. It shows:

- the available annual series;
- TMJA in vehicles per day;
- heavy-vehicle percentage when available;
- visible quality labels;
- source-scoped station members;
- continuity and road-match uncertainty;
- source and provenance access.

`Comparer` compares two available years for the same selected station group or
accepted street corridor. It shows raw values, absolute change, and percentage
change. Missing, conflicted, or methodologically incompatible periods cannot be
selected. The interface does not compare arbitrary nearby stations.

## Visual direction

The approved direction is `Presse locale`.

The interface uses warm paper tones, black structural lines, restrained red
data accents, and yellow evidence labels. Serif display typography can support
headings, while controls and values use a compact sans serif. The result should
feel like a local public-interest investigation, not a tourism site or a dark
professional GIS console.

The map must remain readable. Strong borders and colours are reserved for
selection, current values, warnings, and target-corridor status.

## Language and accessibility

All visible strings are French and live behind a message boundary. Code,
identifiers, tests, and repository documentation remain English.

The visible quality vocabulary is:

- `Mesuré`;
- `Modélisé`;
- `Interpolé`, reserved and absent from Phase 1 data;
- `Qualité indéterminée`;
- `Aucune donnée`.

Colour never communicates quality or availability alone. Labels, line styles,
and icons provide redundant meaning. Hover interactions have focus and tap
equivalents. Map controls and the bottom sheet support keyboard navigation,
visible focus, reduced motion, and screen-reader labels. Charts expose a text
table or equivalent accessible values.

## Failure states

If the local bundle is absent, the application shows a French setup screen with
the exact export command. It does not fail with a generic Next.js error.

If the bundle is invalid, the application shows `Les données locales ne
peuvent pas être chargées` and makes technical validation details available in
a secondary disclosure.

If the basemap fails, the boundary, street network, stations, and evidence
layers remain usable on a neutral background.

If a year has no usable observation, the interface shows `Aucune donnée`. It
never substitutes zero. Unknown-quality values remain visible with `Qualité
indéterminée` and a warning.

## Verification

Domain and exporter tests cover:

- visualization-bundle validation;
- deterministic bytes from identical evidence;
- IGN acquisition and schema inspection;
- target-corridor extraction and segment grouping;
- station grouping and retained source links;
- same-location comparison calculations;
- unresolved conflicts and missing periods;
- rejection of interpolation, invalid geometry, duplicate IDs, and wrong-city
  bundles;
- the separation between street geometry and traffic assignment.

Component tests cover French labels, initial overview, missing-data states,
quality warnings, layer controls, street and station bottom-sheet content, and
comparison eligibility.

MapLibre stays behind an adapter so most tests do not require WebGL. A focused
browser check covers map loading, street hover and selection, station
selection, year comparison, target-corridor selection, optional linear data,
basemap failure, and responsive bottom-sheet behaviour.

The final verification for the slice includes strict type checking, all unit
and component tests, deterministic export comparison, documentation checks,
and confirmation that Git tracks no raw artifacts or visualization bundle.

## Dependency and operator controls

Implementation updates `package.json`, then stops before dependency
installation. The operator runs `pnpm install`, which updates `pnpm-lock.yaml`.

The agent does not start the Next.js development server. Once implementation
and static checks are ready, the operator receives the exact command to start
it. Database creation, external account creation, deployment, publication,
Git staging, and commits remain operator-controlled.

## Delivery sequence

1. Add the IGN reference-source acquisition and schema inspection.
2. Refactor audit orchestration to expose one internal evidence snapshot.
3. Define and test the visualization bundle and deterministic exporter.
4. Prepare the Next.js, React, MapLibre, and component-test dependencies, then
   stop for operator installation.
5. Build the French application shell and local-data loader.
6. Build the full-street map, overview, layers, hover, selection, and bottom
   sheet.
7. Add annual history and same-location comparison.
8. Apply the local-editorial visual system and accessibility behaviour.
9. Run static, unit, deterministic-export, and operator-assisted browser
   verification.

## Acceptance criteria

The slice succeeds when the operator can start the local application, see the
full named Biarritz street network, hover or tap a street, inspect real local
station histories, compare two valid years at one location, toggle the uncertain
2023 line layer, and inspect Verdun and Gare as explicit no-comparison targets.

No screen may imply that an ambiguous station belongs to a named street. No
generated source or visualization data may enter Git. The prototype remains
local until source rights and release criteria receive separate approval.

## Reference sources

- [IGN open-data policy](https://www.ign.fr/institut/des-donnees-et-logiciels-ouverts-au-service-de-la-nation)
- [Géoplateforme July 2026 service update](https://cartes.gouv.fr/aide/fr/partenaires/ign/generalites-ign/actualites/2026-07-mises-a-jour/)
- [BD TOPO road-segment specification](https://geoservices.ign.fr/sites/default/files/2022-07/DC_BDTOPO_3-0.pdf)
