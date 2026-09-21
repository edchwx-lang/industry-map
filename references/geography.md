# V1.4 geography and rendering

`mapScope` is `world`, `china-province`, or `regional`. Prefer explicit scope from the user's requested administrative level. Recognizable country/province identities retain backward compatibility; conflicting country scope is blocked.

World: China includes Taiwan geometry; no independent Taiwan label or bubble. Country-level records require an explicit `regionGroups` decision before rendering. Provincial China: keep Taiwan geometry, the label 台湾省 and its provincial metric; do not aggregate provincial scores into China.

Aggregation examples:

```json
{"metricKind":"count","regionGroups":[{"target":"China","members":["China","Taiwan"],"valuesAreDisjoint":true}]}
```

```json
{"metricKind":"count","regionGroups":[{"target":"China","members":["China","Taiwan"],"aggregation":"target-includes-members"}]}
```

The second retains China's existing value and still retains both source geometries and original audit rows. Do not choose between these without knowing the input scope. `metricKind: score|rate|index` forbids summation; obtain a valid aggregate instead. Region grouping cannot manufacture missing observations.

Projection presets: world `equirectangular`; China provincial `china-albers` (central meridian105°, standard parallels25°/47°, origin35°); regional `mercator`. Implemented by bundled d3-geo, no runtime downloads. `projection: {"name":"..."}` can explicitly select a supported preset. Input coordinates are geographic longitude/latitude degrees, not projected metres. Projection distortion and screen stretching are different: after projection the exporter checks equal horizontal/vertical scale within1e-9. Fitting uses contain, never fill; source geometry is unchanged. References: https://d3js.org/d3-geo/conic and https://d3js.org/d3-geo/cylindrical .

National provincial export automatically loads hash-verified `boundary/china/province/tianditu-lines.geojson` and its metadata. It preserves 8 original MultiLineString features /31 segments from the same original province GeoJSON, including its South China Sea dashed linework. An explicit `boundaryLinePath` may point to a supplied geographic LineString/MultiLineString FeatureCollection; never generate substitute line coordinates. Line styles are independent of province metric fills. Source-file hashes establish local provenance, not official map certification.

Shenzhen10-region asset uses CGCS2000 geographic source geometry. The12-digit `adcode` is a boundary join identifier retained verbatim, not a claim that the supplied Dapeng code is a standard6-digit administrative code. For a6-digit Excel key, use exact unique region-name matching or explicit aliases; never truncate the Dapeng identifier. Re-simulating an example after changing region boundaries is distinct from allocating an old region total.

Labels use opaque dark-gray #161B22 bold text on transparent backgrounds, without outlines or shadows. World maps in both modes show only matched countries above the actual lowest class (five classes means four higher classes); unmatched countries have no labels. This affects labels only, not geometry, values, classification or audit. Provincial/regional maps keep all names. Screen-space rectangles are moved with leader lines to avoid collisions; export stops if eligible labels cannot fit. Inspect readability on saturated fills and leader association before approval.
