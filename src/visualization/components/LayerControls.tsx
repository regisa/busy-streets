import { fr } from "../messages/fr";

export function LayerControls({
  linearTrafficVisible,
  onLinearTrafficVisibleChange,
}: Readonly<{
  linearTrafficVisible: boolean;
  onLinearTrafficVisibleChange: (visible: boolean) => void;
}>) {
  return (
    <fieldset className="layer-controls">
      <legend>{fr.layers}</legend>
      <label>
        <input
          type="checkbox"
          checked={linearTrafficVisible}
          onChange={(event) => onLinearTrafficVisibleChange(event.currentTarget.checked)}
        />
        Afficher les données linéaires 2023
      </label>
      {linearTrafficVisible ? (
        <span className="evidence-label" role="status">{fr.unknownQuality}</span>
      ) : null}
    </fieldset>
  );
}
