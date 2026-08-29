# Busy Streets

Busy Streets is the working repository for **Trafic routier à Biarritz**, a
French-language web application for exploring how road traffic has changed in
Biarritz when the available evidence supports a comparison.

The project is currently in Phase 1: data discovery. There is no web
application, database, production road network, or complete audit pipeline in
this repository yet. The current code defines the first traffic-data contracts,
catalogues six DREAL Nouvelle-Aquitaine sources, and handles the first automatic
and manual acquisition cases.

Sparse coverage is an acceptable result. The project will not fill gaps or
present estimates as measurements to make the map look complete.

## Project documents

- [Vision](docs/VISION.md) describes the intended product and its limits.
- [Current status](docs/STATUS.md) records dated implementation and verification
  evidence.
- [Decisions](docs/DECISIONS.md) records accepted and superseded project choices.
- [Context](CONTEXT.md) defines the domain vocabulary and Phase 1 invariants.

The final data audit will be generated at
`docs/biarritz-traffic-data-audit.md` only after the audit runner can produce an
evidence-backed machine summary. That report does not exist yet.

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

`pnpm check` runs both commands. The `traffic:*` scripts in `package.json` are
reserved for the planned audit CLI and are not operational because
`scripts/traffic/cli.ts` has not been implemented.

Do not commit downloaded source files. The acquisition layer stores raw
artifacts and provenance in gitignored local cache paths.

## Language

Code, data contracts, and repository documentation use English. The eventual
application interface will use French, with a translation boundary that can
support another locale later. Official names and acronyms such as DREAL, TMJA,
INSEE, and OpenStreetMap remain unchanged where that is clearer.

## Licensing

Project code is licensed under the [Apache License 2.0](LICENSE).

That licence does not grant rights to DREAL source artifacts, normalized sample
data, or OpenStreetMap-derived data. Each dataset keeps its own licence and
attribution requirements. OpenStreetMap-derived outputs must retain the required
OpenStreetMap attribution and comply with the
[Open Database License](https://www.openstreetmap.org/copyright).
