// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TrafficExplorer } from "../../../src/visualization/components/TrafficExplorer.js";
import type { MapCanvasProps } from "../../../src/visualization/components/MapCanvas.js";
import { fr } from "../../../src/visualization/messages/fr.js";
import { visualizationBundleFixture } from "../fixture.js";

const mapMock = vi.hoisted(() => ({ props: null as MapCanvasProps | null }));

vi.mock("next/dynamic", () => ({
  default: () => function FakeMapCanvas(props: MapCanvasProps) {
    mapMock.props = props;
    return null;
  },
}));

afterEach(() => {
  mapMock.props = null;
  cleanup();
});

describe("TrafficExplorer", () => {
  test("opens with three grouped streets and an automatic no-data comparison", () => {
    render(<TrafficExplorer bundle={visualizationBundleFixture()} />);

    expect(screen.getByRole("heading", { name: fr.appTitle })).toHaveClass(
      "visually-hidden",
    );
    expect(screen.getByRole("button", { name: fr.overview })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Afficher les données linéaires 2023")).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "Rechercher une rue" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retirer Avenue de Verdun" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retirer Avenue de la Marne" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retirer Avenue de la Gare" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Comparer les rues" })).toBeVisible();
    expect(screen.getAllByText(fr.noData).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole("button", { name: fr.compare })).not.toBeInTheDocument();
    expect(mapMock.props?.selectedStreetSubjectIds).toEqual([
      "street:verdun",
      "street:marne-east",
      "street:marne-west",
      "street:gare",
    ]);
  });

  test("removes and restores Gare through its Gare du Midi alias", async () => {
    const user = userEvent.setup();
    render(<TrafficExplorer bundle={visualizationBundleFixture()} />);

    await user.click(screen.getByRole("button", { name: "Retirer Avenue de la Gare" }));
    const input = screen.getByRole("combobox", { name: "Rechercher une rue" });
    await user.type(input, "gare du midi");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("button", { name: "Retirer Avenue de la Gare" })).toBeVisible();
  });

  test("toggles grouped streets from source and target map clicks", () => {
    render(<TrafficExplorer bundle={visualizationBundleFixture()} />);

    act(() => mapMock.props?.onSelect({ kind: "street", id: "street:marne-east" }));
    expect(screen.queryByRole("button", { name: "Retirer Avenue de la Marne" })).not.toBeInTheDocument();
    act(() => mapMock.props?.onSelect({ kind: "target", id: "avenue-de-verdun" }));
    expect(screen.queryByRole("button", { name: "Retirer Avenue de Verdun" })).not.toBeInTheDocument();
    act(() => mapMock.props?.onSelect({ kind: "target", id: "avenue-de-verdun" }));
    expect(screen.getByRole("button", { name: "Retirer Avenue de Verdun" })).toBeVisible();
  });

  test("opens station detail without clearing street comparison state", async () => {
    const user = userEvent.setup();
    render(<TrafficExplorer bundle={visualizationBundleFixture()} />);

    act(() => mapMock.props?.onSelect({ kind: "station", id: "station-group:d810" }));
    expect(screen.getByRole("heading", { name: "D810 · Biarritz" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Comparer les rues" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirer Avenue de Verdun" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Fermer les détails" }));
    expect(screen.getByRole("heading", { name: "Comparer les rues" })).toBeVisible();
  });

  test("keeps a collapsed comparison collapsed while streets change", async () => {
    const user = userEvent.setup();
    render(<TrafficExplorer bundle={visualizationBundleFixture()} />);

    await user.click(screen.getByRole("button", { name: "Réduire la comparaison" }));
    expect(screen.getByRole("button", { name: "3 rues sélectionnées" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retirer Avenue de Verdun" }));
    expect(screen.getByRole("button", { name: "2 rues sélectionnées" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Comparer les rues" })).not.toBeInTheDocument();
  });

  test("labels unknown-quality linear evidence when enabled", () => {
    render(<TrafficExplorer bundle={visualizationBundleFixture()} />);
    fireEvent.click(screen.getByLabelText("Afficher les données linéaires 2023"));
    expect(screen.getByText(fr.unknownQuality)).toBeVisible();
  });
});
