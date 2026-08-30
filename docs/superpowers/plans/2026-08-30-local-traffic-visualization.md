# Local Traffic Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only French Next.js and MapLibre prototype that renders the full named Biarritz street network, real in-scope traffic evidence, same-location historical comparisons, and explicit unavailable states for Avenue de Verdun and Avenue de la Gare.

**Architecture:** Refactor the existing audit orchestration to expose one deterministic evidence snapshot. A visualization exporter combines that snapshot with a content-addressed IGN BD TOPO road extract and writes a versioned gitignored JSON bundle. A Next.js server page validates and loads the bundle, while a client-only MapLibre adapter and focused React components provide the map, layers, street interaction, bottom sheet, history, and comparison.

**Tech Stack:** Node.js 24, pnpm 10, strict TypeScript, Zod, Vitest, Next.js 16.3.3, React 19.2.8, MapLibre GL JS 6.6.0, Testing Library, jsdom, GeoJSON, IGN Géoplateforme WFS.

**Spec:** `docs/superpowers/specs/2026-08-30-local-traffic-visualization-design.md`

## Global Constraints

- Work on the existing `main` checkout and leave every change unstaged and uncommitted.
- Use test-driven development: observe each new test fail before adding production code.
- Do not install dependencies. Task 6 stops and returns control to the operator for `pnpm install`.
- Do not start Next.js, a browser preview, a database, or any other server. Browser verification waits for the operator to start the site.
- Keep code, identifiers, tests, and repository documentation in English. Keep every visible application string in French behind one message module.
- Keep the prototype local-only. Never place DREAL artifacts, unclear-licence normalized data, visualization bundles, or cache content in Git.
- Use Biarritz INSEE `64122`, the official boundary, the separate 2 km buffer, and audit date `2026-08-29`.
- Never emit or display an interpolated Phase 1 observation.
- Never assign traffic to a street through name equality, proximity, or an ambiguous OSM match.
- Keep the 2023 linear layer off by default and label it `Qualité indéterminée` when enabled.
- Show Avenue de Verdun and Avenue de la Gare as priority corridors with `Comparaison indisponible` until explicit accepted assignments exist.
- Use a neutral MapLibre background for this slice. PLAN IGN background evaluation is separate.
- Preserve OSM and IGN as separate evidence sources with their own timestamps, checksums, licences, and roles.
- Use ordinary GeoJSON for the first Biarritz-sized bundle. Do not introduce vector-tile infrastructure in this slice.
- Use the built-in Codex browser, not `agent-browser`, after the operator starts the application.

---

## Planned File Structure

### Traffic and reference-data pipeline

- `src/traffic/ign-roads.ts`: build paginated IGN WFS requests, validate responses, normalize road segments, and cache one deterministic artifact plus provenance.
- `src/traffic/audit-evidence.ts`: collect the boundary, normalized source evidence, in-scope station groups, reconciliation, continuity, and OSM probe into one internal snapshot.
- `src/traffic/station-groups.ts`: derive deterministic station groups from probable continuity candidates.
- `src/traffic/audit-runner.ts`: build the existing summary from `AuditEvidenceSnapshot` without duplicating orchestration.
- `src/visualization/street-network.ts`: normalize IGN names, group connected segments into street subjects, and extract target corridors.
- `src/visualization/contracts.ts`: define and validate the versioned visualization bundle.
- `src/visualization/comparison.ts`: decide comparison eligibility and calculate absolute and percentage changes.
- `src/visualization/bundle.ts`: convert audit evidence, IGN streets, and explicit assignments into the deterministic client view model.
- `src/visualization/exporter.ts`: orchestrate collection and write `artifacts/traffic/visualization/biarritz.json`.
- `scripts/traffic/cli.ts`: add the `visualize` command.

### Next.js application

- `next.config.ts`: keep the app in the existing repository and enable strict React behaviour.
- `src/app/layout.tsx`: root French document shell and metadata.
- `src/app/page.tsx`: server page that loads local data or renders the setup/error state.
- `src/app/globals.css`: local-editorial design tokens, layout, focus, responsive, and reduced-motion rules.
- `src/visualization/messages/fr.ts`: all visible French application copy.
- `src/visualization/load-local-bundle.ts`: development-only file loader and validation errors.
- `src/visualization/components/TrafficExplorer.tsx`: top-level selection and layer state.
- `src/visualization/components/MapCanvas.tsx`: client-only MapLibre lifecycle and map events.
- `src/visualization/components/LayerControls.tsx`: overview/year and optional-layer controls.
- `src/visualization/components/StreetSearch.tsx`: keyboard-accessible named-street selection.
- `src/visualization/components/BottomSheet.tsx`: selected street or station details.
- `src/visualization/components/AnnualHistory.tsx`: accessible chart and value table.
- `src/visualization/components/ComparisonPanel.tsx`: two-year same-location comparison.
- `src/visualization/map/map-controller.ts`: narrow MapLibre adapter for sources, layers, feature state, and event cleanup.
- `src/visualization/selectors.ts`: pure presentation selectors for overview, detail, and comparison.

### Tests and documentation

