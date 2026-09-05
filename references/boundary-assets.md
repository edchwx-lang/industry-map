# Boundary asset catalog

Use this catalog only when the user wants a built-in administrative boundary or explicitly authorizes township retrieval. Explicit `geojsonPath` remains supported and has highest precedence.

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
