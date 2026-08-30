// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { TrafficExplorer } from "../../../src/visualization/components/TrafficExplorer.js";
import { fr } from "../../../src/visualization/messages/fr.js";
import { visualizationBundleFixture } from "../fixture.js";

vi.mock("next/dynamic", () => ({
  default: () => function FakeMapCanvas() { return null; },
}));

afterEach(cleanup);

describe("TrafficExplorer", () => {
  test("opens in overview with search and uncertain linear data hidden", () => {
    render(<TrafficExplorer bundle={visualizationBundleFixture()} />);

    expect(screen.getByRole("heading", { name: fr.appTitle })).toBeVisible();
    expect(screen.getByRole("button", { name: fr.overview })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Afficher les données linéaires 2023")).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "Rechercher une rue" })).toBeVisible();
    expect(screen.getByRole("button", { name: fr.compare })).toBeDisabled();
  });

  test("uses the shared selection path for keyboard street search", async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TrafficExplorer
        bundle={visualizationBundleFixture()}
        onSelectionChange={onSelectionChange}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Rechercher une rue" }),
      "street:street:verdun",
    );
    expect(onSelectionChange).toHaveBeenCalledWith({
      kind: "street",
      id: "street:verdun",
    });
  });

  test("labels unknown-quality linear evidence when enabled", () => {
    render(<TrafficExplorer bundle={visualizationBundleFixture()} />);
    fireEvent.click(screen.getByLabelText("Afficher les données linéaires 2023"));
    expect(screen.getByText(fr.unknownQuality)).toBeVisible();
  });

  test("announces selection and provides a keyboard-operable close control", async () => {
    const user = userEvent.setup();
    render(<TrafficExplorer bundle={visualizationBundleFixture()} />);
    const summary = screen.getByText("Aucune sélection");
    expect(summary).toHaveAttribute("aria-live", "polite");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Rechercher une rue" }),
      "street:street:verdun",
    );
    expect(screen.getByRole("heading", { name: "Avenue de Verdun" })).toBeVisible();
    const close = screen.getByRole("button", { name: "Fermer les détails" });
    close.focus();
    expect(close).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("heading", { name: "Avenue de Verdun" })).not.toBeInTheDocument();
  });
});