- `tests/traffic/ign-roads.test.ts`
- `tests/traffic/audit-evidence.test.ts`
- `tests/traffic/audit-runner.test.ts`
- `tests/traffic/visualize-command.test.ts`
- `tests/visualization/street-network.test.ts`
- `tests/visualization/contracts.test.ts`
- `tests/visualization/comparison.test.ts`
- `tests/visualization/bundle.test.ts`
- `tests/visualization/load-local-bundle.test.ts`
- `tests/visualization/components/traffic-explorer.test.tsx`
- `tests/visualization/components/bottom-sheet.test.tsx`
- `tests/visualization/map/map-controller.test.ts`
- `README.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, and `CONTEXT.md`

---

### Task 0: Resolve tracked visual-companion artifacts

**Files:**
- Modify: `.gitignore`
- Remove only with operator approval: `.superpowers/brainstorm/`

**Interfaces:**
- Produces a clean local-tooling boundary before implementation begins.

- [ ] **Step 1: Confirm the current tracked state**

Run: `git ls-files .superpowers`

Expected at plan-writing time: the visual-companion files appear because commit
`b565d8e` added them while the design session was active.

- [ ] **Step 2: Ask the operator to choose retention or removal**

Recommend removing the generated companion files from the working tree and
adding `.superpowers/` to `.gitignore`. Do not delete or untrack them without
explicit approval. The approved design remains separately documented under
`docs/superpowers/specs/`.

- [ ] **Step 3: Apply the approved boundary**

If removal is approved, delete only the paths returned by
`git ls-files .superpowers`, then add:

```gitignore
.superpowers/
```

The committed files remain recoverable from `b565d8e` until the operator later
commits their deletion. Do not stage the deletion. If retention is approved,
leave the files tracked and update the Definition of Done to record that
operator exception before continuing.

- [ ] **Step 4: Verify the result**

Run: `git status --short .superpowers .gitignore && git diff --check`

Expected after approved removal: unstaged deletions under `.superpowers/` and
an unstaged `.gitignore` change, with no staged files.

---

### Task 1: Acquire and normalize the IGN Biarritz road network

**Files:**
- Create: `src/traffic/ign-roads.ts`
- Create: `tests/traffic/ign-roads.test.ts`

**Interfaces:**
- Consumes: `Wgs84BoundingBox` from `src/traffic/contracts.ts`.
- Produces: `buildIgnRoadPageUrl(bounds, startIndex, count): string`, `acquireIgnRoads(options): Promise<AcquiredIgnRoads>`, `IgnRoadSegment`, and `IgnRoadArtifact`.

- [ ] **Step 1: Add failing URL and axis-order tests**

```ts
test("builds the current BD TOPO road request with WFS 2 axis order", () => {
  const url = new URL(buildIgnRoadPageUrl(bounds, 0, 1000));
  expect(url.origin + url.pathname).toBe("https://data.geopf.fr/wfs/ows");
  expect(url.searchParams.get("TYPENAMES")).toBe("BDTOPO_V3:troncon_de_route");
  expect(url.searchParams.get("BBOX")).toBe(
    "43.43,-1.59,43.51,-1.51,urn:ogc:def:crs:EPSG::4326",
  );
  expect(url.searchParams.get("OUTPUTFORMAT")).toBe("application/json");
  expect(url.searchParams.get("STARTINDEX")).toBe("0");
  expect(url.searchParams.get("COUNT")).toBe("1000");
});
```

- [ ] **Step 2: Run the URL test and verify the missing-module failure**

Run: `pnpm test tests/traffic/ign-roads.test.ts`

Expected: FAIL because `src/traffic/ign-roads.ts` does not exist.

- [ ] **Step 3: Implement the request builder and public types**

```ts
export const IGN_ROADS_ENDPOINT = "https://data.geopf.fr/wfs/ows";
export const IGN_ROADS_TYPE_NAME = "BDTOPO_V3:troncon_de_route";

export interface IgnRoadSegment {
  readonly id: string;
  readonly geometry: LineString;
  readonly names: readonly string[];
  readonly nature: string | null;
  readonly vehicleAccess: "free" | "restricted" | "prohibited" | "unknown";
  readonly inseeCodes: readonly string[];
}

export interface IgnRoadArtifact {
  readonly id: string;
  readonly sourceUrl: typeof IGN_ROADS_ENDPOINT;
  readonly typeName: typeof IGN_ROADS_TYPE_NAME;
  readonly acquiredAt: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly crs: "EPSG:4326";
  readonly parserVersion: "1";
  readonly bounds: Wgs84BoundingBox;
  readonly license: {
    readonly code: "lov2";
    readonly url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/";
    readonly redistributionAllowed: true;
    readonly verifiedAt: "2026-08-30";
  };
  readonly schemaVersion: 1;
}

export function buildIgnRoadPageUrl(
  bounds: Wgs84BoundingBox,
  startIndex: number,
  count: number,
): string {
  const parameters = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: IGN_ROADS_TYPE_NAME,
    OUTPUTFORMAT: "application/json",
    SRSNAME: "EPSG:4326",
    BBOX: `${bounds.south},${bounds.west},${bounds.north},${bounds.east},urn:ogc:def:crs:EPSG::4326`,
    STARTINDEX: String(startIndex),
    COUNT: String(count),
  });
  return `${IGN_ROADS_ENDPOINT}?${parameters}`;
}
```

- [ ] **Step 4: Run the URL test and verify it passes**

Run: `pnpm test tests/traffic/ign-roads.test.ts`

Expected: PASS for URL construction.

- [ ] **Step 5: Add failing pagination, parsing, provenance, and rejection tests**

Use two fake WFS pages. Page one returns two features with `numberMatched: 3`;
page two returns one feature. Assert that acquisition:

```ts
expect(fetch).toHaveBeenCalledTimes(2);
expect(result.segments.map((segment) => segment.id)).toEqual([
  "TRONROUT-1",
  "TRONROUT-2",
  "TRONROUT-3",
]);
expect(result.segments[0]).toMatchObject({
  names: ["Avenue de Verdun"],
  vehicleAccess: "free",
  inseeCodes: ["64122"],
});
expect(result.artifact).toMatchObject({
  crs: "EPSG:4326",
  license: { code: "lov2", redistributionAllowed: true },
  schemaVersion: 1,
});
```

Also assert rejection of HTML, HTTP errors, repeated page IDs, invalid or
non-line geometry, mismatched `numberMatched`, non-finite coordinates, and a
response whose declared CRS is not EPSG:4326.

- [ ] **Step 6: Run the expanded test file and verify the new failures**

Run: `pnpm test tests/traffic/ign-roads.test.ts`

Expected: FAIL because acquisition and validation are not implemented.

- [ ] **Step 7: Implement deterministic paginated acquisition**

Implement `acquireIgnRoads` with these exact rules:

```ts
export interface AcquireIgnRoadsOptions {
  readonly bounds: Wgs84BoundingBox;
  readonly cacheDirectory: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => string;
  readonly pageSize?: number;
}

