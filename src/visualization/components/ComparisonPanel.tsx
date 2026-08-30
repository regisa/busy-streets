import { useMemo, useState } from "react";

import type { ReconciledTrafficObservation } from "../../traffic/reconciliation";
import { compareAnnualObservations, type AnnualComparison } from "../comparison";
import type { VisualizationBundle } from "../contracts";

type AnnualObservation = VisualizationBundle["stationGroups"][number]["observations"][number];

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const percentage = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function ComparisonPanel({
  subjectId,
  observations,
}: Readonly<{
  subjectId: string;
  observations: readonly AnnualObservation[];
}>) {
  const eligible = useMemo(
    () => observations.filter(({ vehiclesPerDay }) => vehiclesPerDay !== null),
    [observations],
  );
  const [baselineYear, setBaselineYear] = useState("");
  const [comparisonYear, setComparisonYear] = useState("");
  const [result, setResult] = useState<AnnualComparison | null>(null);
  const baseline = eligible.find(({ year }) => String(year) === baselineYear);

  return (
    <section className="comparison-panel" aria-labelledby="comparison-title">
      <h3 id="comparison-title">Comparer deux années</h3>
      <div className="comparison-fields">
        <label>
          Année de référence
          <select value={baselineYear} onChange={(event) => { setBaselineYear(event.currentTarget.value); setResult(null); }}>
            <option value="">Choisir…</option>
            {eligible.map(({ year }) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>
          Année comparée
          <select value={comparisonYear} onChange={(event) => { setComparisonYear(event.currentTarget.value); setResult(null); }}>
            <option value="">Choisir…</option>
            {eligible.map((observation) => (
              <option
                key={observation.year}
                value={observation.year}
                disabled={
                  observation.year === baseline?.year ||
                  (baseline !== undefined && observation.quality !== baseline.quality)
                }
              >
                {observation.year}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!baselineYear || !comparisonYear}
          onClick={() => {
            const baselineObservation = eligible.find(({ year }) => String(year) === baselineYear);
            const comparisonObservation = eligible.find(({ year }) => String(year) === comparisonYear);
            if (baselineObservation && comparisonObservation) {
              setResult(
                compareAnnualObservations(
                  toReconciled(subjectId, baselineObservation),
                  toReconciled(subjectId, comparisonObservation),
                ),
              );
            }
          }}
        >
          Calculer la comparaison
        </button>
      </div>
      {result?.eligibility === "eligible" ? (
        <dl className="comparison-result" aria-label="Résultat de la comparaison" aria-live="polite">
          <div><dt>{result.baselineYear}</dt><dd>{integer.format(result.baselineVehiclesPerDay)}</dd></div>
          <div><dt>{result.comparisonYear}</dt><dd>{integer.format(result.comparisonVehiclesPerDay)}</dd></div>
          <div><dt>Évolution absolue</dt><dd>{signedInteger(result.absoluteChange)}</dd></div>
          <div>
            <dt>Évolution relative</dt>
            <dd>
              {result.percentageChange === null
                ? "Pourcentage non calculable"
                : `${result.percentageChange >= 0 ? "+" : ""}${percentage.format(result.percentageChange)} %`}
            </dd>
          </div>
        </dl>
      ) : result ? (
        <p role="status">Comparaison méthodologiquement indisponible.</p>
      ) : null}
    </section>
  );
}

function signedInteger(value: number): string {
  return `${value >= 0 ? "+" : ""}${integer.format(value)}`;
}

function toReconciled(
  subjectId: string,
  observation: AnnualObservation,
): ReconciledTrafficObservation {
  const latestPublicationDate = observation.sourceLinks.reduce(
    (latest, link) => link.publicationDate > latest ? link.publicationDate : latest,
    "",
  );
  const canonical = {
    vehiclesPerDay: observation.vehiclesPerDay,
    heavyVehiclePercent: observation.heavyVehiclePercent,
    quality: observation.quality,
    latestPublicationDate,
    sourceLinks: observation.sourceLinks,
  };
  return {
    subjectId,
    year: observation.year,
    periodType: "annual",
    variants: [canonical],
    resolution: "canonical",
    canonical,
    comparisonValue: {
      vehiclesPerDay: observation.vehiclesPerDay,
      heavyVehiclePercent: observation.heavyVehiclePercent,
      quality: observation.quality,
    },
  };
}
