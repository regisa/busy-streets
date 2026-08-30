import { z } from "zod";

const longitudeSchema = z.number().finite().min(-180).max(180);
const latitudeSchema = z.number().finite().min(-90).max(90);
const positionSchema = z.tuple([longitudeSchema, latitudeSchema]);
const lineCoordinatesSchema = z.array(positionSchema).min(2);
const ringSchema = z.array(positionSchema).min(4).superRefine((ring, context) => {
  const first = ring[0];
  const last = ring.at(-1);
  if (first?.[0] !== last?.[0] || first?.[1] !== last?.[1]) {
    context.addIssue({ code: "custom", message: "GeoJSON ring must be closed" });
  }
});

const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: positionSchema,
});
const multiLineStringSchema = z.object({
  type: z.literal("MultiLineString"),
  coordinates: z.array(lineCoordinatesSchema).min(1),
});
const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(ringSchema).min(1),
});
const multiPolygonSchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(ringSchema).min(1)).min(1),
});

const sourceSchema = z.object({
  sourceId: z.string().min(1),
  status: z.enum(["audited", "blocked"]),
  artifactId: z.string().min(1).optional(),
  blockedReason: z.string().min(1).optional(),
  sha256: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  licenseUrl: z.string().url().optional(),
});

const sourceLinkSchema = z.object({
  observationId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceRecordId: z.string().min(1),
  publicationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const qualitySchema = z.enum([
  "measured",
  "modeled",
  "interpolated",
  "unknown",
]);

const annualObservationSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  vehiclesPerDay: z.number().finite().nonnegative().nullable(),
  heavyVehiclePercent: z.number().finite().min(0).max(100).nullable(),
  quality: qualitySchema,
  sourceLinks: z.array(sourceLinkSchema).min(1),
});

const stationMemberSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourceRecordId: z.string().min(1),
  sourceStationId: z.string().min(1).optional(),
  counterType: z.enum(["permanent", "rotating", "occasional", "unknown"]),
  location: pointSchema,
  roadRef: z.string().min(1).optional(),
  roadName: z.string().min(1).optional(),
  bearing: z.number().finite().optional(),
  geographicScope: z.enum(["inside-municipality", "buffer-only"]),
});

const auditIssueSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  sourceId: z.string().min(1).optional(),
  sourceRecordId: z.string().min(1).optional(),
  message: z.string().min(1),
});

const stationGroupSchema = z.object({
  id: z.string().min(1),
  location: pointSchema,
  memberStationIds: z.array(z.string().min(1)).min(1),
  members: z.array(stationMemberSchema).min(1),
  observations: z.array(annualObservationSchema),
  issues: z.array(auditIssueSchema),
});

const streetSubjectSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  normalizedName: z.string().min(1),
  segmentIds: z.array(z.string().min(1)).min(1),
  geometry: multiLineStringSchema,
  vehicleAccess: z.array(
    z.enum(["free", "restricted", "prohibited", "unknown"]),
  ).min(1),
  evidenceState: z.enum(["data-available", "candidate-review", "no-data"]),
});

const targetCorridorSchema = z.object({
  targetId: z.enum(["avenue-de-la-gare", "avenue-de-verdun"]),
  streetSubjectIds: z.array(z.string().min(1)).min(1),
  displayName: z.enum(["Avenue de la Gare", "Avenue de Verdun"]),
  reviewStatus: z.literal("pending"),
});

export const streetTrafficAssignmentSchema = z.object({
  id: z.string().min(1),
  streetSubjectId: z.string().min(1),
  stationGroupId: z.string().min(1),
  status: z.enum(["accepted", "candidate-review"]),
  evidenceSource: z.enum(["manual-review", "osm-probe"]),
  evidenceReference: z.string().min(1),
});

export interface StreetTrafficAssignment {
  readonly id: string;
  readonly streetSubjectId: string;
  readonly stationGroupId: string;
  readonly status: "accepted" | "candidate-review";
  readonly evidenceSource: "manual-review" | "osm-probe";
  readonly evidenceReference: string;
}

