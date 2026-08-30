# Multi-street autocomplete and comparison implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-street selector with an accessible fuzzy multi-select and automatically compare up to ten selected streets without inventing or aggregating traffic evidence.

**Architecture:** Derive stable street-name groups from the unchanged visualization bundle, then keep search ranking and comparison-row construction in pure modules. `TrafficExplorer` owns grouped selection and temporary station focus, while `MapController` receives source street-subject IDs for multi-highlight. A dedicated comparison sheet renders accepted assignments only and stays independent from the existing same-station year comparison.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, MapLibre GL 6, Vitest 4, Testing Library, CSS

**Spec:** `docs/superpowers/specs/2026-08-30-multi-street-comparison-design.md`

**Execution status:** Complete. Implementation, automated verification, focused
browser verification, and the operator-controlled production build passed.

## Global constraints

- Keep the visualization bundle schema and acquisition pipeline unchanged.
- Add no package or dependency.
- Visible application copy is French; source code, tests, and documentation are English.
- Select no more than ten grouped streets.
- Default to Avenue de Verdun, Avenue de la Marne, and Avenue de la Gare when present.
- Accept `gare du midi` as a search alias for Avenue de la Gare, but display the official IGN name.
- Use accepted `StreetTrafficAssignment` records only. Candidate-review assignments never supply values.
- Keep independent station groups as separate rows. Never add or average them into a street total.
- Missing observations display `Aucune donnée`, never zero.
- Keep station details and the existing same-station two-year comparison operational.
- Do not install, build, start or restart the server, stage, commit, deploy, publish, or mutate external systems.
- At every checkpoint, leave edits unstaged and report verification evidence. Commit steps from the generic planning workflow are intentionally omitted under the repository authority contract.

---

## File structure

**Create:**

- `src/visualization/street-groups.ts`: grouped street identity, default resolution, aliases, source-selection lookup, and fuzzy ranking.
- `src/visualization/street-comparison.ts`: accepted-only comparison rows and year matrix.
- `src/visualization/components/StreetComparisonSheet.tsx`: collapsible French comparison matrix.
- `tests/visualization/street-groups.test.ts`: pure grouping and search behavior.
- `tests/visualization/street-comparison.test.ts`: evidence-safe matrix construction.
- `tests/visualization/components/street-search.test.tsx`: combobox, chips, keyboard use, and limit behavior.
- `tests/visualization/components/street-comparison-sheet.test.tsx`: expanded and collapsed matrix states.

**Modify:**

- `src/visualization/components/StreetSearch.tsx`: replace native select with controlled combobox and selected chips.
- `src/visualization/components/TrafficExplorer.tsx`: grouped selection state, defaults, map toggling, station focus, and automatic comparison.
- `src/visualization/components/MapCanvas.tsx`: pass street multi-selection and independent focused detail to MapLibre.
- `src/visualization/map/map-controller.ts`: expose multi-street feature-state updates and separate focused selection.
- `src/visualization/messages/fr.ts`: French picker, comparison, limit, collapse, and no-result copy.
- `src/app/globals.css`: autocomplete, chips, comparison matrix, sticky first column, and mobile layout.
- `tests/visualization/map/map-controller.test.ts`: multi-selection state transitions.
- `tests/visualization/components/traffic-explorer.test.tsx`: defaults, automatic comparison, map/picker flow, and station coexistence.
- `tests/visualization/fixture.ts`: add duplicate-name subjects and accepted/candidate assignments only where a test explicitly needs them.
- `README.md`, `docs/STATUS.md`, and `docs/DECISIONS.md`: record the implemented interaction and evidence limits.

---

### Task 1: Derive stable grouped street identities and fuzzy results

**Files:**

- Create: `src/visualization/street-groups.ts`
- Create: `tests/visualization/street-groups.test.ts`

**Interfaces:**

- Consumes: `VisualizationBundle`, `MapSelection`, and source `streetSubjects`/`targetCorridors`.
- Produces:

```ts
export interface StreetGroup {
  readonly id: string;
  readonly displayName: string;
  readonly normalizedName: string;
  readonly streetSubjectIds: readonly string[];
  readonly targetCorridorIds: readonly string[];
  readonly aliases: readonly string[];
}

export const DEFAULT_STREET_NAMES: readonly string[];

export function selectStreetGroups(
  bundle: VisualizationBundle,
): readonly StreetGroup[];

export function selectDefaultStreetGroupIds(
  groups: readonly StreetGroup[],
): readonly string[];

export function findStreetGroupForSelection(
  groups: readonly StreetGroup[],
  bundle: VisualizationBundle,
  selection: MapSelection,
): StreetGroup | null;

export function searchStreetGroups(
  groups: readonly StreetGroup[],
  query: string,
  selectedIds: ReadonlySet<string>,
  limit?: number,
): readonly StreetGroup[];
```

- [ ] **Step 1: Write failing grouping and identity tests**

Create a fixture with two `streetSubjects` named `Avenue de la Marne`, one
Verdun subject, and one Gare subject. Assert that Marne becomes one group with
both sorted source IDs, group IDs use `street-name:<normalized-name>`, target
corridor IDs attach to Verdun and Gare, and defaults resolve in the required
Verdun, Marne, Gare order.

```ts
expect(selectStreetGroups(bundle)).toContainEqual({
  id: "street-name:avenue de la marne",
  displayName: "Avenue de la Marne",
  normalizedName: "avenue de la marne",
  streetSubjectIds: ["street:marne-east", "street:marne-west"],
  targetCorridorIds: [],
  aliases: [],
});

expect(selectDefaultStreetGroupIds(groups)).toEqual([
  "street-name:avenue de verdun",
  "street-name:avenue de la marne",
  "street-name:avenue de la gare",
]);
```

- [ ] **Step 2: Run the grouping test and verify the red state**

Run:

```sh
pnpm exec vitest run tests/visualization/street-groups.test.ts
```

Expected: FAIL because `street-groups.ts` does not exist.

- [ ] **Step 3: Implement grouped identity and selection lookup**

Build groups with a `Map<string, StreetGroupBuilder>` keyed by
`street.normalizedName`. Sort source IDs and target IDs. Attach
`["gare du midi", "avenue de la gare du midi"]` only to the normalized Gare
group. Resolve `target` selections through `targetCorridor.streetSubjectIds` and
`street` selections through direct source membership. Return `null` for station
or unknown selections.

```ts
export const DEFAULT_STREET_NAMES = [
  "avenue de verdun",
  "avenue de la marne",
  "avenue de la gare",
] as const;
```

- [ ] **Step 4: Run the grouping test and verify it passes**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Write failing fuzzy-ranking tests**

Cover exact, prefix, token prefix, substring, accents, `gare du midi`, one-edit
and two-edit queries, queries shorter than four characters not using typo
distance, exclusion of selected groups, the twelve-result cap, and stable French
tie ordering.

```ts
expect(labels(searchStreetGroups(groups, "verd", new Set()))[0]).toBe(
  "Avenue de Verdun",
);
expect(labels(searchStreetGroups(groups, "gare du midi", new Set()))[0]).toBe(
  "Avenue de la Gare",
);
expect(labels(searchStreetGroups(groups, "verdunx", new Set()))[0]).toBe(
  "Avenue de Verdun",
);
expect(
  searchStreetGroups(
    makeStreetGroups(14),
    "",
    new Set(["street-name:rue 01"]),
  ),
).toHaveLength(12);
```

- [ ] **Step 6: Run the fuzzy tests and verify the red state**

Run the Task 1 test file. Expected: FAIL because ranking is not implemented.

- [ ] **Step 7: Implement deterministic normalization and ranking**

Use Unicode NFD accent removal, lowercase, punctuation-to-space replacement,
and collapsed whitespace. Implement Levenshtein distance locally. Disable typo
matching below four query characters, allow distance one for lengths four to
seven, and distance two at length eight or longer. Rank by a tuple
`[matchClass, editDistance, frenchLabel, groupId]`, where lower values win, and
return at most `limit ?? 12` unselected groups.

- [ ] **Step 8: Run Task 1 tests and typecheck**

```sh
pnpm exec vitest run tests/visualization/street-groups.test.ts
pnpm typecheck
```