export interface AcquiredIgnRoads {
  readonly artifact: IgnRoadArtifact;
  readonly segments: readonly IgnRoadSegment[];
  readonly localPath: string;
  readonly provenancePath: string;
}
```

Fetch pages until the distinct normalized segment count equals
`numberMatched`. Use `cleabs` as the segment ID and accept `feature.id` only
when `cleabs` is absent. Normalize 3D positions to `[longitude, latitude]`.
Collect names from `nom_voie_ban_gauche`, `nom_voie_ban_droite`,
`nom_collaboratif_gauche`, `nom_collaboratif_droite`, `alias_gauche`,
`alias_droit`, and `cpx_toponyme_route_nommee`; trim, deduplicate, and sort
them. Collect and sort `insee_commune_gauche` and `insee_commune_droite`.

Serialize one sorted FeatureCollection to bytes, hash those bytes, and store it
under `.cache/traffic/ign-roads/<sha256>/bdtopo-roads.geojson`. Store retrieval
time only in a separate provenance file. Reuse the atomic verified-file pattern
from `src/traffic/osm-acquisition.ts`.

- [ ] **Step 8: Run IGN tests and all existing acquisition tests**

Run: `pnpm test tests/traffic/ign-roads.test.ts tests/traffic/osm-acquisition.test.ts tests/traffic/wfs.test.ts`

Expected: PASS.

- [ ] **Step 9: Confirm generated visualization files remain protected**

The existing `artifacts/traffic/` rule already ignores the visualization
bundle. Confirm it without adding a narrower duplicate rule:

Run: `git check-ignore -v artifacts/traffic/visualization/biarritz.json`

Expected: the bundle is ignored by the existing `artifacts/traffic/` rule.

- [ ] **Step 10: Review checkpoint**

Run: `pnpm typecheck && git diff --check`

Expected: exit code 0. Leave changes unstaged and uncommitted.

---

### Task 2: Expose one deterministic audit evidence snapshot

**Files:**
- Create: `src/traffic/station-groups.ts`
- Create: `src/traffic/audit-evidence.ts`
- Create: `tests/traffic/audit-evidence.test.ts`
- Modify: `src/traffic/audit-runner.ts`
- Modify: `tests/traffic/audit-runner.test.ts`

**Interfaces:**
- Consumes: current `LoadedAuditSources`, `LoadedOsmRoads`, continuity,
  reconciliation, and OSM probe modules.
- Produces: `StationGroup`, `buildStationGroups`, `AuditEvidenceSnapshot`,
  `AuditEvidenceCollector`, and `createDefaultAuditEvidenceCollector`.

- [ ] **Step 1: Add failing station-group tests**

```ts
test("groups only probable in-scope continuity and retains source station IDs", () => {
  expect(buildStationGroups(stations, candidates)).toEqual([
    {
      id: "station-group:station:2023:86|station:2024:86",
      memberStationIds: ["station:2023:86", "station:2024:86"],
    },
    {
      id: "station-group:station:buffer:2",
      memberStationIds: ["station:buffer:2"],
    },
  ]);
});
```

Include review, separate, contradictory-reference, and input-order cases.

- [ ] **Step 2: Run the station-group test and verify failure**

Run: `pnpm test tests/traffic/audit-evidence.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement `StationGroup` and deterministic union/find grouping**

```ts
export interface StationGroup {
  readonly id: string;
  readonly memberStationIds: readonly string[];
}

export function buildStationGroups(
  stations: readonly GeographicTrafficStation[],
  candidates: readonly ContinuityCandidate[],
): readonly StationGroup[];
```

Only `probable` candidates join groups. Sort member IDs and groups. Reject a
candidate that references a station outside the supplied in-scope station set.

- [ ] **Step 4: Run the grouping tests and verify they pass**

Run: `pnpm test tests/traffic/audit-evidence.test.ts`

Expected: PASS for grouping.

- [ ] **Step 5: Add failing collector and runner-equivalence tests**

Assert that `collect(config)` returns:

```ts
interface AuditEvidenceSnapshot {
  readonly config: AuditConfig;
  readonly frame: BiarritzGeographicFrame;
  readonly sources: readonly SourceAuditStatus[];
  readonly evidence: readonly GeographicEvidence[];
  readonly inScopeStations: readonly GeographicTrafficStation[];
  readonly stationGroups: readonly StationGroup[];
  readonly continuityCandidates: readonly ContinuityCandidate[];
  readonly reconciledObservations: readonly ReconciledTrafficObservation[];
  readonly osmMatchabilityProbe: OsmMatchabilityProbe | null;
  readonly issues: readonly AuditIssue[];
}
```

The test must prove that outside stations remain in `evidence` but are absent
from `inScopeStations`, station groups, reconciliation, recommendation input,
and OSM results. It must also compare the refactored runner summary bytes with
the existing expected summary fixture.

- [ ] **Step 6: Run collector and runner tests and verify failure**

Run: `pnpm test tests/traffic/audit-evidence.test.ts tests/traffic/audit-runner.test.ts`

Expected: FAIL because the collector is not implemented and the runner still
owns orchestration.

- [ ] **Step 7: Implement the collector and refactor the runner**

```ts
export interface AuditEvidenceCollector {
  collect(config: AuditConfig): Promise<AuditEvidenceSnapshot>;
}

export interface AuditEvidenceDependencies {
  readonly loadBoundary: (config: AuditConfig) => Promise<MultiPolygon>;
  readonly loadSources: (
    config: AuditConfig,
    frame: BiarritzGeographicFrame,
  ) => Promise<LoadedAuditSources>;
  readonly loadOsmRoads: (
    config: AuditConfig,
    frame: BiarritzGeographicFrame,
  ) => Promise<LoadedOsmRoads | null>;
}

export class DefaultAuditEvidenceCollector implements AuditEvidenceCollector {
  constructor(private readonly dependencies: AuditEvidenceDependencies) {}
  async collect(config: AuditConfig): Promise<AuditEvidenceSnapshot>;
}
```

Move configuration validation, boundary/frame loading, in-scope filtering,
continuity, grouping, reconciliation, and the OSM probe from
`TrafficAuditRunner.run` into the collector. Move current default source and OSM
loaders without changing their behaviour. Make `TrafficAuditRunner` depend on
an `AuditEvidenceCollector`, call `collect`, build the summary, and write only
`audit-summary.json`.

- [ ] **Step 8: Run focused and full traffic tests**

