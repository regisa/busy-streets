import type { VisualizationBundle } from "../contracts";
import type { MapSelection } from "../map/map-controller";
import { fr } from "../messages/fr";
import { selectDetail } from "../selectors";
import { AnnualHistory } from "./AnnualHistory";
import { ComparisonPanel } from "./ComparisonPanel";

export function BottomSheet({
  bundle,
  selection,
  onClose,
}: Readonly<{
  bundle: VisualizationBundle;
  selection: MapSelection;
  onClose: () => void;
}>) {
  const detail = selectDetail(bundle, selection);
  return (
    <section className="bottom-sheet" aria-labelledby="detail-title">
      <div className="sheet-handle" aria-hidden="true" />
      <header>
        <h2 id="detail-title">{detail.title}</h2>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Fermer les détails">×</button>
      </header>
      {detail.kind === "station" ? (
        <>
          {detail.group.issues
            .filter((issue) => issue.code !== "osm-match-ambiguous")
            .map((issue) => (
            <p className="evidence-label" key={`${issue.code}:${issue.message}`}>
              {issue.message}
            </p>
          ))}
          <AnnualHistory observations={detail.group.observations} />
          <ComparisonPanel subjectId={detail.group.id} observations={detail.group.observations} />
          <details open>
            <summary>Compteurs sources</summary>
            <ul>
              {detail.group.members.map((member) => (
                <li key={member.id}>
                  <strong>{member.id}</strong> · {member.counterType} · {member.sourceRecordId}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : detail.kind === "target" ? (
        <div className="empty-detail">
          <p>{fr.comparisonUnavailable}</p>
          <p>{fr.noData}</p>
        </div>
      ) : (
        <div className="empty-detail">
          {detail.acceptedStationGroup ? (
            <AnnualHistory observations={detail.acceptedStationGroup.observations} />
          ) : (
            <p>{fr.noData}</p>
          )}
        </div>
      )}
    </section>
  );
}