Expected: PASS. Leave changes unstaged.

---

### Task 2: Build an accepted-only street comparison matrix

**Files:**

- Create: `src/visualization/street-comparison.ts`
- Create: `tests/visualization/street-comparison.test.ts`
- Modify: `tests/visualization/fixture.ts`

**Interfaces:**

- Consumes: `VisualizationBundle`, selected `StreetGroup[]`, accepted
  `streetAssignments`, and station-group annual observations.
- Produces:

```ts
export interface StreetComparisonRow {
  readonly id: string;
  readonly streetGroupId: string;
  readonly streetName: string;
  readonly stationGroupId: string | null;
  readonly locationLabel: string | null;
  readonly candidateReview: boolean;
  readonly observations: VisualizationBundle["stationGroups"][number]["observations"];
}

export interface StreetComparisonMatrix {
  readonly years: readonly number[];
  readonly rows: readonly StreetComparisonRow[];
}

export function selectStreetComparisonMatrix(
  bundle: VisualizationBundle,
  selectedGroups: readonly StreetGroup[],
): StreetComparisonMatrix;
```

- [ ] **Step 1: Write failing evidence-boundary tests**

Use selected groups with: no assignment; a candidate-review assignment; one
accepted assignment; the same accepted station assigned to two source subjects
inside one grouped street; and two different accepted stations assigned to one
grouped street.

Assert:

```ts
expect(matrix.years).toEqual([2021, 2024]);
expect(rowsFor("Avenue sans données")).toMatchObject([
  { stationGroupId: null, observations: [] },
]);
expect(rowsFor("Avenue candidate")[0]?.observations).toEqual([]);
expect(rowsFor("Avenue doublée")).toHaveLength(1);
expect(rowsFor("Avenue deux compteurs")).toHaveLength(2);
```

Also assert that row order follows selected group order, observations retain
their source links and quality, candidate review is visible, and no value is
summed.

- [ ] **Step 2: Run the test and verify the red state**

```sh
pnpm exec vitest run tests/visualization/street-comparison.test.ts
```

Expected: FAIL because the comparison selector does not exist.

- [ ] **Step 3: Implement matrix construction**

For each selected group, collect assignments for every source subject ID.
Separate candidate-review presence from accepted values. Deduplicate accepted
station IDs with a `Set`. Emit one empty row if none remain. Otherwise emit one
row per accepted station in stable station-ID order. Derive a location label
from the first member road reference and road name, falling back to
`Point de comptage`. Derive years only from emitted accepted observations.

- [ ] **Step 4: Run Task 2 tests and typecheck**

```sh
pnpm exec vitest run tests/visualization/street-comparison.test.ts
pnpm typecheck
```

Expected: PASS. Leave changes unstaged.

---

### Task 3: Replace the native picker with an accessible multi-select combobox

**Files:**

- Modify: `src/visualization/components/StreetSearch.tsx`
- Modify: `src/visualization/messages/fr.ts`
- Create: `tests/visualization/components/street-search.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: `StreetGroup[]`, selected group IDs, `searchStreetGroups`, and the
  fixed maximum of ten.
- Produces:

```ts
export interface StreetSearchProps {
  readonly groups: readonly StreetGroup[];
  readonly selectedIds: readonly string[];
  readonly maximum: number;
  readonly onAdd: (groupId: string) => void;
  readonly onRemove: (groupId: string) => void;
}
```

- [ ] **Step 1: Write failing component tests**

Render the component with grouped fixtures. Assert the input has role
`combobox`, French accessible name `Rechercher une rue`, and correct
`aria-expanded`, `aria-controls`, and `aria-activedescendant` changes. Test
typing `gare du midi`, ArrowDown, Enter, Escape, mouse selection, selected chips,
French remove labels, selected-result exclusion, empty results, and the
ten-street limit.

```ts
await user.type(screen.getByRole("combobox"), "gare du midi");
await user.keyboard("{ArrowDown}{Enter}");
expect(onAdd).toHaveBeenCalledWith("street-name:avenue de la gare");

