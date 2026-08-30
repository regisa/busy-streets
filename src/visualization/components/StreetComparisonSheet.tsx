import { fr } from "../messages/fr";
import type { StreetComparisonMatrix } from "../street-comparison";

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export function StreetComparisonSheet({
  matrix,
  selectedCount,
  collapsed,
  onCollapsedChange,
}: Readonly<{
  matrix: StreetComparisonMatrix;
  selectedCount: number;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}>) {
  if (collapsed) {
    return (
      <button
        type="button"
        className="street-comparison-summary"
        onClick={() => onCollapsedChange(false)}
      >
        {fr.selectedStreetCount(selectedCount)}
      </button>
    );
  }

  return (
    <section className="bottom-sheet street-comparison-sheet" aria-labelledby="street-comparison-title">
      <div className="sheet-handle" aria-hidden="true" />
      <header>
        <h2 id="street-comparison-title">{fr.streetComparisonTitle}</h2>
        <button
          type="button"
          className="sheet-close"
          aria-label={fr.collapseComparison}
          onClick={() => onCollapsedChange(true)}
        >
          −
        </button>
      </header>
      <div className="street-comparison-scroll">
        <table className="street-comparison-table">
          <thead>
            <tr>
              <th scope="col">{fr.streetColumn}</th>
              <th scope="col">{fr.counterColumn}</th>
              <th scope="col">{fr.statusColumn}</th>
              {matrix.years.map((year) => (
                <th scope="col" key={year}>{year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <span>{row.streetName}</span>
                  {row.candidateReview ? (
                    <span className="evidence-label">{fr.candidateReview}</span>
                  ) : null}
                </th>
                <td>{row.locationLabel ?? "—"}</td>
                <td>
                  {row.observations.some(
                    ({ vehiclesPerDay }) => vehiclesPerDay !== null,
                  )
                    ? fr.dataAvailable
                    : fr.noData}
                </td>
                {matrix.years.map((year) => {
                  const observation = row.observations.find(
                    (candidate) => candidate.year === year,
                  );
                  return (
                    <td key={year}>
                      {observation?.vehiclesPerDay === null || !observation ? (
                        fr.noData
                      ) : (
                        <>
                          <strong>{integer.format(observation.vehiclesPerDay)}</strong>
                          <span className="quality-label">
                            {qualityLabel(observation.quality)}
                          </span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function qualityLabel(quality: "measured" | "modeled" | "interpolated" | "unknown"): string {
  switch (quality) {
    case "measured":
      return fr.measured;
    case "modeled":
      return fr.modeled;
    case "interpolated":
      return fr.interpolated;
    case "unknown":
      return fr.unknownQuality;
  }
}
