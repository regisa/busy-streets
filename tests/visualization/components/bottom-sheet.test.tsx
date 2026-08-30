// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import { BottomSheet } from "../../../src/visualization/components/BottomSheet.js";
import { fr } from "../../../src/visualization/messages/fr.js";
import { visualizationBundleFixture } from "../fixture.js";

afterEach(cleanup);

describe("BottomSheet", () => {
  test("shows annual station evidence, uncertainty, members, and provenance", () => {
    render(
      <BottomSheet
        bundle={visualizationBundleFixture()}
        selection={{ kind: "station", id: "station-group:d810" }}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "D810 · Biarritz" })).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === "32 000 véhicules par jour")).toBeVisible();
    expect(screen.getAllByText(fr.measured).length).toBeGreaterThan(0);
    expect(screen.getByRole("table", { name: "Valeurs annuelles" })).toBeVisible();
    expect(screen.getByRole("img", { name: /Évolution annuelle/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Fermer les détails" })).toBeVisible();
    expect(screen.getByText("Correspondance routière ambiguë")).toBeVisible();
    expect(screen.getByText("station:2023")).toBeVisible();
    expect(screen.getByText("station:2024")).toBeVisible();
    expect(screen.getByText((_, element) => element?.tagName === "LI" && element.textContent?.includes("record:2024") === true)).toBeVisible();
  });

  test("keeps ordinary and priority streets visibly without assigned traffic", () => {
    const bundle = visualizationBundleFixture();
    const { rerender } = render(
      <BottomSheet
        bundle={bundle}
        selection={{ kind: "street", id: "street:verdun" }}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "Avenue de Verdun" })).toBeVisible();
    expect(screen.getByText(fr.noData)).toBeVisible();

    rerender(
      <BottomSheet
        bundle={bundle}
        selection={{ kind: "target", id: "avenue-de-verdun" }}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(fr.comparisonUnavailable)).toBeVisible();
    expect(screen.getByText(fr.candidateReview)).toBeVisible();
    expect(screen.queryByText(/véhicules par jour/)).not.toBeInTheDocument();
  });

  test("does not render a candidate station value as assigned street traffic", () => {
    const bundle = visualizationBundleFixture();
    bundle.streetAssignments.push({
      id: "assignment:candidate",
      streetSubjectId: "street:verdun",
      stationGroupId: "station-group:d810",
      status: "candidate-review",
      evidenceSource: "osm-probe",
      evidenceReference: "ambiguous",
    });
    render(
      <BottomSheet
        bundle={bundle}
        selection={{ kind: "street", id: "street:verdun" }}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(fr.candidateReview)).toBeVisible();
    expect(screen.getByText(fr.noData)).toBeVisible();
    expect(screen.queryByText(/32 000/)).not.toBeInTheDocument();
  });

  test("compares two compatible years from the same station group", async () => {
    const user = userEvent.setup();
    render(
      <BottomSheet
        bundle={visualizationBundleFixture()}
        selection={{ kind: "station", id: "station-group:d810" }}
        onClose={() => undefined}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Année de référence"), "2021");
    await user.selectOptions(screen.getByLabelText("Année comparée"), "2024");
    await user.click(screen.getByRole("button", { name: "Calculer la comparaison" }));

    const result = within(screen.getByLabelText("Résultat de la comparaison"));
    expect(result.getByText((_, element) => element?.textContent === "30 000")).toBeVisible();
    expect(result.getByText((_, element) => element?.textContent === "32 000")).toBeVisible();
    expect(result.getByText((_, element) => element?.textContent === "+2 000")).toBeVisible();
    expect(result.getByText("+6,7 %")).toBeVisible();
  });

  test("reports a non-calculable percentage for a zero baseline", async () => {
    const bundle = visualizationBundleFixture();
    bundle.stationGroups[0]!.observations[0]!.vehiclesPerDay = 0;
    bundle.stationGroups[0]!.observations[1]!.vehiclesPerDay = 10;
    const user = userEvent.setup();
    render(
      <BottomSheet
        bundle={bundle}
        selection={{ kind: "station", id: "station-group:d810" }}
        onClose={() => undefined}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Année de référence"), "2021");
    await user.selectOptions(screen.getByLabelText("Année comparée"), "2024");
    await user.click(screen.getByRole("button", { name: "Calculer la comparaison" }));
    expect(screen.getByText("+10")).toBeVisible();
    expect(screen.getByText("Pourcentage non calculable")).toBeVisible();
  });
});
