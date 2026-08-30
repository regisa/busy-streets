import type { VisualizationBundle } from "../contracts";

export const OPENFREEMAP_POSITRON_STYLE_URL =
  "https://tiles.openfreemap.org/styles/positron";

interface BaseMapStyle {
  readonly version: 8;
  readonly sources: Readonly<Record<string, unknown>>;
  readonly layers: readonly BaseMapLayer[];
  readonly [key: string]: unknown;
}

interface BaseMapLayer {
  readonly id: string;
  readonly [key: string]: unknown;
}

export type MapSelection =
  | { readonly kind: "street"; readonly id: string }
  | { readonly kind: "station"; readonly id: string }
  | { readonly kind: "target"; readonly id: string };

export interface MapController {
  setYear(year: number | "overview"): void;
  setStreetSelection(streetSubjectIds: readonly string[]): void;
  setFocusedSelection(selection: MapSelection | null): void;
  destroy(): void;
}

export interface MapEventLike {
  readonly features?: readonly { readonly id?: string | number }[];
}

export interface MapAdapter {
  addSource(id: string, source: unknown): void;
  addLayer(layer: { readonly id: string; readonly [key: string]: unknown }): void;
  setFeatureState(target: unknown, state: unknown): void;
  setFilter(layer: string, filter: unknown): void;
  on(
    type: string,
    layer: string,
    handler: (event: MapEventLike) => void,
  ): void;
  off(
    type: string,
    layer: string,
    handler: (event: MapEventLike) => void,
  ): void;
}

export function createBaseMapStyle(): BaseMapStyle {
  return {
    version: 8 as const,
    sources: {},
    layers: [
      {
        id: "neutral-background",
        type: "background" as const,
        paint: { "background-color": "#bdd1d3" },
      },
    ],
  };
}

export async function loadBaseMapStyle(
  fetchStyle: () => Promise<unknown>,
): Promise<BaseMapStyle> {
  try {
    const style = await fetchStyle();
    if (isBaseMapStyle(style)) return style;
  } catch {
    // The local evidence layers remain usable on the neutral fallback.
  }
  return createBaseMapStyle();
}

function isBaseMapStyle(value: unknown): value is BaseMapStyle {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BaseMapStyle>;
  return (
    candidate.version === 8 &&
    !!candidate.sources &&
    typeof candidate.sources === "object" &&
    !Array.isArray(candidate.sources) &&
    Array.isArray(candidate.layers) &&
    candidate.layers.every(
      (layer) =>
        !!layer &&
        typeof layer === "object" &&
        typeof (layer as Partial<BaseMapLayer>).id === "string",
    )
  );
}

export function createMapController(options: {
  readonly map: MapAdapter;
  readonly bundle: VisualizationBundle;
  readonly onSelect: (selection: MapSelection) => void;
}): MapController {
  const { map, bundle, onSelect } = options;
  addSources(map, bundle);
  addLayers(map);

  const removers: Array<() => void> = [];
  let hoveredStreetId: string | null = null;
  let selectedStreetIds = new Set<string>();
  let focusedSelection: MapSelection | null = null;

  const listen = (
    type: string,
    layer: string,
    handler: (event: MapEventLike) => void,
  ): void => {
    map.on(type, layer, handler);
    removers.push(() => map.off(type, layer, handler));
  };

  listen("mousemove", "street-lines", (event) => {
    const id = readFeatureId(event);
    if (!id || id === hoveredStreetId) return;
    if (hoveredStreetId) {
      map.setFeatureState(
        { source: "streets", id: hoveredStreetId },
        { hovered: false },
      );
    }
    hoveredStreetId = id;
    map.setFeatureState({ source: "streets", id }, { hovered: true });
  });
  listen("mouseleave", "street-lines", () => {
    if (!hoveredStreetId) return;
    map.setFeatureState(
      { source: "streets", id: hoveredStreetId },
      { hovered: false },
    );
    hoveredStreetId = null;
  });
  listen("click", "street-lines", (event) => {
    const id = readFeatureId(event);
    if (id) onSelect({ kind: "street", id });
  });
  listen("click", "station-points", (event) => {
    const id = readFeatureId(event);
    if (id) onSelect({ kind: "station", id });
  });
  return {
    setYear(year) {
      const filter =
        year === "overview" ? null : ["in", year, ["get", "years"]];
      map.setFilter("station-points", filter);
    },
    setStreetSelection(streetSubjectIds) {
      const nextStreetIds = new Set(streetSubjectIds);
      for (const id of selectedStreetIds) {
        if (!nextStreetIds.has(id)) {
          map.setFeatureState({ source: "streets", id }, { selected: false });
        }
      }
      for (const id of nextStreetIds) {
        if (!selectedStreetIds.has(id)) {
          map.setFeatureState({ source: "streets", id }, { selected: true });
        }
      }
      selectedStreetIds = nextStreetIds;
    },
    setFocusedSelection(nextSelection) {
      if (focusedSelection) {
        map.setFeatureState(featureTarget(focusedSelection), { selected: false });
      }
      focusedSelection = nextSelection;
      if (focusedSelection) {
        map.setFeatureState(featureTarget(focusedSelection), { selected: true });
      }
    },
    destroy() {
      if (hoveredStreetId) {
        map.setFeatureState(
          { source: "streets", id: hoveredStreetId },
          { hovered: false },
        );
        hoveredStreetId = null;
      }
      for (const id of selectedStreetIds) {
        map.setFeatureState({ source: "streets", id }, { selected: false });
      }
      selectedStreetIds = new Set();
      if (focusedSelection) {
        map.setFeatureState(featureTarget(focusedSelection), { selected: false });
        focusedSelection = null;
      }
      for (const remove of removers.splice(0)) remove();
    },
  };
}

