import type { VisualizationBundle } from "../contracts";

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

export interface MapEventLike {
  readonly features?: readonly { readonly id?: string | number }[];
}

export interface MapAdapter {
  addSource(id: string, source: unknown): void;
  addLayer(layer: { readonly id: string; readonly [key: string]: unknown }): void;
  setFeatureState(target: unknown, state: unknown): void;
  setLayoutProperty(layer: string, property: string, value: unknown): void;
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

export function createMapController(options: {
  readonly map: MapAdapter;
  readonly bundle: VisualizationBundle;
  readonly onSelect: (selection: MapSelection) => void;
}): MapController {
  const { map, bundle, onSelect } = options;
  addSources(map, bundle);
  addLayers(map);
  map.setLayoutProperty("linear-traffic-lines", "visibility", "none");

  const removers: Array<() => void> = [];
  let hoveredStreetId: string | null = null;
  let selected: MapSelection | null = null;

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
  listen("click", "target-lines", (event) => {
    const id = readFeatureId(event);
    if (id) onSelect({ kind: "target", id });
  });

  return {
    setYear(year) {
      const filter =
        year === "overview" ? null : ["in", year, ["get", "years"]];
      map.setFilter("station-points", filter);
      map.setFilter(
        "linear-traffic-lines",
        year === "overview" ? null : ["==", ["get", "year"], year],
      );
    },
    setLinearTrafficVisible(visible) {
      map.setLayoutProperty(
        "linear-traffic-lines",
        "visibility",
        visible ? "visible" : "none",
      );
    },
    select(nextSelection) {
      if (selected) {
        map.setFeatureState(featureTarget(selected), { selected: false });
      }
      selected = nextSelection;
      if (selected) {
        map.setFeatureState(featureTarget(selected), { selected: true });
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
  map.addSource("linear-traffic", {
    type: "geojson",
    promoteId: "id",
    data: featureCollection(
      bundle.linearRecords.map((record) =>
        feature(record.id, record.geometry, {
          id: record.id,
          year: record.observation.year,
          quality: record.observation.quality,
        }),
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
    paint: { "fill-color": "#efeadf", "fill-opacity": 0.72 },
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
    id: "linear-traffic-lines",
    type: "line",
    source: "linear-traffic",
    paint: { "line-color": "#d19b00", "line-width": 3 },
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
