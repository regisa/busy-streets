import { describe, expect, test, vi } from "vitest";

import type { VisualizationBundle } from "../../../src/visualization/contracts.js";
import {
  createBaseMapStyle,
  createMapController,
  loadBaseMapStyle,
} from "../../../src/visualization/map/map-controller.js";

class FakeMap {
  readonly sourceIds: string[] = [];
  readonly layerIds: string[] = [];
  readonly layers: Array<{ readonly id: string; readonly [key: string]: unknown }> = [];
  readonly featureStates: Array<{ target: unknown; state: unknown }> = [];
  readonly layoutChanges: Array<{ layer: string; property: string; value: unknown }> = [];
  readonly filters: Array<{ layer: string; filter: unknown }> = [];
  private readonly handlers = new Map<string, Set<(event: MapEvent) => void>>();

  addSource(id: string, _source: unknown): void { this.sourceIds.push(id); }
  addLayer(layer: { readonly id: string; readonly [key: string]: unknown }): void {
    this.layerIds.push(layer.id);
    this.layers.push(layer);
  }
  setFeatureState(target: unknown, state: unknown): void { this.featureStates.push({ target, state }); }
  setLayoutProperty(layer: string, property: string, value: unknown): void {
    this.layoutChanges.push({ layer, property, value });
  }
  setFilter(layer: string, filter: unknown): void { this.filters.push({ layer, filter }); }
  on(type: string, layer: string, handler: (event: MapEvent) => void): void {
    const key = `${type}:${layer}`;
    const values = this.handlers.get(key) ?? new Set();
    values.add(handler);
    this.handlers.set(key, values);
  }
  off(type: string, layer: string, handler: (event: MapEvent) => void): void {
    this.handlers.get(`${type}:${layer}`)?.delete(handler);
  }
  emit(type: string, layer: string, event: MapEvent): void {
    for (const handler of this.handlers.get(`${type}:${layer}`) ?? []) handler(event);
  }
  handlerCount(): number {
    return [...this.handlers.values()].reduce((total, handlers) => total + handlers.size, 0);
  }
}

interface MapEvent {
  readonly features?: readonly { readonly id?: string | number }[];
}

function bundle(): VisualizationBundle {
  const ring: [number, number][] = [[-1.57, 43.47], [-1.53, 43.47], [-1.53, 43.5], [-1.57, 43.5], [-1.57, 43.47]];
  return {
    schemaVersion: 1,
    asOf: "2026-08-29",
    municipalityInseeCode: "64122",
    bufferKilometers: 2,
    boundary: { type: "MultiPolygon", coordinates: [[[...ring]]] },
    buffer: { type: "Polygon", coordinates: [[...ring]] },
    sources: [],
    stationGroups: [{
      id: "station-group:one",
      location: { type: "Point", coordinates: [-1.55, 43.48] },
      memberStationIds: ["station:one"],
      members: [{
        id: "station:one",
        sourceId: "source",
        sourceRecordId: "record",
        counterType: "permanent",
        location: { type: "Point", coordinates: [-1.55, 43.48] },
        geographicScope: "inside-municipality",
      }],
      observations: [],
      issues: [],
    }],
    linearRecords: [],
    streetSubjects: [
      {
        id: "street:verdun",
        displayName: "Avenue de Verdun",
        normalizedName: "avenue de verdun",
        segmentIds: ["1"],
        geometry: { type: "MultiLineString", coordinates: [[[-1.56, 43.48], [-1.55, 43.48]]] },
        vehicleAccess: ["free"],
        evidenceState: "no-data",
      },
      {
        id: "street:gare",
        displayName: "Avenue de la Gare",
        normalizedName: "avenue de la gare",
        segmentIds: ["2"],
        geometry: { type: "MultiLineString", coordinates: [[[-1.55, 43.47], [-1.54, 43.47]]] },
        vehicleAccess: ["free"],
        evidenceState: "no-data",
      },
    ],
    targetCorridors: [
      { targetId: "avenue-de-la-gare", streetSubjectIds: ["street:gare"], displayName: "Avenue de la Gare", reviewStatus: "pending" },
      { targetId: "avenue-de-verdun", streetSubjectIds: ["street:verdun"], displayName: "Avenue de Verdun", reviewStatus: "pending" },
    ],
    streetAssignments: [],
    issues: [],
  };
}

