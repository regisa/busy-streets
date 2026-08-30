# Traffic source research

- Research and outreach dates: 2026-08-29 to 2026-08-30
- Geographic focus: Biarritz and its 2 km buffer
- Historical cutoff: 2024

This record separates sources that can support the Phase 1 count audit from
navigation and probe-data products that measure congestion or travel time. A
route-planning product can reflect tourist driving without measuring how many
vehicles passed a counter. The distinction matters for every comparison in the
future application.

## Mandatory target corridors

The product must compare Avenue de Verdun and Avenue de la Gare. Research and
procurement use the following dated current OSM definitions. They are request
geometry, not permanent production road IDs.

| Corridor | Current OSM ways | Approximate summed length | Bounding box |
| --- | --- | ---: | --- |
| Avenue de Verdun | `60135657`, `60256185`, `233155114`, `330075834`, `796939198`, `814256366`, `1156703701`, `1263064492`, `1288403977`, `1288403978`, `1288403979`, `1288404229`, `1288404230`, `1288404253`, `1288404254` | 1.518 km | `-1.5591748,43.4806272,-1.5412351,43.4821768` |
| Avenue de la Gare | `60208925`, `60208932`, `126642650`, `1263064481` | 0.097 km | `-1.5570599,43.4777658,-1.5568024,43.4783556` |

The dated OSM snapshot has base timestamp `2026-08-29T14:56:01Z` and SHA-256
`0137a2dfb3a919f37a83888e44a7a7598c845b9f319cb4121ff025cf6571e50d`.
Because Avenue de la Gare is only about 100 m long, a provider's broad claim of
city or country coverage is not enough. Each candidate must prove that both
directions and each historical period have usable evidence on the exact street.

The minimum buying test requires:

1. mapped geometry and provider IDs for both corridors;
2. the same documented metric and methodology for at least three materially
   separated periods, preferably including 2015, 2019, 2022, and 2024 when the
   archive allows it;
3. sample size, missing-period rate, confidence or validation error, and any
   expansion factor for every segment and period;
4. a record of panel, normalization, model, and map-version changes;
5. permanent retention and public derived-chart rights;
6. a no-charge or termination condition if either corridor misses the agreed
   sample threshold.

## Source admitted to Phase 1