await user.click(
  screen.getByRole("button", { name: "Retirer Avenue de Verdun" }),
);
expect(onRemove).toHaveBeenCalledWith("street-name:avenue de verdun");
```

- [ ] **Step 2: Run the component test and verify the red state**

```sh
pnpm exec vitest run tests/visualization/components/street-search.test.tsx
```

Expected: FAIL against the native single-choice select.

- [ ] **Step 3: Implement the controlled combobox**

Keep local `query`, `open`, and `activeIndex` state. Compute results through
`searchStreetGroups`. Reset the query and close after selection. Clamp the active
index whenever results change. Use `role="listbox"` and `role="option"` with
stable IDs. Prevent an add when `selectedIds.length >= maximum`; expose the
French limit message through `role="status"`.

Add French messages:

```ts
streetSearch: "Rechercher une rue",
streetSearchPlaceholder: "Saisir le nom d’une rue…",
noStreetResult: "Aucune rue trouvée",
streetLimit: "10 rues maximum",
removeStreet: (name: string) => `Retirer ${name}`,
```

- [ ] **Step 4: Add focused picker styles**

Keep the compact header. Add `.street-combobox`, `.street-search-input`,
`.street-results`, `.street-option`, `.street-chips`, and `.street-chip`. Make
the results an absolute, bordered, scrollable layer above the map. Let chips
wrap within the header. Use existing paper, ink, red, focus, and border tokens.
Do not introduce horizontal page overflow at ten chips.

- [ ] **Step 5: Run Task 3 tests and typecheck**

```sh
pnpm exec vitest run tests/visualization/components/street-search.test.tsx
pnpm typecheck
```

Expected: PASS. Leave changes unstaged.

---

### Task 4: Give MapLibre independent multi-street and detail selection state

**Files:**

- Modify: `src/visualization/map/map-controller.ts`
- Modify: `src/visualization/components/MapCanvas.tsx`
- Modify: `tests/visualization/map/map-controller.test.ts`

**Interfaces:**

- Consumes: source street-subject IDs from selected groups and an optional
  focused station/target selection.
- Produces:

```ts
export interface MapController {
  setYear(year: number | "overview"): void;
  setLinearTrafficVisible(visible: boolean): void;
  setStreetSelection(streetSubjectIds: readonly string[]): void;
  setFocusedSelection(selection: MapSelection | null): void;
  destroy(): void;
}
```

`MapCanvasProps` replaces `selection` with:

```ts
readonly selectedStreetSubjectIds: readonly string[];
readonly focusedSelection: MapSelection | null;
```

- [ ] **Step 1: Write failing map-controller transition tests**

Call `setStreetSelection(["street:verdun", "street:marne-east"])`, then
`setStreetSelection(["street:marne-east", "street:gare"])`. Assert feature
state selects Verdun and Marne, retains Marne without a redundant call, clears
Verdun, and selects Gare. Assert duplicate IDs are idempotent.

```ts
expect(map.featureStates).toContainEqual({
  target: { source: "streets", id: "street:verdun" },
  state: { selected: false },
});
```

Separately assert station focus selects and clears the `stations` source without
changing street feature states.

- [ ] **Step 2: Run the map test and verify the red state**

```sh
pnpm exec vitest run tests/visualization/map/map-controller.test.ts
```

Expected: FAIL because the new methods do not exist.

- [ ] **Step 3: Implement set-difference feature-state updates**

Keep a `Set<string>` of selected source streets. Clear IDs absent from the next
set and select only IDs absent from the previous set. Keep one separate
`focusedSelection` for station or target state. Street focus must not duplicate
the group selection state. Clear tracked state during `destroy()` before
removing handlers.

- [ ] **Step 4: Update MapCanvas props and effects**

Initialize both states inside the map load handler. Add independent effects for
`selectedStreetSubjectIds` and `focusedSelection`. Do not recreate the map when
selection changes. Preserve Positron loading, fallback behavior, attribution,
year filtering, and uncertain linear visibility.

- [ ] **Step 5: Run Task 4 tests and typecheck**

```sh
pnpm exec vitest run tests/visualization/map/map-controller.test.ts
pnpm typecheck
```

Expected: PASS. Leave changes unstaged.

---

### Task 5: Render the collapsible automatic comparison sheet

**Files:**

- Create: `src/visualization/components/StreetComparisonSheet.tsx`
- Create: `tests/visualization/components/street-comparison-sheet.test.tsx`
- Modify: `src/visualization/messages/fr.ts`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: `StreetComparisonMatrix`, selected count, collapse state, and a
  collapse toggle.
- Produces:

```ts
export function StreetComparisonSheet(props: Readonly<{
  matrix: StreetComparisonMatrix;
  selectedCount: number;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}>): React.JSX.Element;
