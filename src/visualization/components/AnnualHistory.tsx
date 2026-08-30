import type { VisualizationBundle } from "../contracts";
import { fr } from "../messages/fr";

type AnnualObservation = VisualizationBundle["stationGroups"][number]["observations"][number];

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function AnnualHistory({
  observations,
}: Readonly<{ observations: readonly AnnualObservation[] }>) {
  const ordered = [...observations].sort((left, right) => left.year - right.year);
  const values = ordered.flatMap(({ vehiclesPerDay }) =>
    vehiclesPerDay === null ? [] : [vehiclesPerDay],
  );
  const maximum = Math.max(...values, 1);
  const latest = ordered.at(-1);
  return (
    <section className="annual-history" aria-labelledby="annual-history-title">
      <h3 id="annual-history-title">Historique annuel</h3>
      {latest?.vehiclesPerDay !== null && latest?.vehiclesPerDay !== undefined ? (
        <p className="latest-value">
          <span>{integer.format(latest.vehiclesPerDay)} véhicules par jour</span>
          <span className="quality-label">{qualityLabel(latest.quality)}</span>
        </p>
      ) : null}
      <svg
        className="history-chart"
        role="img"
        aria-label="Évolution annuelle du trafic, valeurs détaillées dans le tableau"
        viewBox="0 0 320 100"
      >
        {ordered.map((observation, index) => {
          if (observation.vehiclesPerDay === null) return null;
          const x = ordered.length === 1 ? 160 : 20 + (index / (ordered.length - 1)) * 280;
          const y = 85 - (observation.vehiclesPerDay / maximum) * 65;
          return <circle key={observation.year} cx={x} cy={y} r="5" />;
        })}
      </svg>
      <table aria-label="Valeurs annuelles">
        <thead>
          <tr><th>Année</th><th>TMJA</th><th>Poids lourds</th><th>Qualité</th></tr>
        </thead>
        <tbody>
          {ordered.map((observation) => (
            <tr key={observation.year}>
              <th>{observation.year}</th>
              <td>{observation.vehiclesPerDay === null ? fr.noData : integer.format(observation.vehiclesPerDay)}</td>
              <td>{observation.heavyVehiclePercent === null ? "Non renseigné" : `${decimal.format(observation.heavyVehiclePercent)} %`}</td>
              <td>{qualityLabel(observation.quality)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details open>
        <summary>Sources et provenance</summary>
        <ul>
          {ordered.flatMap((observation) =>
            observation.sourceLinks.map((link) => (
              <li key={`${observation.year}:${link.observationId}`}>
                {observation.year} · {link.sourceId} · {link.sourceRecordId}
              </li>
            )),
          )}
        </ul>
      </details>
    </section>
  );
}

export function qualityLabel(quality: AnnualObservation["quality"]): string {
  if (quality === "measured") return fr.measured;
  if (quality === "modeled") return fr.modeled;
  if (quality === "interpolated") return fr.interpolated;
  return fr.unknownQuality;
}