Run: `pnpm test tests/traffic/audit-evidence.test.ts tests/traffic/audit-runner.test.ts tests/traffic/audit-summary.test.ts`

Expected: PASS with byte-identical existing summary fixtures.

- [ ] **Step 9: Review checkpoint**

Run: `pnpm typecheck && git diff --check`

Expected: exit code 0. Leave changes unstaged and uncommitted.

---

### Task 3: Build street subjects and target corridors

**Files:**
- Create: `src/visualization/street-network.ts`
- Create: `tests/visualization/street-network.test.ts`

**Interfaces:**
- Consumes: `IgnRoadSegment`.
- Produces: `StreetSubject`, `TargetCorridor`, `normalizeStreetName`,
  `buildStreetSubjects`, and `extractTargetCorridors`.

- [ ] **Step 1: Add failing normalization and connected-group tests**

```ts
expect(normalizeStreetName("  Avenue de Verdun ")).toBe("avenue de verdun");
expect(normalizeStreetName("Av. de la Gare")).toBe("avenue de la gare");

expect(buildStreetSubjects(segments)).toEqual([
  {
    id: "ign-street:avenue-de-verdun:TRON-1|TRON-2",
    displayName: "Avenue de Verdun",
    normalizedName: "avenue de verdun",
    segmentIds: ["TRON-1", "TRON-2"],
    geometry: expectedMultiLineString,
    vehicleAccess: ["free"],
    evidenceState: "no-data",
  },
]);
```

Add cases for accents, punctuation, `Rue` versus `Avenue`, disconnected roads
with the same name, left/right duplicate names, unnamed segments, and segments
whose endpoints are within one metre.

- [ ] **Step 2: Run the test and verify missing-module failure**

Run: `pnpm test tests/visualization/street-network.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement street normalization and connected grouping**

```ts
export type StreetEvidenceState =
  | "data-available"
  | "candidate-review"
  | "no-data";

export interface StreetSubject {
  readonly id: string;
  readonly displayName: string;
  readonly normalizedName: string;
  readonly segmentIds: readonly string[];
  readonly geometry: MultiLineString;
  readonly vehicleAccess: readonly IgnRoadSegment["vehicleAccess"][];
  readonly evidenceState: StreetEvidenceState;
}

export interface TargetCorridor {
  readonly targetId: "avenue-de-verdun" | "avenue-de-la-gare";
  readonly streetSubjectIds: readonly string[];
  readonly displayName: "Avenue de Verdun" | "Avenue de la Gare";
  readonly reviewStatus: "pending" | "reviewed";
}
```

Expand only the explicit abbreviations `av` and `av.` to `avenue`, and `bd` or
`bd.` to `boulevard`; do not guess other abbreviations. Strip accents and
punctuation for identity while preserving the best original display name.
Group segments only when they share the normalized name and their endpoints are
no more than one metre apart. Keep disconnected same-name roads as separate
subjects by including their sorted segment IDs in the ID.

- [ ] **Step 4: Run grouping tests and verify they pass**

Run: `pnpm test tests/visualization/street-network.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing target-corridor tests**

```ts
expect(extractTargetCorridors(subjects)).toEqual([
  {
    targetId: "avenue-de-la-gare",
    streetSubjectIds: ["ign-street:avenue-de-la-gare:TRON-9"],
    displayName: "Avenue de la Gare",
    reviewStatus: "pending",
  },
  {
    targetId: "avenue-de-verdun",
    streetSubjectIds: ["ign-street:avenue-de-verdun:TRON-1|TRON-2"],
    displayName: "Avenue de Verdun",
    reviewStatus: "pending",
  },
]);
```

Reject a missing target, a target with an unexpected normalized street type,
or target geometry outside the Biarritz buffer.

- [ ] **Step 6: Implement exact target extraction and run tests**

Run: `pnpm test tests/visualization/street-network.test.ts`

Expected: PASS.

- [ ] **Step 7: Review checkpoint**

Run: `pnpm typecheck && git diff --check`

Expected: exit code 0.

---

### Task 4: Define the visualization bundle and comparison rules

**Files:**
- Create: `src/visualization/contracts.ts`
- Create: `src/visualization/comparison.ts`
- Create: `src/visualization/bundle.ts`
- Create: `tests/visualization/contracts.test.ts`
- Create: `tests/visualization/comparison.test.ts`
- Create: `tests/visualization/bundle.test.ts`

**Interfaces:**
- Consumes: `AuditEvidenceSnapshot`, `StreetSubject`, `TargetCorridor`, and an
  explicit `StreetTrafficAssignment[]` that is empty for the current audit.
- Produces: `VisualizationBundle`, `visualizationBundleSchema`,
  `buildVisualizationBundle`, `serializeVisualizationBundle`, and
  `compareAnnualObservations`.

- [ ] **Step 1: Add failing schema-invariant tests**

Create one valid minimal bundle fixture, then mutate one property per test. The
schema must reject:

```ts
expect(() => parseBundle({ ...valid, municipalityInseeCode: "75056" })).toThrow();
expect(() => parseBundle(withDuplicateStationGroupIds(valid))).toThrow();
expect(() => parseBundle(withQuality(valid, "interpolated"))).toThrow();
expect(() => parseBundle(withUnknownSourceLink(valid))).toThrow();
expect(() => parseBundle(withInvalidCoordinate(valid))).toThrow();
```

- [ ] **Step 2: Run contract tests and verify failure**

Run: `pnpm test tests/visualization/contracts.test.ts`

Expected: FAIL because the bundle schema does not exist.

- [ ] **Step 3: Implement the schema and inferred public type**

Use this top-level contract:

