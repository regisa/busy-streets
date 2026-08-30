import { readFile } from "node:fs/promises";

import { visualizationBundleSchema, type VisualizationBundle } from "./contracts";

export type LocalBundleLoadResult =
  | { readonly status: "ready"; readonly bundle: VisualizationBundle }
  | { readonly status: "missing"; readonly expectedPath: string }
  | { readonly status: "invalid"; readonly details: readonly string[] };

export async function loadLocalVisualizationBundle(options: {
  readonly path: string;
  readonly runtime: "development" | "test" | "production";
}): Promise<LocalBundleLoadResult> {
  let source: string;
  try {
    source = await readFile(options.path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return { status: "missing", expectedPath: options.path };
    }
    return {
      status: "invalid",
      details: [error instanceof Error ? error.message : String(error)],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return {
      status: "invalid",
      details: ["The visualization bundle is not valid JSON"],
    };
  }
  const validated = visualizationBundleSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      status: "invalid",
      details: validated.error.issues.map((issue) => {
        const path = issue.path.join(".");
        return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
      }),
    };
  }
  return { status: "ready", bundle: validated.data };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
