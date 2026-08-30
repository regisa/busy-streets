"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import type { VisualizationBundle } from "../contracts";
import type { MapSelection } from "../map/map-controller";
import { fr } from "../messages/fr";
import { selectAvailableYears, selectStreetSearchOptions } from "../selectors";
import { LayerControls } from "./LayerControls";
import { StreetSearch } from "./StreetSearch";
import { BottomSheet } from "./BottomSheet";

const MapCanvas = dynamic(
  () => import("./MapCanvas").then((module) => module.MapCanvas),
  { ssr: false },
);

export function TrafficExplorer({
  bundle,
  onSelectionChange,
}: Readonly<{
  bundle: VisualizationBundle;
  onSelectionChange?: (selection: MapSelection) => void;
}>) {
  const [year, setYear] = useState<number | "overview">("overview");
  const [linearTrafficVisible, setLinearTrafficVisible] = useState(false);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const years = useMemo(() => selectAvailableYears(bundle), [bundle]);
  const searchOptions = useMemo(() => selectStreetSearchOptions(bundle), [bundle]);
  const select = useCallback(
    (nextSelection: MapSelection) => {
      setSelection(nextSelection);
      onSelectionChange?.(nextSelection);
    },
    [onSelectionChange],
  );

  return (
    <main className="traffic-explorer">
      <MapCanvas
        bundle={bundle}
        selection={selection}
        year={year}
        linearTrafficVisible={linearTrafficVisible}
        onSelect={select}
      />
      <header className="explorer-header">
        <h1 className="visually-hidden">{fr.appTitle}</h1>
        <nav className="year-navigation" aria-label="Période affichée">
          <button
            type="button"
            aria-pressed={year === "overview"}
            onClick={() => setYear("overview")}
          >
            {fr.overview}
          </button>
          {years.map((availableYear) => (
            <button
              key={availableYear}
              type="button"
              aria-pressed={year === availableYear}
              onClick={() => setYear(availableYear)}
            >
              {availableYear}
            </button>
          ))}
        </nav>
        <StreetSearch options={searchOptions} onSelect={select} />
        <button
          type="button"
          className="compare-button"
          aria-controls="traffic-detail-sheet"
          disabled={selection?.kind !== "station"}
        >
          {fr.compare}
        </button>
        <LayerControls
          linearTrafficVisible={linearTrafficVisible}
          onLinearTrafficVisibleChange={setLinearTrafficVisible}
        />
      </header>
      <p className="selection-summary" aria-live="polite">
        {selection ? `Sélection : ${selection.id}` : "Aucune sélection"}
      </p>
      {selection ? (
        <div id="traffic-detail-sheet">
          <BottomSheet
            bundle={bundle}
            selection={selection}
            onClose={() => setSelection(null)}
          />
        </div>
      ) : null}
    </main>
  );
}