```ts
export const visualizationBundleSchema = z.object({
  schemaVersion: z.literal(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  municipalityInseeCode: z.literal("64122"),
  bufferKilometers: z.literal(2),
  boundary: multiPolygonSchema,
  buffer: z.union([polygonSchema, multiPolygonSchema]),
  sources: z.array(visualizationSourceSchema),
  stationGroups: z.array(visualizationStationGroupSchema),
  linearRecords: z.array(visualizationLinearRecordSchema),
  streetSubjects: z.array(streetSubjectSchema),
  targetCorridors: z.array(targetCorridorSchema).length(2),
  streetAssignments: z.array(streetTrafficAssignmentSchema),
  issues: z.array(auditIssueSchema),
});

export type VisualizationBundle = z.infer<typeof visualizationBundleSchema>;

export interface StreetTrafficAssignment {
  readonly id: string;
  readonly streetSubjectId: string;
  readonly stationGroupId: string;
  readonly status: "accepted" | "candidate-review";
  readonly evidenceSource: "manual-review" | "osm-probe";
  readonly evidenceReference: string;
}
```

Add one `superRefine` pass for unique IDs, known source links, known station
members, exact target IDs, assignment references, finite GeoJSON coordinates,
and the interpolation ban.

- [ ] **Step 4: Run schema tests and verify they pass**

Run: `pnpm test tests/visualization/contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing comparison tests**

```ts
expect(compareAnnualObservations(measured2021, measured2024)).toEqual({
  eligibility: "eligible",
  baselineYear: 2021,
  comparisonYear: 2024,
  baselineVehiclesPerDay: 30_000,
  comparisonVehiclesPerDay: 32_000,
  absoluteChange: 2_000,
  percentageChange: 6.666666666666667,
});
```

Add cases for a missing canonical value, null vehicles per day, unresolved
conflict, different quality classes, reversed year order, same year, and zero
baseline. Zero baseline remains eligible for absolute
change but returns `percentageChange: null`.

- [ ] **Step 6: Implement comparison eligibility and run tests**

```ts
export type AnnualComparison =
  | { readonly eligibility: "ineligible"; readonly reason: ComparisonReason }
  | {
      readonly eligibility: "eligible";
      readonly baselineYear: number;
      readonly comparisonYear: number;
      readonly baselineVehiclesPerDay: number;
      readonly comparisonVehiclesPerDay: number;
      readonly absoluteChange: number;
      readonly percentageChange: number | null;
    };
```

Run: `pnpm test tests/visualization/comparison.test.ts`

Expected: PASS.

- [ ] **Step 7: Add failing deterministic bundle-builder tests**

Build twice with reversed input order. Assert byte identity, no acquisition
timestamp, latest-publication station location, retained member IDs, canonical
observations only, all current street states set to `no-data`, both pending
target corridors, and no assignment created from ambiguous OSM candidates.

- [ ] **Step 8: Implement the bundle builder and serializer**

```ts
export interface BuildVisualizationBundleInput {
  readonly audit: AuditEvidenceSnapshot;
  readonly ignArtifact: IgnRoadArtifact;
  readonly streets: readonly StreetSubject[];
  readonly targets: readonly TargetCorridor[];
  readonly assignments: readonly StreetTrafficAssignment[];
}

export function buildVisualizationBundle(
  input: BuildVisualizationBundleInput,
): VisualizationBundle;

export function serializeVisualizationBundle(
  bundle: VisualizationBundle,
): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}
```

Choose a station group's display point from the member whose source definition
has the newest publication date; break ties by station ID. Include only
canonical reconciled point observations in chart series. Keep conflicts and
warnings in group issues. Clip linear display geometry to the 2 km buffer but
retain original record IDs.

- [ ] **Step 9: Run all visualization-domain tests**

Run: `pnpm test tests/visualization/contracts.test.ts tests/visualization/comparison.test.ts tests/visualization/bundle.test.ts`

Expected: PASS.

- [ ] **Step 10: Review checkpoint**

Run: `pnpm typecheck && git diff --check`

Expected: exit code 0.

---

### Task 5: Add the deterministic visualization export command

**Files:**
- Create: `src/visualization/exporter.ts`
- Create: `tests/traffic/visualize-command.test.ts`
- Modify: `scripts/traffic/cli.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `AuditEvidenceCollector`, `acquireIgnRoads`, street-network
  functions, and `buildVisualizationBundle`.
- Produces: `VisualizationExporter.export(config): Promise<VisualizationBundle>`
  and `pnpm traffic:visualize --as-of YYYY-MM-DD`.

- [ ] **Step 1: Add a failing CLI wiring test**

```ts
expect(
  await runTrafficCli(
    ["visualize", "--as-of", "2026-08-29", "--output-dir", output],
    { ...dependencies, visualizationExporter },
  ),
).toBe(0);
expect(exportBundle).toHaveBeenCalledWith({
  asOf: "2026-08-29",
  cacheDirectory: resolve(".cache/traffic"),
  outputDirectory: resolve(output),
  boundaryInseeCode: "64122",
  bufferKilometers: 2,
});
expect(stdout).toEqual([
  `Wrote ${join(resolve(output), "biarritz.json")}`,
]);
```

Also test missing or malformed `--as-of` and an exporter failure.

- [ ] **Step 2: Run the CLI test and verify failure**

Run: `pnpm test tests/traffic/visualize-command.test.ts`

Expected: FAIL with unsupported `visualize` command.

- [ ] **Step 3: Implement the exporter**

```ts
export interface VisualizationExporter {
  export(config: AuditConfig): Promise<VisualizationBundle>;
}

export class DefaultVisualizationExporter implements VisualizationExporter {
  constructor(
    private readonly auditCollector: AuditEvidenceCollector,
    private readonly acquireRoads: typeof acquireIgnRoads,
  ) {}

  async export(config: AuditConfig): Promise<VisualizationBundle>;
}
```

Collect the audit snapshot, acquire IGN roads using
`geographicFrameBoundingBox(snapshot.frame)`, keep all named street segments,
build street subjects and targets, pass `assignments: []`, validate the result,
and atomically write `biarritz.json`.

- [ ] **Step 4: Implement CLI wiring and the package script**

Add optional `visualizationExporter` to `TrafficCliDependencies`, add
`runVisualize`, and preserve existing inspect/audit behaviour. Add:

```json
"traffic:visualize": "tsx scripts/traffic/cli.ts visualize"
```

- [ ] **Step 5: Run CLI and deterministic exporter tests**

Run: `pnpm test tests/traffic/visualize-command.test.ts tests/visualization/bundle.test.ts tests/traffic/audit-command.test.ts`

Expected: PASS.

- [ ] **Step 6: Run the live local export twice**

