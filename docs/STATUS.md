# Current status

- As of: 2026-08-29
- Phase: 1, data discovery
- Product recommendation: not available yet

Busy Streets has a tested foundation for source metadata and artifact
acquisition. It does not yet have a working traffic audit pipeline. No traffic
station count, road-coverage count, or MVP recommendation has been established
for Biarritz.

## Status at a glance

| Area | State | Evidence or next gate |
| --- | --- | --- |
| Domain contracts | Implemented and verified | Zod schemas and TypeScript contracts exist in `src/traffic/contracts.ts`. Unit tests cover observation bounds and the Phase 1 interpolation ban. |
| DREAL source catalogue | Implemented and verified | Six definitions cover point datasets for 2011-2015, 2015-2019, 2019-2023, and 2024, plus linear datasets for 2023 and 2024. |
| Source acquisition | Implemented and verified | Automatic and manual registration paths use SHA-256 content addressing and provenance metadata. Tests cover HTML fallback, deduplication, and manual registration. CRS and licence inspection remain planned. |
| Dataset inspection and adapters | Planned | No source schema inspector or source-generation adapter exists. |
| Normalization | Planned | No DREAL record has been normalized. |
| Biarritz geography | Planned | The official boundary endpoint is known, but boundary acquisition, buffering, point classification, and line intersection are not implemented. |
| Reconciliation and continuity | Planned | Contracts exist for candidates and issues, but the scoring and conflict rules are not implemented. |
| OSM matchability probe | Planned | No OSM extract has been acquired and no road candidates have been scored. |
| Audit runner and CLI | Planned | `AuditRunner` is a contract only. `scripts/traffic/cli.ts` does not exist, so the declared `traffic:*` package scripts are not operational. |
| Machine summary and human report | Planned | Neither output exists. The report will not be created until the summary can support every displayed count. |
| Web application and database | Deferred | Phase 1 does not scaffold Next.js, run a server, or create a database. |

## Fresh verification

The following checks passed on 2026-08-29:

```text
pnpm test
Test Files  3 passed (3)
Tests       9 passed (9)

pnpm typecheck
Exit code 0
```

These checks verify the current contracts, catalogue, and acquisition tests.
They do not verify an end-to-end audit.

## Official source access findings

The [source catalogue](../src/traffic/source-catalog.ts) contains six official
DREAL Nouvelle-Aquitaine sources and their dataset and resource URLs. Current
research found that the SIGENA download links return an HTML application rather
than a stable dataset file. The acquisition layer correctly treats HTML as
manual input instead of accepting it as data.

| Source ID | Catalogue licence | Machine-readable evidence found | Current audit status |
| --- | --- | --- | --- |
| `dreal-2011-2015-point` | Open Licence 2.0 | WMS rendering only; no downloadable artifact or WFS schema confirmed | Blocked/manual input |
| `dreal-2015-2019-point` | Open Licence 2.0 | No downloadable artifact or feature API confirmed | Blocked/manual input |
| `dreal-2019-2023-point` | Not specified | Official WFS schema exposes station identity, road, counter type, annual TMJA, and heavy-vehicle percentage fields | Planned adapter; redistribution blocked pending licence evidence |
| `dreal-2023-linear` | Not specified | Official WFS schema is accessible, but it exposes no numeric TMJA field | Blocked for traffic values; redistribution blocked pending licence evidence |
| `dreal-2024-point` | Not specified | Official WFS schema exposes `tmja_2024`, `pc_pl_2024`, counter identity, road, and counter type | Planned adapter; redistribution blocked pending licence evidence |
| `dreal-2024-linear` | Not specified | Official WFS schema exposes traffic class metadata but no numeric TMJA or heavy-vehicle percentage | Blocked for traffic values; redistribution blocked pending licence evidence |

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
returns a GeoJSON MultiPolygon. This confirms the boundary source, not its use in
the audit.

## Manual input contract

When no stable official file endpoint is available, the operator may register a
downloaded file against its source ID. The expected manual input for each DREAL
source is a ZIP archive containing a complete ESRI Shapefile set:

```text
dataset.shp
dataset.shx
dataset.dbf
dataset.prj
dataset.cpg  # optional, but preferred when present
```

The original filename is not known until the official SIGENA download
application provides it. Renaming the archive is allowed because registration
records its source ID, registered filename, source catalogue URL, content
checksum, byte size, and registration time. The planned inspection step must
find and record the CRS before normalization; the current registration function
does not enforce that requirement.

Manual files stay in the gitignored, content-addressed cache. Data from the four
sources with an unspecified catalogue licence stays local unless later licence
evidence permits redistribution.

## Planned next work

Documentation is the current gate. Once it is verified, Phase 1 resumes in this
order:

1. Add WFS and file schema inspection without normalizing records.
2. Implement one adapter for each discovered source schema.
3. Acquire the Biarritz boundary and classify points and lines against the
   commune and separate 2 km buffer.
4. Reconcile overlapping observations and assess station continuity.
5. Run the dated OSM matchability probe.
6. Generate the deterministic machine summary, then the English audit report.
7. Make one evidence-backed MVP recommendation.

The recommendation must be one of: a road-level measured MVP, a limited
corridor or station explorer, or insufficient open data. The project will not
choose before the audit results exist.

## Deferred

Next.js, React, Supabase/PostGIS, MapLibre, TomTom, production road IDs,
production map matching, interpolation, seasonal analysis, deployment, and
publication remain outside Phase 1.
