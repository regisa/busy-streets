"use client";

import * as maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { VisualizationBundle } from "../contracts";
import {
  createMapController,
  loadBaseMapStyle,
  OPENFREEMAP_POSITRON_STYLE_URL,
  type MapAdapter,
  type MapController,
  type MapSelection,
} from "../map/map-controller";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export interface MapCanvasProps {
  readonly bundle: VisualizationBundle;
  readonly selectedStreetSubjectIds: readonly string[];
  readonly focusedSelection: MapSelection | null;
  readonly year: number | "overview";
  readonly onSelect: (selection: MapSelection) => void;
}

export function MapCanvas({
  bundle,
  selectedStreetSubjectIds,
  focusedSelection,
  year,
  onSelect,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapController | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    let handleLoad: (() => void) | null = null;

    const startMap = async () => {
      const style = await loadBaseMapStyle(async () => {
        const response = await fetch(OPENFREEMAP_POSITRON_STYLE_URL);
        if (!response.ok) {
          throw new Error(`Basemap request failed with ${response.status}`);
        }
        return response.json() as Promise<unknown>;
      });
      if (cancelled) return;

      map = new maplibregl.Map({
        container,
        center: [-1.5586, 43.4832],
        zoom: 13,
        attributionControl: false,
        style: style as maplibregl.StyleSpecification,
      });
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right",
      );
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: "Données routières : IGN",
        }),
        "bottom-left",
      );
      handleLoad = () => {
        if (!map) return;
        const controller = createMapController({
          map: map as unknown as MapAdapter,
          bundle,
          onSelect,
        });
        controllerRef.current = controller;
        controller.setYear(year);
        controller.setStreetSelection(selectedStreetSubjectIds);
        controller.setFocusedSelection(focusedSelection);
      };
      map.on("load", handleLoad);
    };
    void startMap();

    return () => {
      cancelled = true;
      if (map && handleLoad) map.off("load", handleLoad);
      controllerRef.current?.destroy();
      controllerRef.current = null;
      map?.remove();
    };
  }, [bundle, onSelect]);

  useEffect(() => controllerRef.current?.setYear(year), [year]);
  useEffect(
    () => controllerRef.current?.setStreetSelection(selectedStreetSubjectIds),
    [selectedStreetSubjectIds],
  );
  useEffect(
    () => controllerRef.current?.setFocusedSelection(focusedSelection),
    [focusedSelection],
  );

  return <div ref={containerRef} className="map-canvas" aria-label="Carte de Biarritz" />;
}
