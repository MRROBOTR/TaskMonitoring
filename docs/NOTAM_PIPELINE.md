# NOTAM pipeline

```
retrieval → raw preservation → validation → parsing/normalisation → identity & revision
→ validity evaluation → geographic interpretation → persistence → map/list → inspection
```

## 1. Retrieval

| Path | Status |
|---|---|
| Manual import (paste / `.txt` file), `providers/notams/manualImport.ts` | **Implemented, tested** |
| ATLAS backend client, `providers/notams/backend.ts` | Client implemented and validator tested. **No server exists**, so BLOCKED. |
| FAA NMS-API, DHMİ, EAD | **BLOCKED**: see DATA_SOURCES.md |

Backend contract (ATLAS-defined, for a future server holding provider credentials):

```
GET {baseUrl}/v1/notams?locations=LTFM,LTAA
200 { "source": string, "retrievedAt": ISO-8601,
      "items": [ { "providerId": string, "icao": "<ICAO-format NOTAM text>" } ] }
```

## 2. Raw preservation

`Notam.raw` always holds the exact input message, including unparsable text
(`parseStatus: failed`). It is persisted in `notams.raw` and shown on the detail screen.

## 3–4. Parsing and normalisation (`domain/notam/parser.ts`)

- Header: `A1234/26 NOTAMN|R|C [ref]`. Gives series, number, year, type and reference.
- Items Q, A–G are split in canonical order. Item E runs up to `F)`/`G)`.
- Q line: FIR, 5-letter code (subject/condition), traffic, purpose, scope, lower/upper FL,
  centre (ddmmNdddmmE) and radius (NM).
- B/C: `YYMMDDhhmm` UTC, validated strictly (e.g. 31 Feb is rejected, not rolled over).
  `PERM` and `EST` are kept as flags.
- F/G: vertical limits with their reference kept (SFC, MSL, AGL, FL, UNL, UNKNOWN).
  MSL is never assumed.
- Unknown values stay `null`. Every problem adds a `qualityFlag`.
- `parseStatus`: `parsed` | `partial` (soft issues) | `needs-review` (invalid dates,
  missing B, end before start, missing reference) | `failed` (not a NOTAM). Nothing
  is discarded.

## 5. Identity and revision

- Identity key: `<Q-FIR or first A location>:<series><number>/<yy>`. NOTAM numbers are
  only unique per issuing office, so the FIR is part of the key. Known limitation:
  multi-FIR (`LTXX`-style) notices use the Q-line FIR as given.
- Internal id: `<sourceId>:<identity>`. Re-importing the same message is idempotent
  (counted as `unchanged`). A changed text under the same id is a revision (`updated`).
- NOTAMR/NOTAMC relations are resolved at read time by `buildSupersessionIndex` within
  the same identity context. A cancellation wins over a replacement.

## 6. Validity evaluation (`domain/notam/lifecycle.ts`)

State is evaluated at read time against a clock that ticks every minute:

| Condition | State |
|---|---|
| A NOTAMR / NOTAMC references it **and its own B) has been reached** | `replaced` / `cancelled` |
| …but the superseding message's B) is still in the future | evaluated normally, plus a reason "… itibarıyla … ile değiştirilecek / iptal edilecek" (never hidden early) |
| B unknown | `unknown` |
| now < B | `future` |
| C = PERM | `active` (until cancelled/replaced) |
| C unknown | `unknown` |
| now > C, C has EST | `unknown`, with the reason shown (ICAO requires a follow-up NOTAM) |
| now > C | `expired` |
| otherwise | `active` |

Item D is kept verbatim. Only `H24` and `DAILY hhmm-hhmm` are evaluated (as "inside /
outside schedule now"). Anything else is flagged "Program (D) yorumlanmadı". The
schedule never changes the validity state itself.

## 7. Geographic interpretation (`domain/notam/geometry.ts`)

1. **Item E polygon.** Exactly one coordinate chain (≥3 points, joined by `-`), with an
   area keyword present and no circle. The ring is closed if needed and validated.
   Confidence: `confirmed`.
2. **Item E circle.** `RADIUS n NM CENTRED ON <coord>` (or `CIRCLE … <coord> … RADIUS n NM`)
   with exactly one match. Confidence: `confirmed`.
3. **Q line.** Centre/radius turned into a geodesic circle. Confidence: `approximate`,
   because the ICAO Q radius is indicative and rounded up.
4. **No geometry** in these cases: no Q line, Q radius 999 (whole FIR), radius > 500 NM,
   multiple areas or ambiguous circles in E. Such notices appear only in the list.

ATLAS never uses the aerodrome position as NOTAM geometry, and never treats the A)
aerodrome as the only affected place. All geometry is GeoJSON `[lon, lat]` with
counter-clockwise exterior rings; tests check ordering, closure and ring orientation.

## 8. Persistence

`notams` (all fields, raw text, flags as JSON) and `notam_geometries` (GeoJSON +
confidence + origin). Upserts run inside one transaction. Expired records are only
deleted when the user asks (Data Management → purge > 30 days; PERM/EST are kept).

## 9. Rendering

- Map: `notam-areas` source. Fill, plus a **solid red** outline for confirmed geometry
  and a **dashed orange** outline for approximate. `notam-points` for point notices.
  Cancelled/replaced/expired notices are hidden unless the user opts in.
- The number of unmappable notices is shown on the map banner. They're still listed.
- List: filters by lifecycle state, Q-code category, FIR/aerodrome, free text and
  "needs review". Each row carries badges for origin (MANUEL / SİMÜLE), geometry
  confidence and parse status.
- Detail: original text, every structured field, lifecycle reasons, geometry and
  confidence, provenance, and quality flags.

## 10. Freshness

`notamDatasetFreshness`: synthetic data → `synthetic`; manual imports → `manual-import`
(never `live`). Provider data uses the 30 min (live) and 6 h (stale) thresholds, with a
failed newer attempt shown as `update-failed`. No provider is configured today, so live
status cannot occur.

## Test coverage

`parser.test.ts`, `lifecycle.test.ts`, `database.test.ts`, `sync.test.ts`,
`layers.test.ts` and `screens.test.tsx`, all using **synthetic** fixtures
(`src/test/fixtures/notams.synthetic.ts`). These use the non-existent `XX` location
prefix, so they can't be mistaken for real NOTAMs. No real NOTAM feed was available
for testing.