```

- [ ] **Step 1: Write failing expanded, no-data, and collapsed tests**

Assert an expanded sheet has heading `Comparer les rues`, year columns in
ascending order, formatted vehicles per day, visible French quality labels,
location subrows, `Correspondance à vérifier`, and `Aucune donnée` in missing
cells. Assert no synthetic total row exists.

Assert the collapse button switches to a compact button named
`3 rues sélectionnées`, and expanding it invokes `onCollapsedChange(false)`.

- [ ] **Step 2: Run the component test and verify the red state**

```sh
pnpm exec vitest run tests/visualization/components/street-comparison-sheet.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement semantic matrix rendering**

Render one table row per matrix row. Use `Intl.NumberFormat("fr-FR")`. Resolve
an observation by exact row/year equality. Empty matrix years still render the
street and state columns, so the three default streets visibly report no data.
Use the existing French quality messages. The collapse control must not remove
selection.

- [ ] **Step 4: Add responsive and sticky-column styles**

Reuse `.bottom-sheet` positioning for the expanded comparison. Add a scroll
wrapper with `overflow-x: auto`, a sticky first column with an opaque paper
background, and a compact fixed summary above map attribution when collapsed.
At 390 px, keep the page itself overflow-free and the matrix locally scrollable.

- [ ] **Step 5: Run Task 5 tests and typecheck**

```sh
pnpm exec vitest run tests/visualization/components/street-comparison-sheet.test.tsx
pnpm typecheck
```

Expected: PASS. Leave changes unstaged.

---

### Task 6: Integrate defaults, map toggling, station focus, and automatic comparison

**Files:**

- Modify: `src/visualization/components/TrafficExplorer.tsx`
- Modify: `tests/visualization/components/traffic-explorer.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: all Task 1 through Task 5 interfaces.
- Produces: the complete user flow with no `Comparer` button.

- [ ] **Step 1: Rewrite TrafficExplorer tests around grouped selection**

Assert first render contains chips for Verdun, Marne, and Gare, no button named
`Comparer`, and an automatic comparison heading. Assert each default no-data row
is visible with the current empty assignments fixture.

Test adding by fuzzy keyboard search, removing a chip, stopping at ten,
collapsing the comparison, and keeping it collapsed as selection changes.

Mock `MapCanvas` so a test can emit:

```ts
onSelect({ kind: "street", id: "street:marne-east" });
onSelect({ kind: "target", id: "avenue-de-verdun" });
onSelect({ kind: "station", id: "station-group:d810" });
```

Assert the first two toggle their owning groups, the station opens existing
history without clearing chips, and closing station details restores the prior
comparison collapse state.

- [ ] **Step 2: Run the explorer test and verify the red state**

```sh
pnpm exec vitest run tests/visualization/components/traffic-explorer.test.tsx
```

Expected: FAIL against single `MapSelection` state and the old compare button.

- [ ] **Step 3: Implement grouped explorer state**

Compute groups once with `selectStreetGroups(bundle)`. Initialize selected IDs
with `selectDefaultStreetGroupIds(groups)`. Derive selected groups in stored
order and flatten their source IDs for MapCanvas. Keep
`focusedSelection: MapSelection | null` only for stations. Keep
`comparisonCollapsed` separately.

Implement idempotent helpers:

```ts
const addStreet = (groupId: string) =>
  setSelectedStreetGroupIds((current) =>
    current.includes(groupId) || current.length >= 10
      ? current
      : [...current, groupId],
  );

const toggleStreet = (groupId: string) =>
  setSelectedStreetGroupIds((current) =>
    current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : current.length < 10
        ? [...current, groupId]
        : current,
  );
