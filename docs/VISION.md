# Product vision

## The question

Trafic routier à Biarritz should help a person answer one question:

> How has vehicle traffic changed on individual streets and road corridors in
> Biarritz over the last decade or more?

The answer must stay within the evidence. A sparse map is more useful than a
complete-looking map built from unsupported assumptions.

## Who it is for

The first audience is French-speaking residents, civic researchers,
journalists, and local associations who want to examine changes in mobility.
Transport professionals should be able to inspect the methodology and
provenance, but the product is not an official planning or engineering tool.

## Intended product

The eventual web application will use the public title **Trafic routier à
Biarritz**. Its interface will be French-only in the first release and ready for
a later English translation without embedding French text throughout the domain
code.

The main view will be an interactive map with a year control. Where the data is
good enough, users will be able to:

- inspect traffic for a road, corridor, or source station;
- compare two annual periods;
- view an annual history and the source of each value;
- distinguish measured, modeled, interpolated, and missing values;
- understand map-matching confidence and known coverage gaps.

The visible quality labels will be:

| Stored meaning | French label | Display rule |
| --- | --- | --- |
| `measured` | Mesuré | A source ties the value to a counter observation. |
| `modeled` | Modélisé | The source explicitly describes the value as estimated or theoretical. |
| `interpolated` | Interpolé | The application derived the value between observations. Never a Phase 1 output. |
| `unknown` | Qualité indéterminée | A value exists, but the source does not support a measured or modeled classification. Show it with a warning. |
| no stored observation | Aucune donnée | No usable value exists for the selected road and period. |

## Analytical boundaries

The product will preserve the original observation independently from any
station-to-road match. A nearby road is only a candidate until the matching
evidence clears the documented threshold.

It will not:

- fabricate traffic for roads with no data;
- silently interpolate missing years;
- present modeled traffic as measured traffic;
- infer seasonal traffic from annual TMJA values;
- add segment values and call the result total traffic in Biarritz;
- attribute a traffic change to a policy or road event without evidence.

Comparisons will exclude unresolved source conflicts. Comparisons between
different quality classes will carry an explicit warning or be withheld when
they would mislead.

## Geographic ambition

Biarritz, INSEE commune code `64122`, is the product. Phase 1 also examines a
separately reported 2 km buffer to find plausible roads entering the commune.

The boundary and source interfaces may remain configurable, but the project will
not commit to a reusable multi-city platform until the Biarritz audit proves the
approach useful.

## Delivery path

The approved work begins with evidence, not interface construction:

1. Audit official traffic sources through 2024 and assess Biarritz coverage.
2. Decide whether the evidence supports a road-level measured MVP, a limited
   station or corridor explorer, or no responsible product yet.
3. Design the street network, map matching, data storage, and French interface
   only after that recommendation.

Next.js, PostgreSQL/PostGIS, Supabase, MapLibre, TomTom, production road IDs, and
the polished map remain possible later choices. Phase 1 does not implement or
select them for production.

## Success

Phase 1 succeeds when every in-scope source has either been audited or has a
reproducible blocked reason, the report separates measured and modeled evidence,
and the recommendation matches the observed coverage. Finding too little open
data is a valid result.