The Département des Pyrénées-Atlantiques publishes
[Comptages routiers](https://data.le64.fr/explore/dataset/comptages_routiers/)
through an official Opendatasoft API. The metadata states Open Licence 2.0 and
describes annual rotating or permanent counts on departmental roads. The
dataset keeps the most recent count for each location, not a complete annual
history.

The 2026-08-29 GeoJSON export contains 278 point records with observation years
from 2012 through 2022. One record has Biarritz INSEE code `64122`: RD810 at PR
12+520, observation year 2022, MJA 35,551 vehicles per day, 947 heavy vehicles,
and a 2.66% heavy-vehicle share. The repository now catalogues, inspects, and
normalizes this source. A full live normalization produced 278 stations and 278
measured annual observations with no issue. Counter type remains `unknown`
because the record schema does not say whether each location is rotating or
permanent. The Biarritz record's road and PR fields derive continuity identifier
`64-D810-12+520`, while source-scoped station ID `86` remains intact.

This source can be redistributed under its stated licence. Reconciliation must
retain both its evidence and the matching DREAL evidence. The current DREAL
2022 record has the same MJA and heavy-vehicle share.

## Google Maps

The public Google Maps Platform APIs do not provide a reproducible 2011-2024
traffic-count archive.

- The [Routes API traffic options](https://developers.google.com/maps/documentation/routes/config_trade_offs)
  use current or future departure times. `staticDuration` is based on historical
  traffic patterns, but it is a route-duration estimate, not a dated historical
  observation that can be queried for past years.
- [Traffic-aware polylines](https://developers.google.com/maps/documentation/routes/traffic_on_polylines)
  classify route intervals as normal, slow, or traffic jam. They do not expose
  annual average daily traffic or vehicle counts.
- The [Maps JavaScript TrafficLayer](https://developers.google.com/maps/documentation/javascript/trafficlayer)
  visualizes frequently refreshed current conditions.
- The [Roads API](https://developers.google.com/maps/documentation/roads/overview)
  snaps coordinates to roads and can return speed limits. It is not a historical
  traffic-volume source.
- The [Google Maps service terms](https://cloud.google.com/archive/maps-platform/terms/maps-service-terms-20260602)
  restrict scraping, caching, and use of Routes or Roads content with non-Google
  maps. Those limits conflict with a retained, reproducible MapLibre audit.

[Roads Management Insights](https://developers.google.com/maps/documentation/roads-management-insights/overview)
is the Google product that best matches the user's tourist-driving concern. It
uses [aggregated Google Maps user data and historical traffic patterns](https://developers.google.com/maps/documentation/roads-management-insights/rmi-concepts)
and can retain travel duration and coarse speed readings for routes selected
after onboarding. It starts collecting after
subscription, requires work with a Google representative, and has separate
[Maps Analytics service terms](https://cloud.google.com/archive/terms/maps-platform/maps-analytics-service-terms-20251204).
Its accumulated table is route-specific and uses a 60-day partition expiration.
The terms make export, caching, and deletion depend on the order form. It is
therefore a possible future municipal congestion feed, not open Phase 1 evidence
and not a retroactive 2011-2024 archive. Google is excluded from the historical
two-street procurement shortlist.

No Google product is integrated or called by this repository. Any trial,
contract, API credential, billing account, or data export needs operator
approval.

## Commercial street-level candidates

No provider has been contacted and no account, trial, credential, or purchase
has been created. Public product pages do not prove usable history for both
streets. Exact-street samples are mandatory before purchase.

### Michelin Mobility Intelligence

[Michelin Traffic Counts](https://mobilityintelligence.michelin.com/en/products/traffic-counts/)
is the strongest first sample request. It covers Europe, reports more than one
million active personal cars per month in France plus commercial fleets, and
keys daily passage records directly to OSM ways. Results can split direction and
vehicle class.

The documented `TRIP_COUNT` is the number of contributing connected-vehicle
passages along a section. Michelin does not publicly document an expansion from
that panel to total road traffic, a per-way confidence interval, or the first
available historical year. The project must not label those values as measured
total traffic.

Pricing is described only as Premium. The public
[terms](https://mobilityintelligence.michelin.com/wp-content/uploads/2024/11/Michelin-Mobility-Intelligence-Terms-and-Conditions.pdf)
default to internal, limited use and prohibit disclosure or distribution of
company material without written consent. A statement of work must expressly
permit the public, non-reconstructive charts planned for the application and
permanent retention of the purchased history.

### MyTraffic

[MyTraffic DataLibrary](https://www.mytraffic.io/en/products/data-library)
describes annual vehicle-traffic measurement on defined European road segments.
A [French customer case](https://www.mytraffic.io/en/clients/driveco) says the
provider supplied road-traffic data for all road segments in France. This is
useful evidence for a sample request, but it is not a coverage guarantee for the
short Avenue de la Gare corridor.

MyTraffic describes connected-vehicle and public inputs, normalization, and
extrapolation. It does not publish the first vehicle-traffic year, per-segment
sample size, penetration rate, confidence interval, or validation error. Its
broader database history since 2016 does not prove a comparable vehicle series
since 2016.

[Public pricing](https://www.mytraffic.io/en/pricing) starts at EUR 249 per month
for Gini Tiny with five exports, but the page does not establish that this plan
includes historical road-segment traffic. The current
[terms](https://www.mytraffic.io/fr/terms-and-conditions) restrict publication,
distribution, third-party platform use, and retention of substantial exports
unless a written agreement says otherwise. Price and product entitlement must be
confirmed together with public-display rights.

### PTV Validate France

[PTV Validate](https://www.ptvgroup.com/en/products/validate) is a conditional
modeled-volume candidate. Its France material describes link-level car volumes
from 2019, calibrated with public counts and structural or navigation data. It
can support a longitudinal claim only if PTV supplies archived model vintages
that use comparable methods and covers Avenue de la Gare. Comparing current
releases without that evidence could measure model revision rather than traffic
change. Pricing, exports, quality metadata, archive availability, and display
rights require a quote.

## Historical speed and travel-time corroborators

### TomTom

[TomTom Traffic Stats](https://docs.tomtom.com/traffic-stats/documentation/product-information/introduction)
offers historical floating-car data from navigation systems, apps, and fleets.
It reports speed, travel time, sample size, route analysis, and area analysis.
Its [market coverage](https://docs.tomtom.com/traffic-stats/documentation/product-information/market-coverage)
lists France from 2008, so it could test seasonal and year-to-year congestion
patterns in Biarritz. It is commercial and does not turn probe samples into
measured vehicle counts.

Route Analysis is the strongest self-service coverage test. It can force a route
through via points, return directional segment shapes and sample sizes, and use
manual job acceptance. Separate jobs should test the full Verdun corridor and
the short Avenue de la Gare corridor before any paid report is accepted. Older
archive coverage can be thinner than recent coverage, so a national start date
does not prove a comparable local series.

TomTom's separate Historical Traffic Volumes product models AADT and hourly
volumes, but its current
[coverage list](https://docs.tomtom.com/historical-traffic-volumes/documentation/product-information/market-coverage)
does not include France. Traffic Stats is the better TomTom research candidate
for Biarritz, subject to operator-approved access and a separate licence review.
The newer Traffic Stats
[Traffic Volume endpoint](https://docs.tomtom.com/traffic-stats/documentation/api/traffic-volume)
also excludes France as of the search date. Its European coverage begins in
2024 and lists Belgium, the Netherlands, Norway, Sweden, and the United Kingdom.
It must not be purchased for Biarritz unless TomTom formally adds France.

### INRIX

[INRIX Roadway Analytics](https://docs.inrix.com/ra/datanetworkandxdtraffic/)
archives minute-level historical speed from 1 January 2014. Its XD segments can
cover arterials, city streets, and secondary roads. Available metrics include
speed, travel time, historical average speed, congestion, and reliability. The
product is a good second speed candidate if a vendor sample proves both streets,
but it does not provide total vehicle counts. Pricing and public-display rights
are not published.

### HERE

[HERE Traffic Analytics](https://docs.here.com/traffic-analytics/docs/readme)
offers commercial historical speed and probe-count data in France. The current
documentation limits history to five years and says the earliest available data
is 2021. It cannot fill the 2011-2020 audit period and its probe counts are not
road-counter vehicle totals.

HERE exposes sample count, standard deviation, gap-fill status, and confidence,
which makes its quality semantics clearer than many commercial pages. Its short
archive makes it a lower priority than TomTom or INRIX for the requested long
trend unless its exact-street coverage is materially better.

### Excluded commercial products

- Google Roads Management Insights starts after onboarding and cannot reconstruct
  historical years.
- Geotab Altitude's official coverage is the United States and Canada, not
  France.
- INRIX announced France as future coverage for Volume Profiles 3.0, but no
  official source found on the search date confirms a French launch.
- Ordinary Google Routes, Roads, TrafficLayer, and Waze products do not expose a
  historical street-volume archive.

## Unpublished public-record candidates

### 2015 STACBA and AUDAP surveys

The strongest no-purchase route is the archived 2015 urban mobility survey held
by the successor Syndicat des Mobilités Pays Basque-Adour, AUDAP, and possibly
the City of Biarritz. The
[survey launch note](https://www.audap.org/fileadmin/2-Ressources/mediatheque/etudes/fichiers/tra_lancementenquete_mobestivale_20150502.jpg.pdf)
and [results](https://www.audap.org/fileadmin/2-Ressources/mediatheque/etudes/fichiers/tra_enquetemobiliteestivale_20160630.pdf)
describe 165 count stations and separate August and October 2015 work. The
campaign included automatic motor-traffic and cycle counts, origin-destination
surveys, and travel-time measurements.

The public summary does not name Avenue de Verdun or Avenue de la Gare. The
request must ask for station maps, identifiers, coordinates, street sections,
directions, dates, time intervals, vehicle classes, raw counts, validated totals,
and QA notes from the "enquêtes circulation du PDU" and "Mobilités estivales"
files. This is currently the best chance of recovering a measured high-season
and off-season baseline for both streets.

### Strategic-noise model inputs

The [Biarritz 2024 noise plan](https://www.biarritz.fr/fileadmin/mediatheque/PDF/ADMIN-2024/PPE_2024_Biarritz.pdf)
explicitly includes Avenue de Verdun and Avenue de la Marne among the municipal
roads carrying more than 3 million vehicles per year, equivalent to more than
about 8,200 vehicles per day. It refers to updated traffic, speed, and
road-surface assumptions for the five-year map cycles. Avenue de la Gare is not
in the published fourth-cycle road list. This establishes a threshold for
Verdun and Marne, not an exact count or a trend: the maps publish acoustic zones
rather than the traffic-input table.

Biarritz and DDTM 64 should be asked for the finalized input tables and GIS
network, including segment IDs, source year, measured or estimated status, TMJA,
light and heavy vehicle shares, day/evening/night split, speed, and the original
source record. The request should cover every Biarritz road and every available
noise-map cycle, while identifying Verdun, Marne, and Gare as priority
corridors. This route is particularly promising for Verdun and Marne but cannot
by itself satisfy the mandatory Verdun/Gare comparison.

### 2019-2020 BAB entry-point traffic study

The [Biarritz municipal council record of 25 September 2019](https://www.biarritz.fr/fileadmin/user_upload/biarritz/Ville/telechargements/Admin/COMPTE_RENDU2509.pdf)
approved participation in the SMPBA study *Etude de circulation des portes
d'entrée de l'agglomération du B.A.B*. Phase 1 was intended to improve the
picture of traffic organization, distribution, and volumes around Biarritz,
Anglet, and Bayonne entry points. The budget separately allowed EUR 30,000
before tax for complementary counts. The named partners included SMPBA,
Biarritz, Anglet, Bayonne, CD64, DDTM 64, DREAL, and DGITM.

The Biarritz scenario work emphasized the A63 Barroilhet exit and the La
Négresse rail crossing, so the document does not prove that either mandatory
street was counted. It does prove that a commissioned study, count campaign,
station inventory, model inputs, and deliverables may be held by public bodies.
The already-submitted CAPB and Biarritz requests should be followed up, if
needed, by naming this study and asking for its native count files, station map,
technical report, appendices, model network, procurement deliverables, and
reuse terms.

### Access route

[CADA guidance](https://www.cada.fr/index.php/particulier/les-modalites-de-communication)
says a written request should identify existing documents precisely. The
administration has one month to answer; silence then counts as an implicit
refusal that may be referred to CADA. Existing digital documents sent by email
are free. The request should seek existing native files and procurement
deliverables, not ask the authority to perform a new analysis.

## New measured baseline

A simultaneous commissioned count on both avenues can create a defensible 2026
baseline and future series. [ALYCE](https://www.alyce.fr/prestations/comptages-routiers/)
documents tube, camera, loop, and radar counts with direction, vehicle class,
speed, and Excel or platform delivery. [PCR](https://www.comptageroutier.com/)
offers comparable nationwide services. Both price by quote.

The minimum specification is seven continuous days on fixed reusable sections,
with direction, hourly totals, light and heavy vehicle classes, speed, raw
interval data, QA, and unrestricted project reuse rights. One ordinary
off-season week and one comparable summer week should be repeated annually.
Physical counts cannot reconstruct old years, so this work complements rather
than replaces the archive and commercial search.

### Waze

[Waze for Cities](https://www.waze.com/fr/wazeforcities/) is free, exposes live
traffic and several years of historical congestion, incident, and slowdown
data to approved public traffic or infrastructure authorities, and supports
analysis in Google Cloud. Filigramme is not an eligible public authority merely
because it is building this POC, and the data describes congestion, incidents,
and speed-associated slowdowns rather than total road-counter volumes. The
public [Waze partner feed](https://developers.google.com/waze/data-feed/overview)
is for approved partners to send incidents and closures to Waze; it is not a
public historical count export. No downloadable Waze count dataset for Biarritz
was found. CAPB, SMPBA, or the City could nevertheless be asked whether it is
already a Waze for Cities partner and whether an existing, lawfully shareable
analysis covers the priority corridors.

### Cerema AVATAR

[Cerema AVATAR](https://www.data.gouv.fr/datasets/avatar-plate-forme-publique-des-donnees-de-trafic-des-gestionnaires-routiers)
collects manager-supplied count-station data and offers charting, downloads,
and an authenticated API. Its catalogue metadata listed 11 contributing road
managers and did not specify a licence on 2026-08-30. A dated inspection of the
public AVATAR map, centered on Biarritz and its immediate surroundings, showed
no count points. A Biarritz bounding-box WFS request also required
authentication. Creating an Orion account would not establish local coverage,
so AVATAR is retained as a source to recheck rather than an immediate signup.

Cerema's separate
[directory of traffic open-data portals](https://trafic-routier.data.cerema.fr/acces-aux-donnees-de-trafic-routier-open-data-r25.html)
did not list Biarritz, CAPB, SMPBA, or Département 64 on the same date.

## Other French public-data findings

The CD64 portal also publishes
[monthly road-count summaries since 2021](https://data.le64.fr/explore/dataset/bilan-des-comptages-routiers-mensuels-depuis-2021/).
Its records include one Biarritz RD810 station for months from January 2021
through April 2022. The catalogue does not state a licence, and the exposed
aggregates do not establish the valid-day denominator needed for annual traffic
normalization. This source stays local and supplementary pending licence and
schema clarification. It may later help examine seasonality, but Phase 1 does
not interpolate or derive annual observations from it.

A dated search also checked data.gouv.fr, transport.data.gouv.fr, ORT/SIGENA,
Cerema, CD64, CAPB/ZABAL, and Ville de Biarritz results. The national live
non-conceded-road feed provides current flow and speed data but did not establish
a usable Biarritz station in the published registry. A CAPB tourism mobility
study refers to road-count posts and mobile data, but the search found no
downloadable record-level traffic dataset behind it. These are negative search
results, not proof that unpublished or restricted data does not exist.

[HERE Traffic Analytics](https://docs.here.com/traffic-analytics/docs/readme)
and the live HERE Traffic API were rechecked on 2026-08-30. France is covered,
and Traffic Analytics can return historical speed observations and probe sample
counts from 2021 onward. Probe count is the number of contributing observations,
not an estimate of all vehicles using the street. Access is commercial and
requires a licensed organization. HERE therefore remains a possible short-term
congestion corroborator, not a solution to the required historical volume
comparison.

## Current source choice

CD64 annual counts enter Phase 1 because they are official, machine-readable,
open-licensed, and directly relevant to Biarritz. Google Routes, Google Roads,
TrafficLayer, Waze, TomTom, and HERE do not enter the measured-count pipeline.
The DREAL 2023 linear dataset is also excluded: its regional road segments do
not establish exact-street evidence for the product's comparison, and its
record-level measured-versus-estimated quality is unspecified.
The mandatory two-street goal changes the acquisition priority. Existing 2015
public survey files, the 2019-2020 BAB entry-point study deliverables, and the
noise-model input tables are the first request. Michelin and MyTraffic are the first
commercial sample requests for passage or modeled-volume history. TomTom and
INRIX are separate historical speed corroborators. Google Roads Management
Insights is prospective only.

Operator-approved sample and quote requests were submitted to Michelin and
MyTraffic through their official contact forms on 2026-08-29. No trial or
purchase has been started. Administrative-document requests were submitted to
Communauté Pays Basque and Ville de Biarritz on 2026-08-30. Those requests cover
existing Biarritz traffic-count evidence from 2011 through 2024 and preserve
Avenue de Verdun and Avenue de la Gare as the minimum priority.

The total external data and service budget for the POC is EUR 100 including
VAT. No commercial source should influence the Phase 1 MVP recommendation until
the project verifies exact-street coverage, historical comparability, cost,
terms, permanent retention, and public derived-chart rights. A quote above the
budget cannot proceed.
