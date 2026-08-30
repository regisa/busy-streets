// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { StreetComparisonSheet } from "../../../src/visualization/components/StreetComparisonSheet.js";
import type { StreetComparisonMatrix } from "../../../src/visualization/street-comparison.js";

afterEach(cleanup);

const sourceLink = {
  observationId: "observation:2021",
  sourceId: "source",
  sourceRecordId: "record",
  publicationDate: "2026-05-21",
};

const matrix: StreetComparisonMatrix = {
  years: [2021, 2024],
  rows: [
    {
      id: "verdun:no-data",
      streetGroupId: "verdun",
      streetName: "Avenue de Verdun",
      stationGroupId: null,
      locationLabel: null,
      candidateReview: true,
      observations: [],
    },
    {
      id: "marne:station",
      streetGroupId: "marne",
      streetName: "Avenue de la Marne",
      stationGroupId: "station:d810",
      locationLabel: "D810 · Biarritz",
      candidateReview: false,
      observations: [
        {
          year: 2021,
          vehiclesPerDay: 30_000,
          heavyVehiclePercent: 3,
          quality: "measured",
          sourceLinks: [sourceLink],
        },
      ],
    },
  ],
};

describe("StreetComparisonSheet", () => {
  test("renders attributable rows and explicit missing cells without a total", () => {
    render(
      <StreetComparisonSheet
        matrix={matrix}
        selectedCount={2}
        collapsed={false}
        onCollapsedChange={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Comparer les rues" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "2021" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "2024" })).toBeVisible();
    expect(screen.getByText("D810 · Biarritz")).toBeVisible();
    expect(screen.getByText(/30.*000/)).toBeVisible();
    expect(screen.getByText("Mesuré")).toBeVisible();
    expect(screen.getByText("Correspondance à vérifier")).toBeVisible();
    expect(screen.getAllByText("Aucune donnée").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument();
  });

  test("collapses without changing the selected-street count", async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    const { rerender } = render(
      <StreetComparisonSheet
        matrix={matrix}
        selectedCount={3}
        collapsed={false}
        onCollapsedChange={onCollapsedChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Réduire la comparaison" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);

    rerender(
      <StreetComparisonSheet
        matrix={matrix}
        selectedCount={3}
        collapsed
        onCollapsedChange={onCollapsedChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "3 rues sélectionnées" }));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
  });

  test("still names no-data streets when no year columns exist", () => {
    render(
      <StreetComparisonSheet
        matrix={{ years: [], rows: [matrix.rows[0]!] }}
        selectedCount={2}
        collapsed={false}
        onCollapsedChange={() => undefined}
      />,
    );

    expect(screen.getByRole("rowheader", { name: /Avenue de Verdun/ })).toBeVisible();
    expect(screen.getByText("Aucune donnée")).toBeVisible();
  });

  test("does not call a null accepted observation available data", () => {
    const nullObservationRow = {
      ...matrix.rows[1]!,
      observations: matrix.rows[1]!.observations.map((observation) => ({
        ...observation,
        vehiclesPerDay: null,
      })),
    };
    render(
      <StreetComparisonSheet
        matrix={{ years: [2021], rows: [nullObservationRow] }}
        selectedCount={2}
        collapsed={false}
        onCollapsedChange={() => undefined}
      />,
    );

    const row = screen.getByRole("row", { name: /Avenue de la Marne/ });
    expect(within(row).queryByText("Données disponibles")).not.toBeInTheDocument();
    expect(within(row).getAllByText("Aucune donnée")).toHaveLength(2);
  });
});
