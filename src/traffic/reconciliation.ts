import {
  phase1TrafficObservationSchema,
  type Phase1TrafficObservation,
} from "./contracts.js";
import { findTrafficSource } from "./source-catalog.js";

export interface ReconciliationInput {
  readonly subjectId: string;
  readonly observation: Phase1TrafficObservation;
}

export interface ReconciliationSourceLink {
  readonly observationId: string;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly publicationDate: string;
}

export interface ReconciledObservationVariant {
  readonly vehiclesPerDay: number | null;
  readonly heavyVehiclePercent: number | null;
  readonly quality: Phase1TrafficObservation["quality"];
  readonly latestPublicationDate: string;
  readonly sourceLinks: readonly ReconciliationSourceLink[];
}

export interface ReconciledTrafficObservation {
  readonly subjectId: string;
  readonly year: number;
  readonly periodType: "annual";
  readonly variants: readonly ReconciledObservationVariant[];
  readonly resolution: "canonical" | "unresolved-conflict";
  readonly canonical: ReconciledObservationVariant | null;
  readonly comparisonValue: {
    readonly vehiclesPerDay: number | null;
    readonly heavyVehiclePercent: number | null;
    readonly quality: Phase1TrafficObservation["quality"];
  } | null;
}

export function reconcileTrafficObservations(
  inputs: readonly ReconciliationInput[],
): readonly ReconciledTrafficObservation[] {
  const groups = new Map<
    string,
    {
      readonly subjectId: string;
      readonly year: number;
      readonly variants: Map<string, MutableVariant>;
    }
  >();

  for (const input of inputs) {
    if (input.subjectId.trim().length === 0) {
      throw new Error("Comparison subject must be a non-empty string");
    }
    const observation = phase1TrafficObservationSchema.parse(input.observation);
    const source = findTrafficSource(observation.sourceId);
    if (!source) {
      throw new Error(
        `Source ${observation.sourceId} has no official publication definition`,
      );
    }
    const groupKey = JSON.stringify([input.subjectId, observation.year]);
    const group = groups.get(groupKey) ?? {
      subjectId: input.subjectId,
      year: observation.year,
      variants: new Map<string, MutableVariant>(),
    };
    groups.set(groupKey, group);

    const variantKey = JSON.stringify([
      observation.vehiclesPerDay,
      observation.heavyVehiclePercent,
      observation.quality,
    ]);
    const variant = group.variants.get(variantKey) ?? {
      vehiclesPerDay: observation.vehiclesPerDay,
      heavyVehiclePercent: observation.heavyVehiclePercent,
      quality: observation.quality,
      sourceLinks: [],
    };
    variant.sourceLinks.push({
      observationId: observation.id,
      sourceId: observation.sourceId,
      sourceRecordId: observation.sourceRecordId,
      publicationDate: source.publicationDate,
    });
    group.variants.set(variantKey, variant);
  }

  return [...groups.values()]
    .sort(
      (left, right) =>
        left.subjectId.localeCompare(right.subjectId) || left.year - right.year,
    )
    .map((group) => {
      const variants = [...group.variants.values()]
        .map(finalizeVariant)
        .sort(compareVariantPrecedence);
      const [first, second] = variants;
      const unresolvedConflict =
        first !== undefined &&
        second !== undefined &&
        first.quality === second.quality &&
        first.latestPublicationDate === second.latestPublicationDate;
      const canonical = unresolvedConflict ? null : (first ?? null);
      return {
        subjectId: group.subjectId,
        year: group.year,
        periodType: "annual",
        variants,
        resolution: unresolvedConflict ? "unresolved-conflict" : "canonical",
        canonical,
        comparisonValue: canonical
          ? {
              vehiclesPerDay: canonical.vehiclesPerDay,
              heavyVehiclePercent: canonical.heavyVehiclePercent,
              quality: canonical.quality,
            }
          : null,
      };
    });
}

interface MutableVariant {
  readonly vehiclesPerDay: number | null;
  readonly heavyVehiclePercent: number | null;
  readonly quality: Phase1TrafficObservation["quality"];
  readonly sourceLinks: ReconciliationSourceLink[];
}

function finalizeVariant(
  variant: MutableVariant,
): ReconciledObservationVariant {
  const sourceLinks = [...variant.sourceLinks].sort(
    (left, right) =>
      left.observationId.localeCompare(right.observationId) ||
      left.sourceId.localeCompare(right.sourceId) ||
      left.sourceRecordId.localeCompare(right.sourceRecordId) ||
      left.publicationDate.localeCompare(right.publicationDate),
  );
  const latestPublicationDate = sourceLinks.reduce(
    (latest, link) =>
      link.publicationDate > latest ? link.publicationDate : latest,
    sourceLinks[0]?.publicationDate ?? "",
  );
  return {
    vehiclesPerDay: variant.vehiclesPerDay,
    heavyVehiclePercent: variant.heavyVehiclePercent,
    quality: variant.quality,
    latestPublicationDate,
    sourceLinks,
  };
}

function compareVariantPrecedence(
  left: ReconciledObservationVariant,
  right: ReconciledObservationVariant,
): number {
  const qualityDifference = qualityRank(right.quality) - qualityRank(left.quality);
  if (qualityDifference !== 0) return qualityDifference;
  const publicationDifference = right.latestPublicationDate.localeCompare(
    left.latestPublicationDate,
  );
  if (publicationDifference !== 0) return publicationDifference;
  return (
    compareNullableNumber(left.vehiclesPerDay, right.vehiclesPerDay) ||
    compareNullableNumber(
      left.heavyVehiclePercent,
      right.heavyVehiclePercent,
    )
  );
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left - right;
}

function qualityRank(
  quality: Phase1TrafficObservation["quality"],
): number {
  if (quality === "measured") return 3;
  if (quality === "modeled") return 2;
  if (quality === "unknown") return 1;
  return 0;
}
