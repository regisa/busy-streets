// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { StreetSearch } from "../../../src/visualization/components/StreetSearch.js";
import type { StreetGroup } from "../../../src/visualization/street-groups.js";

afterEach(cleanup);

function group(name: string, aliases: readonly string[] = []): StreetGroup {
  const normalizedName = name.toLocaleLowerCase("fr");
  return {
    id: `street-name:${normalizedName}`,
    displayName: name,
    normalizedName,
    streetSubjectIds: [`street:${normalizedName}`],
    targetCorridorIds: [],
    aliases,
  };
}

const groups = [
  group("Avenue de la Gare", ["avenue de la gare du midi", "gare du midi"]),
  group("Avenue de la Marne"),
  group("Avenue de Verdun"),
  group("Rue d’Espagne"),
];

describe("StreetSearch", () => {
  test("selects a fuzzy result with the keyboard", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <StreetSearch
        groups={groups}
        selectedIds={["street-name:avenue de verdun"]}
        maximum={10}
        onAdd={onAdd}
        onRemove={() => undefined}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Rechercher une rue" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.type(input, "gare du midi");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: "Avenue de la Gare" })).toBeVisible();

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onAdd).toHaveBeenCalledWith("street-name:avenue de la gare");
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  test("renders removable chips and excludes selected results", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <StreetSearch
        groups={groups}
        selectedIds={["street-name:avenue de verdun"]}
        maximum={10}
        onAdd={() => undefined}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("Avenue de Verdun")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Retirer Avenue de Verdun" }),
    );
    expect(onRemove).toHaveBeenCalledWith("street-name:avenue de verdun");

    const input = screen.getByRole("combobox", { name: "Rechercher une rue" });
    await user.type(input, "verdun");
    expect(screen.queryByRole("option", { name: "Avenue de Verdun" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Aucune rue trouvée");
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  test("closes its results when focus leaves the combobox", async () => {
    const user = userEvent.setup();
    render(
      <>
        <StreetSearch
          groups={groups}
          selectedIds={[]}
          maximum={10}
          onAdd={() => undefined}
          onRemove={() => undefined}
        />
        <button type="button">Après</button>
      </>,
    );

    const input = screen.getByRole("combobox", { name: "Rechercher une rue" });
    await user.type(input, "gare");
    expect(input).toHaveAttribute("aria-expanded", "true");
    await user.tab();
    expect(screen.getByRole("button", { name: "Après" })).toHaveFocus();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  test("announces and enforces the ten-street limit", async () => {
    const user = userEvent.setup();
    const tenGroups = Array.from({ length: 11 }, (_, index) =>
      group(`Rue ${String(index + 1).padStart(2, "0")}`),
    );
    const selectedIds = tenGroups.slice(0, 10).map(({ id }) => id);
    const onAdd = vi.fn();
    render(
      <StreetSearch
        groups={tenGroups}
        selectedIds={selectedIds}
        maximum={10}
        onAdd={onAdd}
        onRemove={() => undefined}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("10 rues maximum");
    const input = screen.getByRole("combobox", { name: "Rechercher une rue" });
    await user.type(input, "Rue 11");
    expect(screen.queryByRole("option", { name: "Rue 11" })).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });
});
