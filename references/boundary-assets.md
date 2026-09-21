# Boundary asset catalog

Use this catalog only when the user wants a built-in administrative boundary or explicitly authorizes township retrieval. Explicit `geojsonPath` remains supported and has highest precedence.

V1.4 adds a dedicated Shenzhen ten-region asset preserving supplied CGCS2000 geometry and full 12-digit join codes, including Dapeng New Area. Resolve by city code `440300`; do not truncate source codes. Standalone CLI: `boundary import-shenzhen --source-base <path-without-extension> --output <new.geojson>`. It validates SHP/SHX/DBF/CPG/PRJ/QMD and refuses overwriting. A boundary asset supplies no enterprise statistics.

Original national linework: `boundary/china/province/tianditu-lines.geojson`, with hash/source metadata alongside it. It contains 8 source line features and 31 line segments, unchanged. Local source identity is verified by hash, not an independent official map certification.

Resolution order: explicit file, bundled Dongguan/Chenghai town asset, bundled Tianditu province/city/county asset, verified external cache, then an explicitly authorized online township fetch. Tianditu is authoritative when bundled China administrative layers overlap other local material.

List and resolve local assets:

```powershell
node dist/industry-map.mjs boundary list
node dist/industry-map.mjs boundary resolve --level county
node dist/industry-map.mjs boundary resolve --level town --parent-adcode 441900
node dist/industry-map.mjs boundary fetch-town --parent-adcode 440100 --province 广东省 --city 广州市 --county 市辖区
```

In a resolved render config, use exactly one of `geojsonPath` or:

```json
{ "boundary": { "level": "town", "parentAdcode": "441900" } }
```

Bundled and cached files are SHA-256 verified before use. The default fetched cache is outside the installed skill at `%USERPROFILE%\.codex\cache\industry-map\boundary`; override it with `INDUSTRY_MAP_CACHE_DIR`. The approved township provider and its data are restricted to non-commercial use. Never fetch implicitly during inspection or rendering without explicit authorization. An explicit fetch requires the six-digit parent code plus exact province, city, and county names; the provider town list and every returned geometry must agree on code and name before an atomic cache commit.
