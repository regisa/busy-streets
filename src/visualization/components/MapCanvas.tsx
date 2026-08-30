"use client";

import * as maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { VisualizationBundle } from "../contracts";
import {
  createMapController,
  type MapAdapter,
  type MapController,
  type MapSelection,
} from "../map/map-controller";

export interface MapCanvasProps {
  readonly bundle: VisualizationBundle;
  readonly selection: MapSelection | null;
  readonly year: number | "overview";
  readonly linearTrafficVisible: boolean;
  readonly onSelect: (selection: MapSelection) => void;
}

export function MapCanvas({
  bundle,
  selection,
  year,
  linearTrafficVisible,
  onSelect,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapController | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      center: [-1.5586, 43.4832],
      zoom: 13,
      attributionControl: false,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "neutral-background",
            type: "background",
            paint: { "background-color": "#bdd1d3" },
          },
        ],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: "Données routières : IGN" }),
      "bottom-left",
    );
    const handleLoad = () => {
      const controller = createMapController({
        map: map as unknown as MapAdapter,
        bundle,
        onSelect,
      });
      controllerRef.current = controller;
      controller.setYear(year);
      controller.setLinearTrafficVisible(linearTrafficVisible);
      controller.select(selection);
    };
    map.on("load", handleLoad);
    return () => {
      map.off("load", handleLoad);
      controllerRef.current?.destroy();
      controllerRef.current = null;
      map.remove();
    };
  }, [bundle, onSelect]);

  useEffect(() => controllerRef.current?.setYear(year), [year]);
  useEffect(
    () => controllerRef.current?.setLinearTrafficVisible(linearTrafficVisible),
    [linearTrafficVisible],
  );
  useEffect(() => controllerRef.current?.select(selection), [selection]);

  return <div ref={containerRef} className="map-canvas" aria-label="Carte de Biarritz" />;
}