export const visualizationBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    municipalityInseeCode: z.literal("64122"),
    bufferKilometers: z.literal(2),
    boundary: multiPolygonSchema,
    buffer: z.union([polygonSchema, multiPolygonSchema]),
    sources: z.array(sourceSchema),
    stationGroups: z.array(stationGroupSchema),
    streetSubjects: z.array(streetSubjectSchema),
    targetCorridors: z.array(targetCorridorSchema).length(2),
    streetAssignments: z.array(streetTrafficAssignmentSchema),
    issues: z.array(auditIssueSchema),
  })
  .superRefine((bundle, context) => {
    uniqueIds(bundle.sources, "sourceId", "source", context);
    uniqueIds(bundle.stationGroups, "id", "station group", context);
    uniqueIds(bundle.streetSubjects, "id", "street subject", context);
    uniqueIds(bundle.targetCorridors, "targetId", "target corridor", context);
    uniqueIds(bundle.streetAssignments, "id", "street assignment", context);

    const sourceIds = new Set(bundle.sources.map(({ sourceId }) => sourceId));
    const stationGroupIds = new Set(bundle.stationGroups.map(({ id }) => id));
    const streetSubjectIds = new Set(bundle.streetSubjects.map(({ id }) => id));

    for (const group of bundle.stationGroups) {
      uniqueIds(group.members, "id", "station member", context);
      const listedMembers = [...group.memberStationIds].sort();
      const includedMembers = group.members.map(({ id }) => id).sort();
      if (JSON.stringify(listedMembers) !== JSON.stringify(includedMembers)) {
        context.addIssue({
          code: "custom",
          message: `Station group ${group.id} member IDs do not match members`,
        });
      }
      for (const member of group.members) {
        requireKnownSource(member.sourceId, sourceIds, "station member", context);
      }
      for (const observation of group.observations) {
        validateObservation(observation, sourceIds, context);
      }
    }
    const targetIds = new Set(bundle.targetCorridors.map(({ targetId }) => targetId));
    for (const required of ["avenue-de-la-gare", "avenue-de-verdun"] as const) {
      if (!targetIds.has(required)) {
        context.addIssue({ code: "custom", message: `Missing target corridor: ${required}` });
      }
    }
    for (const target of bundle.targetCorridors) {
      for (const streetSubjectId of target.streetSubjectIds) {
        if (!streetSubjectIds.has(streetSubjectId)) {
          context.addIssue({
            code: "custom",
            message: `Unknown target street subject: ${streetSubjectId}`,
          });
        }
      }
    }
    for (const assignment of bundle.streetAssignments) {
      if (!streetSubjectIds.has(assignment.streetSubjectId)) {
        context.addIssue({
          code: "custom",
          message: `Unknown assignment street subject: ${assignment.streetSubjectId}`,
        });
      }
      if (!stationGroupIds.has(assignment.stationGroupId)) {
        context.addIssue({
          code: "custom",
          message: `Unknown assignment station group: ${assignment.stationGroupId}`,
        });
      }
    }
  });

export type VisualizationBundle = z.infer<typeof visualizationBundleSchema>;

function uniqueIds<T extends Record<K, string>, K extends keyof T>(
  values: readonly T[],
  key: K,
  label: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const id = value[key];
    if (seen.has(id)) {
      context.addIssue({ code: "custom", message: `Duplicate ${label} ID: ${id}` });
    }
    seen.add(id);
  }
}

function validateObservation(
  observation: z.infer<typeof annualObservationSchema>,
  sourceIds: ReadonlySet<string>,
  context: z.RefinementCtx,
): void {
  if (observation.quality === "interpolated") {
    context.addIssue({
      code: "custom",
      message: "Phase 1 visualization must not contain interpolated observations",
    });
  }
  for (const link of observation.sourceLinks) {
    if (!sourceIds.has(link.sourceId)) {
      context.addIssue({
        code: "custom",
        message: `Unknown observation source link: ${link.sourceId}`,
      });
    }
  }
}

function requireKnownSource(
  sourceId: string,
  sourceIds: ReadonlySet<string>,
  label: string,
  context: z.RefinementCtx,
): void {
  if (!sourceIds.has(sourceId)) {
    context.addIssue({ code: "custom", message: `Unknown ${label} source: ${sourceId}` });
  }
}
