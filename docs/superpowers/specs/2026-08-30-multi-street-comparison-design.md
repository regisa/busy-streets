# Multi-street autocomplete and comparison design

- Status: Implemented, focused-browser verified, and production-built
- Date: 2026-08-30
- Effort: Standard
- Scope: Local-only visualization POC

## Goal

Replace the single-choice street selector with a fuzzy autocomplete that can
select up to ten named Biarritz streets. The map highlights the selected
streets and automatically presents an evidence-safe historical comparison when
at least two streets are selected.

The initial selection is Avenue de Verdun, Avenue de la Marne, and Avenue de la
Gare. The picker accepts `gare du midi` as an alias for Avenue de la Gare while
displaying the official IGN name.

## Evidence rules

The comparison uses only accepted `StreetTrafficAssignment` records. A street
without an accepted assignment remains in the comparison and displays
`Aucune donnée`.

The interface must not add or average observations from independent station
groups. If one selected street has several accepted station groups, the matrix
shows a separate subrow for each location. This preserves the existing rule
that the prototype does not calculate a street total or infer an assignment
from a name, distance, or candidate match.

Quality labels and missing years stay explicit. The comparison does not draw a
line across missing years or emit interpolated values.

## Street identity for interaction

The visualization bundle remains unchanged. A derived UI selector groups
`streetSubjects` by normalized street name. One picker item may therefore own
several source-scoped street-subject IDs and geometries. This is needed for
streets such as Avenue de la Marne, which IGN represents as disconnected
subjects with the same name.

The group ID is `street-name:<normalized-name>` rather than one IGN segment ID.
The group retains all source subject IDs so accepted assignments, map
highlighting, and details remain attributable to their original subjects.

The picker contains ordinary grouped street entries only. The two existing
target-corridor records do not appear as duplicate choices. Their review state
continues to apply to their underlying street subjects and remains available in
street comparison details.

## Autocomplete

The current native `select` becomes an accessible combobox and listbox built
from existing React and TypeScript dependencies. No package is added.

Search normalization is case-insensitive and accent-insensitive. Ranking is
deterministic:

1. exact normalized name or alias;
2. complete prefix;
3. query-token prefixes in street-name order;
4. normalized substring;
5. bounded edit distance for minor typing mistakes.

Edit-distance matching is disabled for queries shorter than four characters,
allows one edit for four through seven characters, and allows two edits from
eight characters onward. It compares the query with the complete normalized
name, each name token, and each alias using the best score.

Ties use French label order and then the stable group ID. Empty input shows a
maximum of twelve alphabetical unselected streets. A non-empty query also
returns at most twelve results. Already-selected streets do not appear as
selectable results.

The combobox supports arrow-key navigation, Enter to select, and Escape to
close. Results expose their active and selected state through the standard ARIA
combobox/listbox pattern. Selection chips use the official street name and a
French accessible remove label. A short French message reports an empty result
or the ten-street limit.

## Selection behavior

The explorer owns an ordered list of selected street-group IDs. It resolves the
three defaults by normalized name, so changing IGN segment IDs does not break
the initial state. Missing defaults are omitted without inventing geometry or
data.

Adding a street appends it until the ten-street limit. Removing a chip removes
the group. Clicking an unselected street geometry on the map adds its group;
clicking any geometry belonging to a selected group removes that group.

Station clicks keep the selected street list and open the existing station
detail sheet. Closing station details returns to the street comparison. Year
and uncertain-linear-layer controls remain unchanged.

## Map behavior

The map controller receives the complete set of selected source street-subject
IDs. It clears feature state from subjects that leave the selection and sets it
for new subjects. All selected streets use the existing selected-road visual
treatment; selection does not imply that traffic data exists.

The source street layer owns map click interaction, including beneath the
priority target overlay. The target layer does not register a second click
handler because both handlers would toggle Verdun or Gare twice for one pointer
event. The explorer can still resolve a target identity defensively if another
caller supplies one.

## Automatic comparison sheet

With zero or one selected street, the street comparison is absent. With two or
more selected streets, a bottom sheet shows a year matrix automatically. The
three default streets therefore open the comparison on first load.

Rows follow picker selection order. Columns use the union of annual years from
accepted station groups assigned to the selected streets. Each populated cell
shows vehicles per day and its visible quality label. A street without accepted
data receives one `Aucune donnée` row. Several accepted station groups create
separate attributable subrows and never a combined total.

The sheet can collapse to a compact French summary such as
`3 rues sélectionnées`. Collapsing does not clear selection. Later picker or map
changes update the collapsed summary without forcing the sheet open. Station
details temporarily take the sheet position and do not change its collapsed
state.

On narrow screens, the matrix scrolls horizontally while the street-name column
stays visible. The sheet preserves keyboard access and does not create page
horizontal overflow.

## Component and selector changes

- `StreetSearch` becomes a controlled multi-street autocomplete with chips.
- `TrafficExplorer` owns selected grouped streets, comparison collapse state,
  and temporary station detail state.
- New pure selectors group street subjects, resolve defaults and aliases, rank
  search results, map source subjects to groups, and create comparison rows.
- `MapController.select` becomes a multi-selection operation for street
  subjects while retaining independent station and target selection behavior.
- A focused multi-street comparison component renders the matrix and explicit
  no-data states. The existing same-station two-year comparison remains in
  station details.

The visualization bundle schema and acquisition pipeline do not change.

## Failure and boundary behavior

- Missing default street names reduce the initial selection; they never cause a
  runtime crash.
- An unknown clicked street ID is ignored.
- The picker prevents an eleventh selection and explains the limit in French.
- Duplicate selection attempts are idempotent.
- Missing or unresolved traffic values render as unavailable and never as zero.
- Candidate-review assignments never enter comparison values.

## Verification

Pure selector tests cover normalized-name grouping, duplicate geometries, the
Gare du Midi alias, fuzzy ranking, deterministic ties, initial defaults,
accepted-only assignments, no-data rows, and independent station subrows.

Component tests cover keyboard autocomplete use, removable chips, the
ten-street limit, automatic comparison visibility, collapse behavior, station
detail coexistence, and French messages. Map-controller tests cover adding,
retaining, and removing several selected source subjects.

Full verification runs `pnpm check` and `git diff --check`. The operator retains
control of `pnpm build`, server lifecycle, Git staging and commits, and any
publication. Focused browser checks use the already-running local server at
desktop and 390 x 844 mobile sizes.

## Deferred work

This change does not create traffic assignments, aggregate road totals, add a
database, persist selections, expose a shareable URL, export comparison data,
or select a public hosting or tile provider.
