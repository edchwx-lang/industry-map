# Input, config, and output contract

## 1. Inspect inputs

V1.4: `mapScope` accepts `world`, `china-province`, or `regional`; `projection.name` accepts `equirectangular`, `china-albers`, or `mercator`. `metricKind` identifies `count`, `score`, `rate`, or `index`; non-additive metrics cannot use summed region groups. `regionGroups[].aggregation` supports confirmed `sum-disjoint` or `target-includes-members` (retain target value). `boundaryLinePath` optionally supplies original LineString/MultiLineString overlays; national maps otherwise retain bundled source linework. See [geography.md](geography.md).

输入为一个 `FeatureCollection` GeoJSON 和一个 `.xlsx`。GeoJSON 可以是显式路径，也可以按 [boundary-assets.md](boundary-assets.md) 从内置目录解析：

- 每个 feature 必须是 `Polygon` 或 `MultiPolygon`；行政层级不限。
- Excel 每次渲染选择一个 region 列和一个数值 metric。标题、空行、合并单元格和合计行可以存在，但必须用 inspection report 明确选择 sheet、1-based `headerRow` 与 inclusive `dataRange`。
- 如果 inspection report 给出多个可用表、多个 region/metric 候选、缺列或不支持的 geometry，先解决歧义，不渲染。

命令：

```powershell
node dist/industry-map.mjs inspect --geojson <input.geojson> --excel <metrics.xlsx> --json <inspection.json>
```

`--json` 不得指向任何输入文件。检查报告的 `geojson.featureCount`、property candidates、geometry types、workbook tables、metric candidates 和 warnings。

## 2. Resolve the join

resolved config 中：

- `geoKey.name`、`rowKey.name` 必填；相应 `code` 仅在源文件确有代码列时填写。
- 连接顺序固定为 exact code，再 exact normalized name。规范化只做 Unicode NFKC 与首尾空白清理。
- 模糊结果不得自动接受。显式别名格式为 `{ "excel": "表中名", "geo": "边界名", "display": "图上名" }`。
- duplicate row/feature key、非空 unmatched Excel row、非有限数值均阻断。GeoJSON 未匹配 feature 保留为 null/灰色并在报告中警告；如果用户要求完整覆盖，则先补齐映射。

## 3. Resolved config

显式合并示例：`"regionGroups": [{"target":"China","members":["China","Taiwan"],"valuesAreDisjoint":true}]`。成员须精确匹配且数值已确认互不包含；保留全部 Polygon/MultiPolygon 坐标，求和后只使用目标名称，原始行保存在审计 `sourceRows`。源 Excel 不修改；报告 rowCount 是源行数，featureCount/matchedCount 是合并后区域数。不得对已包含台湾的中国总数再次相加。

路径相对 config 文件解析，也可使用绝对路径。最小结构：

```json
{
  "mode": "choropleth",
  "paletteId": "blue-a",
  "classes": 5,
  "classification": { "method": "auto", "source": "user-confirmed" },
  "geojsonPath": "input.geojson",
  "excelPath": "metrics.xlsx",
  "outputDir": "output/choropleth",
  "slug": "industry-map",
  "width": 3840,
  "height": 2160,
  "sheet": "指标表",
  "headerRow": 2,
  "dataRange": { "startRow": 3, "endRow": 34 },
  "geoKey": { "code": "adcode", "name": "name" },
  "rowKey": { "code": "行政区划代码", "name": "区域" },
  "metricKey": "企业数",
  "aliases": [],
  "title": "产业地图",
  "subtitle": "企业数量",
  "unit": "家",
  "source": "来源：用户提供数据"
}
```

`mode`、`paletteId`、`classes`、`classification.method` 和 `classification.source` 必须来自用户已确认的展示门禁，不得由渲染器静默补齐。标题必须由用户提供；指标名通常取用户确认的数值列名；单位允许用户确认留空。副标题、来源和注释默认不写入图中，只有用户明确提供才配置。没有代码列时省略对应 `code`，不要制造占位字段。分类和气泡标签字段见 [style-spec.md](style-spec.md)。不得在 config 中加入 `force`；覆盖授权只能通过 CLI `--force` 表达。

无需在config中写`labels`。全球两种模式只显示实际最低档之上的国家名称，最低档及未匹配国家不标注；全国和地方仍标注全部行政区。只有用户明确要求显示具体数据时启用`labels.showValues: true`，可见标签显示“名称 + 换行 + 数值 单位”，不取消全球筛选规则。全国/地方可见的有限0值必须显示，未匹配区域只显示名称，不伪造为0。全球报告`presentation.labels`记录`visibility`、`hiddenLowestClassCount`和`hiddenUnmatchedCount`，不改变完整数据审计。

受保护模板使用更短的 config，标题、指标名、单位必须从模板读取，不得在 config 重复覆盖：

```json
{
  "mode": "choropleth",
  "templatePath": "东莞市产业地图模板.xlsx",
  "outputDir": "output/choropleth",
  "slug": "dongguan-industry-map",
  "classes": 5,
  "classification": { "method": "auto", "source": "user-confirmed" },
  "paletteId": "blue-a"
}
```

使用内置目录时，以 `"boundary": { "level": "county" }` 替换 `geojsonPath`；乡镇还需 `parentAdcode`。两者必须且只能存在一个。

自定义分级写为 `"classification": { "method": "custom", "source": "user-defined", "thresholds": [0, 5, 15, 25, 35] }`，且 `classes` 必须等于阈值数量。V1.2 迁移要求：旧 config 若缺少上述任一显式展示字段，CLI 会在创建输出前停止并指出缺失字段；补齐字段后再渲染。

## 4. Render and verify

```powershell
node dist/industry-map.mjs render --config <map-config.resolved.json>
```

默认画布为 3840×2160。每个输出目录必须有：

- `<slug>.png`、`<slug>.svg`、`<slug>.pdf`
- `data-audit.xlsx`
- `map-config.resolved.json`
- `render-report.json`

验证 `render-report.json` 的 source hashes、feature/row/matched counts、coverage、class distribution、`presentation.labels`、`presentation.legend`、renderer versions、warnings 和 artifact metadata。验证 audit 的 `summary`、`matched`、`unmatched`、`duplicates`、`aliases` sheets，并独立复算 metric 合计。输出绝不能覆盖输入；已有输出只有在用户明确授权后才可用 CLI `--force` 覆盖。

浏览器可执行文件只通过显式 `INDUSTRY_MAP_BROWSER`、当前平台的已知安装路径或 `PATH` 做文件系统解析，不应通过启动浏览器来探测。Windows、macOS、Linux 的具体规则与缓存位置见 [compatibility.md](compatibility.md)。每次实际导出必须使用新的临时 `user-data-dir`，不得读取或初始化用户默认浏览器 profile；完成或失败后都要清理临时 profile。
