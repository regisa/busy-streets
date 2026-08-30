import { useId, useMemo, useState } from "react";

import { fr } from "../messages/fr";
import {
  searchStreetGroups,
  type StreetGroup,
} from "../street-groups";

export interface StreetSearchProps {
  readonly groups: readonly StreetGroup[];
  readonly selectedIds: readonly string[];
  readonly maximum: number;
  readonly onAdd: (groupId: string) => void;
  readonly onRemove: (groupId: string) => void;
}

export function StreetSearch({
  groups,
  selectedIds,
  maximum,
  onAdd,
  onRemove,
}: StreetSearchProps) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedGroups = selectedIds.flatMap((id) => {
    const selected = groups.find((group) => group.id === id);
    return selected ? [selected] : [];
  });
  const limitReached = selectedIds.length >= maximum;
  const results = limitReached
    ? []
    : searchStreetGroups(groups, query, selectedIdSet);
  const expanded = open && !limitReached;
  const activeResult = results[activeIndex];

  const add = (group: StreetGroup) => {
    if (limitReached || selectedIdSet.has(group.id)) return;
    onAdd(group.id);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div className="street-search">
      <div className="street-combobox">
        <input
          className="street-search-input"
          type="text"
          role="combobox"
          aria-label={fr.streetSearch}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={expanded}
          aria-activedescendant={
            expanded && activeResult
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          placeholder={fr.streetSearchPlaceholder}
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setActiveIndex(-1);
          }}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) =>
                Math.min(current + 1, results.length - 1),
              );
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
              return;
            }
            if (event.key === "Enter" && activeResult) {
              event.preventDefault();
              add(activeResult);
            }
          }}
        />
        {expanded && results.length > 0 ? (
          <ul className="street-results" id={listboxId} role="listbox">
            {results.map((group, index) => (
              <li
                id={`${listboxId}-option-${index}`}
                className="street-option"
                key={group.id}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(group)}
              >
                {group.displayName}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="street-chips" aria-label="Rues sélectionnées">
        {selectedGroups.map((group) => (
          <span className="street-chip" key={group.id}>
            <span>{group.displayName}</span>
            <button
              type="button"
              aria-label={fr.removeStreet(group.displayName)}
              onClick={() => onRemove(group.id)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <span className="street-search-status" role="status">
        {limitReached
          ? fr.streetLimit
          : expanded && query.trim() && results.length === 0
            ? fr.noStreetResult
            : ""}
      </span>
    </div>
  );
}
