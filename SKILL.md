---
name: industry-map
description: Use when an administrative-region industry map, choropleth, proportional-bubble map, protected regional Excel template, or audited GeoJSON-plus-Excel visualization is requested without QGIS.
---

# Industry map

当前版本为 V1.4（`1.4.0`）。同一核心包兼容 Codex、Claude Code 与 WorkBuddy，并支持 Windows、macOS 和 Linux。执行 `node dist/industry-map.mjs version` 可核对实际安装版本；安装、运行环境与平台差异见 [references/compatibility.md](references/compatibility.md)，版本管理规则见 [references/versioning.md](references/versioning.md)。

将一个 polygon GeoJSON 与一张 Excel 指标表转换为可审计的出版级产业地图。只使用输入几何与数值；不得调用 QGIS、地图生成模型、在线底图或网络资源来补画边界和数据。

## 路由

- 开始前读取 [references/input-contract.md](references/input-contract.md)，用于检查输入、选择表格、严格连接、编写 resolved config 及核验工件。
- 用户没有 Excel、要求一张地区填写表或使用受保护模板时，读取 [references/template-workbook.md](references/template-workbook.md)。
- 用户要求使用内置边界、查询资产或抓取乡镇边界时，读取 [references/boundary-assets.md](references/boundary-assets.md)。
- 选定模式后读取 [references/style-spec.md](references/style-spec.md)，只加载对应的 `choropleth` 或 `bubble` 章节；做最终视觉复核时再读其中的共同版式要求。

## 工作流

全球国家级地图按用户确认口径将台湾几何纳入中国，不单独标注或绘制气泡；全国省级地图完整保留台湾省，标注“台湾省”，按省级指标着色或绘制气泡。不得把国家级合并规则套到省级数据。全球 `regionGroups` 显式确认数值口径：互不包含的数量可求和；中国总数已包含成员时保留目标值；评分、比率和指数不得相加。详见 [references/geography.md](references/geography.md)。气泡图最低档默认不绘制圆，仅保留灰色底图与名称；最低档仍参与分级和审计。

地图选定投影后只允许等比例缩放和平移。图例独立布局，禁止通过横向或纵向拉伸填满画布。全国地图保留原始南海岛礁与境界线覆盖层；缺少来源时停止并索取，不凭空补画。深圳使用用户提供的10分区专用资产，保留大鹏新区完整连接代码，不截断或按名称猜造边界。

1. 有用户 Excel 时，只读检查 `.geojson` 与 `.xlsx`，先运行 `inspect`。根据 `requiredUserInputs` 补齐图名、单位、表格、指标及连接信息；不得凭文件名猜。没有 Excel 时，按用户所说地区生成受保护模板，等待用户只填写标题、指标名称、可选单位及指标值。
2. 数据检查完成后执行 V1.2 展示门禁。一次性询问用户尚未明确的三项：①图表类型：分级颜色图（推荐）、分级气泡图或两者都做；②颜色：橙色、蓝色（推荐）或红蓝白（B版重排，配置编号 mixed-c）；③分级：默认 5 级自动分级（推荐）、3–7 级自动分级或自定义阈值。用户请求中已明确的选择不重复询问，未明确的选择不得静默采用默认值。颜色与图表类型可自由组合。
3. 用户选择“两者都做”时，为 `choropleth` 与 `bubble` 建立独立 config 和输出目录；默认共用用户确认的颜色、级数与分级方案，只有用户明确要求时才分别设置。
4. 根据 inspection report 解决 sheet/table、字段和连接。行政代码存在时先精确代码匹配，再精确规范化名称匹配。模糊匹配只能作为建议；别名必须显式写出 Excel 名、GeoJSON 名与展示名。任何歧义、重复 key 或非空未匹配行都必须在渲染前停止。
5. 普通 Excel 的空指标仍为阻断项，不得变成 0。只有本技能生成且通过版本、身份和边界哈希校验的模板，空白指标才按 0 处理，并写入 `defaulted_zero` 审计来源。
6. 用本技能的 Node CLI 渲染。目标已存在时停止；只有用户明确授权覆盖时才传 `--force`。
7. 默认只显示行政区名称，不显示数值。全球地图的两种模式只标注高于最低档的国家：5档时保留较高4档，其他档数仍只隐藏最低档；未匹配国家不标注。几何、数据、着色、统计与审计不删除。全国及地方地图仍标注全部行政区。标签采用无底色、深灰加粗字，无描边或阴影；保留避让引导线。只有用户明确要求“显示数据”时，才配置 `labels.showValues: true`；该选项不取消全球最低档隐藏规则。
8. 检查六项工件、报告中的连接覆盖率/分类来源/区间语义/展示元数据/警告/哈希、audit workbook 的合计与别名，以及 PNG 尺寸、SVG 文本/路径和 PDF。必须核对 `geometryVerification.isotropic`、横纵缩放系数、标签数量/重叠数和全国境界线段数。最后实际查看 PNG 原尺寸及缩小预览；数据文件哈希相同不代表渲染比例正确。视觉参考不得替代源几何或数据。

从技能目录运行：

```sh
node dist/industry-map.mjs inspect --geojson <input.geojson> --excel <metrics.xlsx> --json <inspection.json>
node dist/industry-map.mjs template create --place <地区名或行政代码> --output <template.xlsx>
node dist/industry-map.mjs render --config <map-config.resolved.json>
```

若本地浏览器运行时不可用，先按兼容性文档设置 `INDUSTRY_MAP_BROWSER`。输入无效或报告出现阻断项时，保留诊断并停止；不要换用 QGIS、Python 地理栈或生成式图片作为降级方案。
