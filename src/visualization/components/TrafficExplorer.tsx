"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import type { VisualizationBundle } from "../contracts";
import type { MapSelection } from "../map/map-controller";
import { fr } from "../messages/fr";
import { selectAvailableYears } from "../selectors";
import { selectStreetComparisonMatrix } from "../street-comparison";
import {
  findStreetGroupForSelection,
  selectDefaultStreetGroupIds,
  selectStreetGroups,
} from "../street-groups";
import { BottomSheet } from "./BottomSheet";
import { StreetComparisonSheet } from "./StreetComparisonSheet";
import { StreetSearch } from "./StreetSearch";

const MapCanvas = dynamic(
  () => import("./MapCanvas").then((module) => module.MapCanvas),
  { ssr: false },
);

const MAXIMUM_SELECTED_STREETS = 10;

export function TrafficExplorer({
  bundle,
}: Readonly<{
  bundle: VisualizationBundle;
}>) {
  const [year, setYear] = useState<number | "overview">("overview");
  const [focusedSelection, setFocusedSelection] =
    useState<MapSelection | null>(null);
  const [comparisonCollapsed, setComparisonCollapsed] = useState(false);
  const years = useMemo(() => selectAvailableYears(bundle), [bundle]);
  const streetGroups = useMemo(() => selectStreetGroups(bundle), [bundle]);
  const [selectedStreetGroupIds, setSelectedStreetGroupIds] = useState<
    readonly string[]
  >(() => selectDefaultStreetGroupIds(streetGroups));
  const selectedStreetGroups = selectedStreetGroupIds.flatMap((id) => {
    const group = streetGroups.find((candidate) => candidate.id === id);
    return group ? [group] : [];
  });
  const selectedStreetSubjectIds = selectedStreetGroups.flatMap(
    ({ streetSubjectIds }) => streetSubjectIds,
  );
  const comparisonMatrix = useMemo(
    () => selectStreetComparisonMatrix(bundle, selectedStreetGroups),
    [bundle, selectedStreetGroups],
  );

  const addStreet = useCallback((groupId: string) => {
    setSelectedStreetGroupIds((current) =>
      current.includes(groupId) || current.length >= MAXIMUM_SELECTED_STREETS
        ? current
        : [...current, groupId],
    );
  }, []);

  const removeStreet = useCallback((groupId: string) => {
    setSelectedStreetGroupIds((current) =>
      current.filter((id) => id !== groupId),
    );
  }, []);

  const clearStreetSelection = useCallback(() => {
    setSelectedStreetGroupIds([]);
  }, []);

  const toggleStreet = useCallback((groupId: string) => {
    setSelectedStreetGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : current.length < MAXIMUM_SELECTED_STREETS
          ? [...current, groupId]
          : current,
    );
  }, []);

  const selectFromMap = useCallback(
    (selection: MapSelection) => {
      if (selection.kind === "station") {
        setFocusedSelection(selection);
        return;
      }
      const group = findStreetGroupForSelection(
        streetGroups,
        bundle,
        selection,
      );
      if (group) toggleStreet(group.id);
    },
    [bundle, streetGroups, toggleStreet],
  );

  return (
    <main className="traffic-explorer">
      <MapCanvas
        bundle={bundle}
        selectedStreetSubjectIds={selectedStreetSubjectIds}
        focusedSelection={focusedSelection}
        year={year}
        onSelect={selectFromMap}
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
        <StreetSearch
          groups={streetGroups}
          selectedIds={selectedStreetGroupIds}
          maximum={MAXIMUM_SELECTED_STREETS}
          onAdd={addStreet}
          onRemove={removeStreet}
        />
      </header>
      <p className="selection-summary" aria-live="polite">
        {fr.selectedStreetCount(selectedStreetGroups.length)}
      </p>
      {focusedSelection?.kind === "station" ? (
        <div id="traffic-detail-sheet">
          <BottomSheet
            bundle={bundle}
            selection={focusedSelection}
            onClose={() => setFocusedSelection(null)}
          />
        </div>
      ) : selectedStreetGroups.length >= 2 ? (
        <StreetComparisonSheet
          matrix={comparisonMatrix}
          selectedCount={selectedStreetGroups.length}
          collapsed={comparisonCollapsed}
          onCollapsedChange={setComparisonCollapsed}
          onRemoveStreet={removeStreet}
          onClearSelection={clearStreetSelection}
        />
      ) : null}
    </main>
  );
}