Run:

```sh
pnpm traffic:visualize --as-of 2026-08-29
cp artifacts/traffic/visualization/biarritz.json /tmp/busy-streets-visualization-first.json
pnpm traffic:visualize --as-of 2026-08-29
cmp -s /tmp/busy-streets-visualization-first.json artifacts/traffic/visualization/biarritz.json
```

Expected: exit code 0 and byte-identical files. If IGN returns a transient
failure, retain the exact blocked reason and rerun only after verifying the
endpoint state.

- [ ] **Step 7: Inspect the target corridors and bundle safety**

Run:

```sh
jq '{stationGroups: (.stationGroups | length), streets: (.streetSubjects | length), targets: [.targetCorridors[] | {targetId, reviewStatus}], assignments: (.streetAssignments | length)}' artifacts/traffic/visualization/biarritz.json
git check-ignore -v artifacts/traffic/visualization/biarritz.json
```

Expected: both target IDs present with `reviewStatus: "pending"`, zero street
assignments, and the bundle ignored by Git. Do not copy counts into tracked
documentation until the live output passes validation.

- [ ] **Step 8: Review checkpoint**

Run: `pnpm check && git diff --check`

Expected: all current tests and type checking pass.

---

### Task 6: Prepare exact web dependencies and stop for operator installation

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces the exact dependency manifest required by Tasks 7 through 10.

- [ ] **Step 1: Add exact runtime dependencies**

```json
"next": "16.3.3",
"react": "19.2.8",
"react-dom": "19.2.8",
"maplibre-gl": "6.6.0"
```

- [ ] **Step 2: Add exact development dependencies**

```json
"@types/react": "19.2.18",
"@types/react-dom": "19.2.5",
"@testing-library/react": "16.3.3",
"@testing-library/user-event": "14.6.6",
"@testing-library/jest-dom": "7.0.1",
"jsdom": "30.0.1"
```

- [ ] **Step 3: Add application scripts without running them**

```json
"dev": "next dev",
"build": "next build",
"test:ui": "vitest run --environment jsdom tests/visualization/components"
```

- [ ] **Step 4: Verify only the manifest diff**

Run: `git diff --check package.json && node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8'))"`

Expected: exit code 0. Do not run type checking after imports are added but
before packages exist.

- [ ] **Step 5: Stop and ask the operator to install**

Ask the operator to run:

```sh
pnpm install
```

Do not continue to Task 7 until the operator confirms installation. After
confirmation, run `pnpm typecheck` once to verify the resolved package graph.

---

### Task 7: Build the French application shell and protected local loader

**Files:**
- Create: `next.config.ts`
- Create: `next-env.d.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/visualization/messages/fr.ts`
- Create: `src/visualization/load-local-bundle.ts`
- Create: `tests/visualization/load-local-bundle.test.ts`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: `visualizationBundleSchema` and the default bundle path.
- Produces: `loadLocalVisualizationBundle(options)` and one server-rendered
  French page state: `ready`, `missing`, `invalid`, or `disabled`.

- [ ] **Step 1: Add failing loader tests**

```ts
await expect(
  loadLocalVisualizationBundle({
    path: fixturePath,
    runtime: "development",
  }),
).resolves.toEqual({ status: "ready", bundle: validBundle });

await expect(
  loadLocalVisualizationBundle({
    path: fixturePath,
    runtime: "production",
  }),
).resolves.toEqual({ status: "disabled" });
```

Add missing-file and invalid-Zod-data cases. Technical Zod details belong in
the `invalid` result and never replace the French heading.

- [ ] **Step 2: Run loader tests and verify failure**

Run: `pnpm test tests/visualization/load-local-bundle.test.ts`

Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement the local loader**

```ts
export type LocalBundleLoadResult =
  | { readonly status: "ready"; readonly bundle: VisualizationBundle }
  | { readonly status: "missing"; readonly expectedPath: string }
  | { readonly status: "invalid"; readonly details: readonly string[] }
  | { readonly status: "disabled" };

export async function loadLocalVisualizationBundle(options: {
  readonly path: string;
  readonly runtime: "development" | "test" | "production";
}): Promise<LocalBundleLoadResult>;
```

Refuse production before reading the file. Parse unknown JSON through
`visualizationBundleSchema.safeParse`.

- [ ] **Step 4: Add the French message boundary**

```ts
export const fr = {
  appTitle: "Trafic routier à Biarritz",
  overview: "Vue d'ensemble",
  layers: "Couches",
  compare: "Comparer",
  measured: "Mesuré",
  modeled: "Modélisé",
  unknownQuality: "Qualité indéterminée",
  noData: "Aucune donnée",
  comparisonUnavailable: "Comparaison indisponible",
  candidateReview: "Correspondance à vérifier",
  dataAvailable: "Données disponibles",
  invalidData: "Les données locales ne peuvent pas être chargées",
  missingData: "Générez d'abord les données locales de visualisation.",
  disabledData: "Les données locales sont désactivées hors développement.",
} as const;
```

- [ ] **Step 5: Configure Next.js TypeScript and create the server shell**

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

Set `"lib": ["DOM", "DOM.Iterable", "ES2024"]`, `"jsx": "preserve"`,
`"module": "ESNext"`, `"moduleResolution": "Bundler"`, and
`"plugins": [{ "name": "next" }]`. Add `next-env.d.ts`, `.next/types/**/*.ts`,
and `.next/dev/types/**/*.ts` to `include`. Create the standard Next type file:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

Create metadata with `lang="fr"`. In `page.tsx`, use the fixed path
`artifacts/traffic/visualization/biarritz.json`, render the exact export command
for `missing`, a disclosure of validation details for `invalid`, and pass the
validated bundle to a temporary semantic `<main>` for `ready`.

- [ ] **Step 6: Run loader tests, type checking, and existing tests**

Run: `pnpm typecheck && pnpm test tests/visualization/load-local-bundle.test.ts`

Expected: PASS.

- [ ] **Step 7: Review checkpoint**

Run: `git diff --check`

Expected: exit code 0. Do not start `pnpm dev`.

---

### Task 8: Build the full-street interactive map and overview controls

