import { resolve } from "node:path";

import { loadLocalVisualizationBundle } from "../visualization/load-local-bundle";
import { fr } from "../visualization/messages/fr";
import { TrafficExplorer } from "../visualization/components/TrafficExplorer";

export default async function HomePage() {
  const runtime =
    process.env.NODE_ENV === "production"
      ? "production"
      : process.env.NODE_ENV === "test"
        ? "test"
        : "development";
  const bundlePath = resolve(
    process.cwd(),
    runtime === "production"
      ? "data/traffic/biarritz.public.json"
      : "artifacts/traffic/visualization/biarritz.json",
  );
  const result = await loadLocalVisualizationBundle({
    path: bundlePath,
    runtime,
  });

  if (result.status === "missing") {
    return (
      <UnavailableState title={fr.appTitle} message={fr.missingData}>
        <code>
          {runtime === "production"
            ? "pnpm traffic:visualize:public"
            : "pnpm traffic:visualize --as-of 2026-08-29"}
        </code>
      </UnavailableState>
    );
  }
  if (result.status === "invalid") {
    return (
      <UnavailableState title={fr.invalidData} message="Le fichier local est invalide.">
        <details>
          <summary>Détails techniques</summary>
          <ul>
            {result.details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        </details>
      </UnavailableState>
    );
  }

  return <TrafficExplorer bundle={result.bundle} />;
}

function UnavailableState({
  title,
  message,
  children,
}: Readonly<{
  title: string;
  message: string;
  children?: React.ReactNode;
}>) {
  return (
    <main className="unavailable-state">
      <h1>{title}</h1>
      <p>{message}</p>
      {children}
    </main>
  );
}
