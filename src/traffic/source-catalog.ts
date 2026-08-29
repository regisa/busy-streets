import type { SourceDefinition } from "./contracts.js";

const OPEN_LICENCE_2 = {
  code: "lov2",
  label: "Licence Ouverte / Open Licence version 2.0",
  redistributionAllowed: true,
  url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/",
  verifiedAt: "2026-08-29",
} as const;

const LICENCE_NOT_SPECIFIED = {
  code: "not-specified",
  label: "Licence not specified by the catalogue entry",
  redistributionAllowed: false,
  url: null,
  verifiedAt: "2026-08-29",
} as const;

export const DREAL_TRAFFIC_SOURCES = [
  {
    id: "dreal-2011-2015-point",
    title:
      "Nouvelle-Aquitaine: road traffic 2011-2015, counter locations",
    datasetUrl:
      "https://www.data.gouv.fr/datasets/nouvelle-aquitaine-trafic-routier-2011-2015-des-reseaux-autoroutiers-non-concede-national-et-departemental-localisation-ponctuel",
    resourceUrl:
      "https://www.data.gouv.fr/api/1/datasets/r/3fa07ca7-cb13-4cb5-b7c3-d7802c8087b8",
    coverageYears: [2011, 2015],
    geometryKind: "point",
    publicationDate: "2017-09-18",
    adapterVersion: "1",
    expectedFormats: ["zip", "shp"],
    license: OPEN_LICENCE_2,
  },
  {
    id: "dreal-2015-2019-point",
    title:
      "Nouvelle-Aquitaine: road traffic 2015-2019, counter locations",
    datasetUrl:
      "https://www.data.gouv.fr/datasets/nouvelle-aquitaine-trafic-routier-2015-1019-des-reseaux-autoroutiers-non-concede-national-et-departemental-localisation-ponctuel",
    resourceUrl:
      "https://www.data.gouv.fr/api/1/datasets/r/13e31d16-a6bd-4a76-b6f3-910933af92c5",
    coverageYears: [2015, 2019],
    geometryKind: "point",
    publicationDate: "2021-03-09",
    adapterVersion: "1",
    expectedFormats: ["zip", "shp"],
    license: OPEN_LICENCE_2,
  },
  {
    id: "dreal-2019-2023-point",
    title:
      "Nouvelle-Aquitaine: road traffic 2019-2023, counter locations",
    datasetUrl:
      "https://www.data.gouv.fr/datasets/nouvelle-aquitaine-trafic-routier-2019-2023-des-reseaux-autoroutiers-non-concede-national-et-departemental-localisation-ponctuel",
    resourceUrl:
      "https://www.data.gouv.fr/api/1/datasets/r/7f27a4a7-e7fd-4552-9dc7-349f2df7a180",
    coverageYears: [2019, 2023],
    geometryKind: "point",
    publicationDate: "2025-04-10",
    adapterVersion: "1",
    expectedFormats: ["zip", "shp"],
    license: LICENCE_NOT_SPECIFIED,
  },
  {
    id: "dreal-2023-linear",
    title: "Nouvelle-Aquitaine: road traffic 2023, linear network",
    datasetUrl:
      "https://www.data.gouv.fr/datasets/nouvelle-aquitaine-trafic-routier-2023-du-reseau-autoroutier-concede-du-reseau-national-et-du-reseau-departemental-lineaire",
    resourceUrl:
      "https://www.data.gouv.fr/api/1/datasets/r/712a838d-da9e-4247-bc8d-8e633530b101",
    coverageYears: [2023, 2023],
    geometryKind: "line",
    publicationDate: "2025-04-10",
    adapterVersion: "1",
    expectedFormats: ["zip", "shp"],
    license: LICENCE_NOT_SPECIFIED,
  },
  {
    id: "dreal-2024-point",
    title: "Nouvelle-Aquitaine: road traffic 2024, counter locations",
    datasetUrl:
      "https://www.data.gouv.fr/datasets/nouvelle-aquitaine-trafic-routier-2024-des-reseaux-autoroutiers-non-concede-national-et-departemental-localisation-ponctuel",
    resourceUrl:
      "https://www.data.gouv.fr/api/1/datasets/r/625bbb8b-9c97-43db-b597-81755f99a890",
    coverageYears: [2024, 2024],
    geometryKind: "point",
    publicationDate: "2026-05-21",
    adapterVersion: "1",
    expectedFormats: ["zip", "shp"],
    license: LICENCE_NOT_SPECIFIED,
  },
  {
    id: "dreal-2024-linear",
    title: "Nouvelle-Aquitaine: road traffic 2024, linear network",
    datasetUrl:
      "https://www.data.gouv.fr/datasets/nouvelle-aquitaine-trafic-routier-2024-du-reseau-autoroutier-concede-du-reseau-national-et-du-reseau-departemental-lineaire",
    resourceUrl:
      "https://www.data.gouv.fr/api/1/datasets/r/4c21af32-f5f8-4f5e-9a5d-4db92e58c16e",
    coverageYears: [2024, 2024],
    geometryKind: "line",
    publicationDate: "2026-05-21",
    adapterVersion: "1",
    expectedFormats: ["zip", "shp"],
    license: LICENCE_NOT_SPECIFIED,
  },
] as const satisfies readonly SourceDefinition[];

export function findTrafficSource(sourceId: string): SourceDefinition | null {
  return DREAL_TRAFFIC_SOURCES.find((source) => source.id === sourceId) ?? null;
}