**Files:**
- Create: `src/visualization/map/map-controller.ts`
- Create: `src/visualization/components/MapCanvas.tsx`
- Create: `src/visualization/components/TrafficExplorer.tsx`
- Create: `src/visualization/components/LayerControls.tsx`
- Create: `src/visualization/components/StreetSearch.tsx`
- Create: `src/visualization/selectors.ts`
- Create: `tests/visualization/map/map-controller.test.ts`
- Create: `tests/visualization/components/traffic-explorer.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `VisualizationBundle`.
- Produces: `MapController`, `MapSelection`, pure overview selectors, and the
  first functional map screen.

- [ ] **Step 1: Add failing map-controller tests with a fake MapLibre map**

Assert exact source/layer order:

```ts
expect(fakeMap.sourceIds).toEqual([
  "boundary",
  "buffer",
  "streets",
  "targets",
  "linear-traffic",
  "stations",
]);
expect(fakeMap.layerIds).toEqual([
  "buffer-fill",
  "boundary-line",
  "street-lines",
  "target-lines",
  "linear-traffic-lines",
  "station-points",
]);
```

Assert the linear layer starts hidden, hover changes only `hovered` feature
state, click emits the selected street or station ID, and `destroy()` removes
every registered handler.

- [ ] **Step 2: Run map tests and verify failure**

Run: `pnpm test tests/visualization/map/map-controller.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement the narrow map adapter**

```ts
export type MapSelection =
  | { readonly kind: "street"; readonly id: string }
  | { readonly kind: "station"; readonly id: string }
  | { readonly kind: "target"; readonly id: string };

export interface MapController {
  setYear(year: number | "overview"): void;
  setLinearTrafficVisible(visible: boolean): void;
  select(selection: MapSelection | null): void;
  destroy(): void;
}
```

Use a style containing only a background layer. Add GeoJSON sources from the
bundle. Use MapLibre feature state for hover and selection. Use expressions
based on explicit evidence state and quality properties; do not derive colours
from traffic magnitude.

- [ ] **Step 4: Run map-controller tests and verify they pass**

Run: `pnpm test tests/visualization/map/map-controller.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing explorer interaction tests**

With Testing Library, assert:

```ts
import "@testing-library/jest-dom/vitest";

expect(screen.getByRole("heading", { name: fr.appTitle })).toBeVisible();
expect(screen.getByRole("button", { name: fr.overview })).toHaveAttribute(
  "aria-pressed",
  "true",
);
expect(screen.getByLabelText("Afficher les données linéaires 2023")).not.toBeChecked();
expect(screen.getByRole("combobox", { name: "Rechercher une rue" })).toBeVisible();
```

Select Avenue de Verdun through search and assert the same selection callback
used by map click. Enable the linear layer and assert the unknown-quality
warning appears.

- [ ] **Step 6: Run explorer tests and verify failure**

Run: `pnpm exec vitest run --environment jsdom tests/visualization/components/traffic-explorer.test.tsx`

Expected: FAIL.

- [ ] **Step 7: Implement the explorer, controls, search, and selectors**

Keep React state limited to selected feature, overview/year, linear visibility,
and bottom-sheet expansion. `StreetSearch` lists every named street subject and
the two targets, supports keyboard selection, and calls the same `select`
function as the map adapter. Use `next/dynamic` with `ssr: false` for
`MapCanvas` only.

- [ ] **Step 8: Run UI tests and type checking**

Run: `pnpm typecheck && pnpm exec vitest run --environment jsdom tests/visualization/components/traffic-explorer.test.tsx`

Expected: PASS.

- [ ] **Step 9: Review checkpoint**

Run: `git diff --check`

Expected: exit code 0. Do not start the site.

---

### Task 9: Add the bottom sheet, annual history, and comparison

**Files:**
- Create: `src/visualization/components/BottomSheet.tsx`
- Create: `src/visualization/components/AnnualHistory.tsx`
- Create: `src/visualization/components/ComparisonPanel.tsx`
- Create: `tests/visualization/components/bottom-sheet.test.tsx`
- Modify: `src/visualization/components/TrafficExplorer.tsx`
- Modify: `src/visualization/selectors.ts`

**Interfaces:**
- Consumes: `MapSelection`, `VisualizationBundle`, and
  `compareAnnualObservations`.
- Produces accessible station, street, target, history, provenance, and
  comparison views.

- [ ] **Step 1: Add failing station-detail tests**

```ts
expect(screen.getByRole("heading", { name: "D810 · Biarritz" })).toBeVisible();
expect(screen.getByText("32 000 véhicules par jour")).toBeVisible();
expect(screen.getByText(fr.measured)).toBeVisible();
expect(screen.getByRole("table", { name: "Valeurs annuelles" })).toBeVisible();
expect(screen.getByText("Correspondance routière ambiguë")).toBeVisible();
```

Assert source members and provenance are disclosed without implying a merged
production station ID.

- [ ] **Step 2: Add failing street and target-detail tests**

For an ordinary no-data street, assert `Aucune donnée`. For both target
corridors, assert `Comparaison indisponible`, `reviewStatus`, and no traffic
value. For a candidate-review fixture, assert that the candidate station value
is not rendered as assigned traffic.

- [ ] **Step 3: Add failing comparison tests**

Select 2021 and 2024 and assert raw values, `+2 000`, and `+6,7 %`. Assert that
a missing, conflicted, or different-quality year is disabled. Assert zero
baseline shows the absolute change and `Pourcentage non calculable`.

- [ ] **Step 4: Run the component test and verify failures**

Run: `pnpm exec vitest run --environment jsdom tests/visualization/components/bottom-sheet.test.tsx`

Expected: FAIL.

- [ ] **Step 5: Implement pure detail selectors**

```ts
export type DetailViewModel =
  | StationDetailViewModel
  | StreetDetailViewModel
  | TargetDetailViewModel;