```

Let source street clicks own interaction beneath target overlays so one pointer
event cannot toggle the same grouped street twice. Keep defensive target lookup
in `findStreetGroupForSelection`; station clicks set focus. Remove the existing
test-only `onSelectionChange` prop from
`TrafficExplorer`, because a grouped street can own several source selections
and cannot be represented truthfully by one `MapSelection`. Replace its test
coverage with observable chips, comparison rows, and captured MapCanvas events.

- [ ] **Step 4: Wire automatic comparison and temporary station detail**

Render `StreetComparisonSheet` only when at least two groups are selected and
no station is focused. Render the existing `BottomSheet` for station focus.
Closing it clears focus and reveals the comparison in its prior collapsed state.
With fewer than two selected groups, render neither comparison nor a fabricated
street detail.

- [ ] **Step 5: Remove obsolete compare-button layout**

Delete the button and `.compare-button` rules. Rebalance the desktop header to
year navigation plus a flexible autocomplete. Retain the full-width layer row.
On mobile, keep year controls first, autocomplete/chips second, and layers last.

- [ ] **Step 6: Run all visualization component and map tests**

```sh
pnpm exec vitest run tests/visualization/components tests/visualization/map tests/visualization/street-groups.test.ts tests/visualization/street-comparison.test.ts
pnpm typecheck
```

Expected: PASS. Leave changes unstaged.

---

### Task 7: Document, review, and verify the complete feature

**Files:**

- Modify: `README.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/DECISIONS.md`
- Review: every file changed by Tasks 1 through 6

**Interfaces:**

- Consumes: the integrated feature and verification output.
- Produces: current canonical documentation and a verified unstaged handoff.

- [ ] **Step 1: Add the accepted product decision**

Add the next stable decision ID describing grouped street-name interaction,
three defaults, the ten-street cap, automatic comparison, accepted-only values,
independent counter rows, explicit no-data states, and dependency-free fuzzy
matching. Do not change the mandatory Verdun/Gare evidence criterion.

- [ ] **Step 2: Update README and STATUS from observed evidence**

Describe the autocomplete and automatic matrix without claiming that current
streets have traffic history. Record the final test count only after the full
suite runs. Keep the public-release and data-licence limits unchanged.

- [ ] **Step 3: Run an integrated read-only review**

Review the final diff for:

- stale single-selection APIs or `Comparer` button references;
- aggregation of independent station observations;
- candidate assignments entering values;
- unstable IDs or array order;
- inaccessible combobox/listbox state;
- effects that recreate MapLibre on every selection;
- page-level mobile horizontal overflow; and
- Keep implementation and documentation in English and visible application copy in French.

Fix only issues within this feature, then rerun the focused test that covers
each fix.

- [x] **Step 4: Run the complete automated verification**

```sh
pnpm check
git diff --check
```

Expected: strict TypeScript passes, all Vitest files pass with zero failures,
and `git diff --check` prints no errors.

- [x] **Step 5: Verify the operator-run browser at desktop width**

Using the existing `http://localhost:3000/` server, confirm:

- default Verdun, Marne, and Gare chips are present;
- the comparison opens automatically and reports explicit no-data rows;
- fuzzy `gare du midi` finds Avenue de la Gare after removing its default chip;
- keyboard and mouse selection work;
- map clicks toggle ordinary and priority-overlay streets;
- selected geometries highlight together;
- station details open and close without clearing streets;
- the sheet collapses and stays collapsed through selection changes;
- Positron, IGN evidence, and all attributions remain visible; and
- no new runtime error appears.

- [x] **Step 6: Verify the 390 x 844 layout**

Confirm the page has no horizontal overflow, chips wrap, the results list stays
inside the viewport, the matrix scrolls only inside its wrapper, the sticky
street column remains readable, controls remain keyboard-operable, and the map
still occupies the viewport behind overlays. Restore the desktop viewport.

- [x] **Step 7: Leave an operator-controlled handoff**

Run `git status --short` and report all modified/untracked files. Leave them
unstaged and uncommitted. Ask the operator to run `pnpm build`; do not run it.

Operator confirmation: the final `pnpm build` completed on 2026-08-30.
