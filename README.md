# Busy Streets

Busy Streets is the working repository for **Trafic routier à Biarritz**, a
French-language web application for exploring how road traffic has changed in
Biarritz when the available evidence supports a comparison.

A defensible historical comparison of Avenue de Verdun and Avenue de la Gare is
mandatory for the eventual product. Current open evidence does not provide that
comparison. The project is now also investigating archived public studies and
commercial street-level data, with a strict sample-before-purchase gate.
The total external data and service budget for the POC is EUR 100 including VAT.

The evidence programme remains in Phase 1: data discovery. A local-only
Next.js and MapLibre prototype now visualizes the evidence already available;
it is not a public release, production road network, or claim that the two
mandatory streets have comparable history. There is no database. The current
code defines the traffic-data contracts,
catalogues six DREAL Nouvelle-Aquitaine sources and one open-licensed CD64
source, acquires official WFS samples and stable GeoJSON resources,
and acquires `DescribeFeatureType` schemas or manual artifacts. It produces deterministic
schema inspections, and normalizes the inspected 2019-2023 and 2024
point-counter schemas plus the numeric evidence in the 2023 linear schema. It
also acquires and validates the official Biarritz boundary, derives the separate
2 km buffer, and provides tested point and line geographic classification. A
derived reconciliation view and station-continuity scorer implement the
accepted evidence precedence, conflict, distance, and match-threshold rules. A
dated, non-production OpenStreetMap probe assesses current in-scope point
stations without creating permanent road IDs; the present audit snapshot yields
only ambiguous matches. A deterministic audit runner now produces a local
machine summary. Its current recommendation is a limited corridor or station
explorer, but the mandatory Avenue de Verdun and Avenue de la Gare comparison
is still unsupported.

The local prototype opens in a French overview, exposes the complete named IGN
BD TOPO street network for Biarritz and its 2 km buffer, and lets the operator
inspect station histories, provenance, quality, and valid same-location year
comparisons. Avenue de Verdun and Avenue de la Gare are visible priority
corridors, but both deliberately show that comparison data is unavailable.

Sparse coverage is an acceptable result. The project will not fill gaps or
present estimates as measurements to make the map look complete.

## Project documents

- [Vision](docs/VISION.md) describes the intended product and its limits.
- [Current status](docs/STATUS.md) records dated implementation and verification
  evidence.
- [Decisions](docs/DECISIONS.md) records accepted and superseded project choices.
- [Traffic source research](docs/SOURCE-RESEARCH.md) records dated public and
  commercial source findings, including Google Maps.
- [Context](CONTEXT.md) defines the domain vocabulary and Phase 1 invariants.

The final data audit will be generated at
`docs/biarritz-traffic-data-audit.md` only after the current machine summary has
been reviewed and the remaining source blockers have been assessed. That human
report does not exist yet.

## Development

Requirements:

- Node.js 24
- pnpm 10

Install dependencies under operator control:

```sh
pnpm install
```

Run the checks that are currently available:

```sh
pnpm typecheck
pnpm test
```

`pnpm check` runs both commands. `traffic:inspect` and `traffic:audit` are
operational. `traffic:visualize` produces the local web bundle. The register and
verify commands remain unimplemented.

Generate the deterministic, gitignored visualization bundle:

```sh
pnpm traffic:visualize --as-of 2026-08-29
```

Then, under operator control, verify and run the local application:

```sh
pnpm build
pnpm dev
```

The application reads
`artifacts/traffic/visualization/biarritz.json` only in development. A
production runtime refuses local evidence rather than publishing data whose
release rights have not been approved.

Run the dated Biarritz audit:

```sh
pnpm traffic:audit --as-of 2026-08-29
```

The command fixes the Phase 1 scope to Biarritz INSEE `64122` plus the separate
2 km buffer. It writes `artifacts/traffic/audit/audit-summary.json`; that local
output and its source cache are gitignored.

Inspect a source with official WFS access:

```sh
pnpm traffic:inspect --source dreal-2024-point --sample-size 100
```

Inspect the stable official CD64 GeoJSON export:

```sh
pnpm traffic:inspect --source cd64-latest-road-counts-point
```

Inspect a manually downloaded Shapefile ZIP:

```sh
pnpm traffic:inspect \
  --source dreal-2011-2015-point \
  --artifact /absolute/path/to/download.zip
```

A Shapefile ZIP must include matching `.shp`, `.shx`, `.dbf`, and `.prj`
components. It must also include a `.cpg` encoding declaration, or the operator
must provide the known encoding explicitly, for example `--encoding utf-8`.
Inspection never guesses a DBF text encoding.

The command stores downloads under `.cache/traffic/` and writes inspection JSON
under `artifacts/traffic/inspections/`. Both locations are gitignored. WFS field
coverage comes from `DescribeFeatureType`; record counts, null counts, and sample
values describe the requested feature sample, not the complete regional dataset.

Do not commit downloaded source files. The acquisition layer stores raw
artifacts and provenance in gitignored local cache paths.

## Language

Code, data contracts, and repository documentation use English. The eventual
application interface will use French, with a translation boundary that can
support another locale later. Official names and acronyms such as DREAL, TMJA,
INSEE, and OpenStreetMap remain unchanged where that is clearer.

## Licensing

Project code is licensed under the [Apache License 2.0](LICENSE).

That licence does not grant rights to third-party source artifacts, normalized
sample data, or OpenStreetMap-derived data. Each dataset keeps its own licence and
attribution requirements. OpenStreetMap-derived outputs must retain the required
OpenStreetMap attribution and comply with the
[Open Database License](https://www.openstreetmap.org/copyright).
