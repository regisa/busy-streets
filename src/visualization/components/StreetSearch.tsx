import type { MapSelection } from "../map/map-controller";
import type { StreetSearchOption } from "../selectors";

export function StreetSearch({
  options,
  onSelect,
}: Readonly<{
  options: readonly StreetSearchOption[];
  onSelect: (selection: MapSelection) => void;
}>) {
  return (
    <label className="street-search">
      <span>Rechercher une rue</span>
      <select
        aria-label="Rechercher une rue"
        defaultValue=""
        onChange={(event) => {
          const option = options.find(({ value }) => value === event.currentTarget.value);
          if (option) onSelect(option.selection);
        }}
      >
        <option value="" disabled>Sélectionner…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