export function selectDetail(
  bundle: VisualizationBundle,
  selection: MapSelection,
): DetailViewModel;
```

Selectors format no visible copy. Components use `fr` and `Intl.NumberFormat`
with locale `fr-FR`.

- [ ] **Step 6: Implement the bottom sheet and history**

Use a semantic `<section aria-labelledby>`. Render a compact SVG or CSS chart
plus an always-available table. Do not add a chart dependency. Mark gaps by
missing year labels rather than connecting them with an interpolated line.

- [ ] **Step 7: Implement same-location comparison**

Populate selectors only with eligible canonical years. Call
`compareAnnualObservations` for the result. Keep the button disabled until two
distinct eligible years are selected.

- [ ] **Step 8: Run UI and domain tests**

Run: `pnpm exec vitest run --environment jsdom tests/visualization/components/bottom-sheet.test.tsx tests/visualization/comparison.test.ts`

Expected: PASS.

- [ ] **Step 9: Review checkpoint**

Run: `pnpm typecheck && git diff --check`

Expected: exit code 0.

---

### Task 10: Apply the local-editorial system, accessibility, documentation, and operator handoff

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/visualization/components/TrafficExplorer.tsx`
- Modify: `src/visualization/components/BottomSheet.tsx`
- Modify: `README.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/DECISIONS.md`
- Modify: `CONTEXT.md`
- Test: `tests/visualization/components/traffic-explorer.test.tsx`
- Test: `tests/visualization/components/bottom-sheet.test.tsx`

**Interfaces:**
- Consumes all completed prototype components.
- Produces the approved responsive local-editorial experience and a precise
  operator verification checklist.

- [ ] **Step 1: Add failing accessibility-state tests**

Assert visible focus targets, labelled layer controls, `aria-live="polite"` on
selection summaries, a close control for the sheet, keyboard street selection,
and text equivalents for charts. Assert the application never renders a colour
legend without its text labels.

- [ ] **Step 2: Run UI tests and verify failure**

Run: `pnpm exec vitest run --environment jsdom tests/visualization/components`

Expected: FAIL for missing accessibility states.

- [ ] **Step 3: Implement design tokens and responsive layout**

Define these starting tokens in `globals.css`:

```css
:root {
  --paper: #f5f1e8;
  --paper-raised: #fffaf0;
  --ink: #151515;
  --data-red: #e8482e;
  --evidence-yellow: #ffe563;
  --map-water: #bdd1d3;
  --map-land: #efeadf;
  --muted: #69665f;
  --line: 2px solid var(--ink);
}
```

Use serif headings and sans-serif controls without adding remote font
requests. Use system fallbacks. Keep the map full viewport, the bottom sheet
low on desktop, and a draggable-height CSS layout on small screens. Respect
`prefers-reduced-motion: reduce` by removing transitions and animated sheet
movement.

- [ ] **Step 4: Complete accessibility behaviour and run UI tests**

Run: `pnpm exec vitest run --environment jsdom tests/visualization/components`

Expected: PASS.

- [ ] **Step 5: Update canonical documentation**

Add an accepted decision covering the local-only Next.js/MapLibre prototype,
IGN BD TOPO reference geometry, full-street interaction, neutral background,
and the ban on inferred street assignments. Update README with the export and
operator-run commands. Update STATUS with only verified source, static, test,
and browser evidence. Update CONTEXT with `street subject`, `target corridor`,
and visualization-bundle definitions.

- [ ] **Step 6: Run fresh static verification**

Run:

```sh
pnpm check
pnpm traffic:visualize --as-of 2026-08-29
git diff --check
git ls-files .cache artifacts .superpowers
git status --short
```

Expected: all tests and type checking pass; export succeeds; the tracked-file
query returns no raw, generated, or visual-companion files. Leave all changes
unstaged and uncommitted.

- [ ] **Step 7: Ask the operator for build and server verification**

Ask the operator to run:

```sh
pnpm build
pnpm dev
```

Wait for the operator to confirm the local URL. Do not start either command.

- [ ] **Step 8: Perform the focused built-in-browser check**

After the operator confirms the site is running, verify:

1. The French title and overview load without console errors.
2. The complete named street layer appears over the neutral background.
3. Hover highlights a street; click and keyboard search open the same sheet.
4. A station sheet shows measured annual history and provenance.
5. A valid two-year comparison shows raw, absolute, and percentage changes.
6. The 2023 linear layer starts hidden and displays the unknown-quality warning
   when enabled.
7. Verdun and Gare open as target corridors with no assigned comparison.
8. Mobile width preserves map interaction, sheet controls, focus order, and
   readable values.
9. Basemap/network failure leaves local evidence layers usable.

Capture screenshots for desktop overview, station history, target no-data
state, and mobile sheet. Store them outside Git unless the operator separately
approves tracked documentation images.

- [ ] **Step 9: Record final evidence and unresolved gates**

Update STATUS with the exact test count, export checksum, IGN artifact checksum
and edition, reviewed target-corridor state, operator build result, and browser
findings. State plainly that no exact traffic series is assigned to Verdun or
Gare unless new evidence changed that fact during implementation.

- [ ] **Step 10: Final verification checkpoint**

Run: `pnpm check && git diff --check && git status --short`

Expected: exit code 0, with every implementation and documentation change
visible as unstaged work and no generated data tracked.

---

## Implementation Stop Points

1. Stop in Task 0 until the operator decides whether the tracked
   visual-companion files should be removed and ignored or retained.
2. Stop after Task 6 until the operator confirms `pnpm install` completed.
3. Stop after Task 10 Step 6 until the operator runs `pnpm build` and
   `pnpm dev` and supplies the local URL.
4. Stop before any deployment, publication, account creation, paid service,
   database work, Git staging, or commit.

## Definition of Done

- The deterministic local bundle contains the Biarritz boundary, buffer, full
  named IGN street network, both target corridors, in-scope station groups,
  canonical annual observations, optional 2023 lines, quality, and provenance.
- The local French application opens in overview mode and supports street
  hover, tap, keyboard search, station selection, annual history, and valid
  same-location comparison.
- Every street has an explicit availability state. No ambiguous station value
  is presented as street traffic.
- Verdun and Gare remain explicit target corridors and show the honest current
  comparison state.
- Static checks, tests, deterministic export, operator build, and focused
  browser verification have recorded evidence.
- Git contains no raw downloads, unclear-licence data, visualization bundle,
  visual-companion artifacts, screenshots without approval, secrets, staged
  changes, or commits from this work.