describe("MapController", () => {
  test("uses a valid contextual basemap style", async () => {
    const contextualStyle = {
      version: 8 as const,
      sources: { openmaptiles: { type: "vector" } },
      layers: [{ id: "land", type: "background" }],
    };

    await expect(
      loadBaseMapStyle(async () => contextualStyle),
    ).resolves.toBe(contextualStyle);
  });

  test.each([
    ["a failed request", async () => Promise.reject(new Error("offline"))],
    ["a malformed style", async () => ({ version: 8, layers: [] })],
  ])("uses the neutral fallback after %s", async (_scenario, fetchStyle) => {
    const style = await loadBaseMapStyle(fetchStyle);

    expect(style).toEqual(createBaseMapStyle());
  });

  test("keeps a neutral local fallback style", () => {
    const style = createBaseMapStyle();

    expect(style.layers.map(({ id }) => id)).toEqual(["neutral-background"]);
    expect(style.sources).toEqual({});
  });

  test("adds deterministic local sources and layers with linear traffic hidden", () => {
    const map = new FakeMap();
    createMapController({ map, bundle: bundle(), onSelect: () => undefined });

    expect(map.sourceIds).toEqual([
      "boundary", "buffer", "streets", "targets", "linear-traffic", "stations",
    ]);
    expect(map.layerIds).toEqual([
      "buffer-fill", "boundary-line", "street-lines", "target-lines", "linear-traffic-lines", "station-points",
    ]);
    expect(map.layoutChanges).toContainEqual({
      layer: "linear-traffic-lines",
      property: "visibility",
      value: "none",
    });
    const bufferLayer = map.layers.find(({ id }) => id === "buffer-fill");
    expect(bufferLayer?.paint).toMatchObject({ "fill-opacity": 0.18 });
  });

  test("tracks hover and lets source streets own target-overlay clicks", () => {
    const map = new FakeMap();
    const onSelect = vi.fn();
    const controller = createMapController({ map, bundle: bundle(), onSelect });

    map.emit("mousemove", "street-lines", { features: [{ id: "street:verdun" }] });
    map.emit("mousemove", "street-lines", { features: [{ id: "street:gare" }] });
    expect(map.featureStates).toEqual([
      { target: { source: "streets", id: "street:verdun" }, state: { hovered: true } },
      { target: { source: "streets", id: "street:verdun" }, state: { hovered: false } },
      { target: { source: "streets", id: "street:gare" }, state: { hovered: true } },
    ]);

    map.emit("click", "street-lines", { features: [{ id: "street:verdun" }] });
    map.emit("click", "station-points", { features: [{ id: "station-group:one" }] });
    map.emit("click", "target-lines", { features: [{ id: "avenue-de-verdun" }] });
    expect(onSelect).toHaveBeenNthCalledWith(1, { kind: "street", id: "street:verdun" });
    expect(onSelect).toHaveBeenNthCalledWith(2, { kind: "station", id: "station-group:one" });
    expect(onSelect).toHaveBeenCalledTimes(2);
    controller.destroy();
    expect(map.handlerCount()).toBe(0);
  });

  test("controls overview filters and linear visibility", () => {
    const map = new FakeMap();
    const controller = createMapController({ map, bundle: bundle(), onSelect: () => undefined });
    controller.setLinearTrafficVisible(true);
    controller.setYear(2024);

    expect(map.layoutChanges.at(-1)).toEqual({
      layer: "linear-traffic-lines",
      property: "visibility",
      value: "visible",
    });
    expect(map.filters).toContainEqual({
      layer: "station-points",
      filter: ["in", 2024, ["get", "years"]],
    });
  });

  test("updates several selected streets by set difference", () => {
    const map = new FakeMap();
    const controller = createMapController({ map, bundle: bundle(), onSelect: () => undefined });

    controller.setStreetSelection(["street:verdun", "street:gare", "street:gare"]);
    controller.setStreetSelection(["street:gare", "street:other"]);

    expect(map.featureStates).toEqual([
      {
        target: { source: "streets", id: "street:verdun" },
        state: { selected: true },
      },
      {
        target: { source: "streets", id: "street:gare" },
        state: { selected: true },
      },
      {
        target: { source: "streets", id: "street:verdun" },
        state: { selected: false },
      },
      {
        target: { source: "streets", id: "street:other" },
        state: { selected: true },
      },
    ]);
  });

  test("keeps focused station state independent from selected streets", () => {
    const map = new FakeMap();
    const controller = createMapController({ map, bundle: bundle(), onSelect: () => undefined });

    controller.setStreetSelection(["street:verdun"]);
    controller.setFocusedSelection({ kind: "station", id: "station-group:one" });
    controller.setFocusedSelection(null);

    expect(map.featureStates).toEqual([
      {
        target: { source: "streets", id: "street:verdun" },
        state: { selected: true },
      },
      {
        target: { source: "stations", id: "station-group:one" },
        state: { selected: true },
      },
      {
        target: { source: "stations", id: "station-group:one" },
        state: { selected: false },
      },
    ]);
    expect(map.featureStates).not.toContainEqual({
      target: { source: "streets", id: "street:verdun" },
      state: { selected: false },
    });
  });
});
