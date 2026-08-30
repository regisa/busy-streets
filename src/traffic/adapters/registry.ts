import type {
  ArtifactPathResolver,
  TrafficIssueReporter,
  TrafficSourceAdapter,
} from "../contracts.js";
import { Dreal2024PointAdapter } from "./dreal-2024-point.js";
import { Dreal2019To2023PointAdapter } from "./dreal-2019-2023-point.js";
import { Dreal2023LinearAdapter } from "./dreal-2023-linear.js";
import { Cd64LatestRoadCountsAdapter } from "./cd64-latest-road-counts.js";

export function createTrafficSourceAdapter(
  sourceId: string,
  resolvePath: ArtifactPathResolver,
  reportIssue?: TrafficIssueReporter,
): TrafficSourceAdapter | null {
  if (sourceId === "dreal-2024-point") {
    return new Dreal2024PointAdapter(resolvePath, reportIssue);
  }
  if (sourceId === "dreal-2019-2023-point") {
    return new Dreal2019To2023PointAdapter(resolvePath, reportIssue);
  }
  if (sourceId === "dreal-2023-linear") {
    return new Dreal2023LinearAdapter(resolvePath, reportIssue);
  }
  if (sourceId === "cd64-latest-road-counts-point") {
    return new Cd64LatestRoadCountsAdapter(resolvePath, reportIssue);
  }
  return null;
}