function addSources(map: MapAdapter, bundle: VisualizationBundle): void {
  map.addSource("boundary", {
    type: "geojson",
    data: featureCollection([
      feature("boundary", bundle.boundary, { kind: "boundary" }),
    ]),
  });
  map.addSource("buffer", {
    type: "geojson",
    data: featureCollection([
      feature("buffer", bundle.buffer, { kind: "buffer" }),
    ]),
  });
  map.addSource("streets", {
    type: "geojson",
    promoteId: "id",
    data: featureCollection(
      bundle.streetSubjects.map((street) =>
        feature(street.id, street.geometry, {
          id: street.id,
          name: street.displayName,
          evidenceState: street.evidenceState,
          vehicleAccess: street.vehicleAccess,
        }),
      ),
    ),
  });
  const streetsById = new Map(
    bundle.streetSubjects.map((street) => [street.id, street]),
  );
  map.addSource("targets", {
    type: "geojson",
    promoteId: "id",
    data: featureCollection(
      bundle.targetCorridors.map((target) =>
        feature(
          target.targetId,
          {
            type: "MultiLineString",
            coordinates: target.streetSubjectIds.flatMap(
              (id) => streetsById.get(id)?.geometry.coordinates ?? [],
            ),
          },
          {
            id: target.targetId,
            name: target.displayName,
            reviewStatus: target.reviewStatus,
          },
        ),
      ),
    ),
  });
  map.addSource("stations", {
    type: "geojson",
    promoteId: "id",
    data: featureCollection(
      bundle.stationGroups.map((group) => {
        const latest = group.observations.at(-1);
        return feature(group.id, group.location, {
          id: group.id,
          years: group.observations.map(({ year }) => year),
          latestYear: latest?.year ?? null,
          quality: latest?.quality ?? "unknown",
        });
      }),
    ),
  });
}

function addLayers(map: MapAdapter): void {
  map.addLayer({
    id: "buffer-fill",
    type: "fill",
    source: "buffer",
    paint: { "fill-color": "#efeadf", "fill-opacity": 0.18 },
  });
  map.addLayer({
    id: "boundary-line",
    type: "line",
    source: "boundary",
    paint: { "line-color": "#151515", "line-width": 2 },
  });
  map.addLayer({
    id: "street-lines",
    type: "line",
    source: "streets",
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false], "#e8482e",
        ["boolean", ["feature-state", "hovered"], false], "#151515",
        "#8b877e",
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false], 5,
        ["boolean", ["feature-state", "hovered"], false], 4,
        1.4,
      ],
    },
  });
  map.addLayer({
    id: "target-lines",
    type: "line",
    source: "targets",
    paint: {
      "line-color": "#e8482e",
      "line-width": 4,
      "line-dasharray": [2, 1.5],
    },
  });
  map.addLayer({
    id: "station-points",
    type: "circle",
    source: "stations",
    paint: {
      "circle-color": [
        "match", ["get", "quality"],
        "measured", "#e8482e",
        "modeled", "#ffe563",
        "#fffaf0",
      ],
      "circle-radius": 7,
      "circle-stroke-color": "#151515",
      "circle-stroke-width": 2,
    },
  });
}

function readFeatureId(event: MapEventLike): string | null {
  const id = event.features?.[0]?.id;
  return id === undefined ? null : String(id);
}

function featureTarget(selection: MapSelection): { source: string; id: string } {
  return {
    source:
      selection.kind === "street"
        ? "streets"
        : selection.kind === "station"
          ? "stations"
          : "targets",
    id: selection.id,
  };
}

function featureCollection(features: readonly unknown[]) {
  return { type: "FeatureCollection", features } as const;
}

function feature(id: string, geometry: unknown, properties: object) {
  return { type: "Feature", id, geometry, properties } as const;
}
