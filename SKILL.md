---
name: industry-map
description: Use when an administrative-region industry map, choropleth, proportional-bubble map, protected regional Excel template, or audited GeoJSON-plus-Excel visualization is requested without QGIS.
---

# Industry map

当前稳定版本为 V1.3.1（`1.3.1`）。同一核心包兼容 Codex、Claude Code 与 WorkBuddy，并支持 Windows、macOS 和 Linux。执行 `node dist/industry-map.mjs version` 可核对实际安装版本；安装、运行环境与平台差异见 [references/compatibility.md](references/compatibility.md)，版本管理规则见 [references/versioning.md](references/versioning.md)。

将一个 polygon GeoJSON 与一张 Excel 指标表转换为可审计的出版级产业地图。只使用输入几何与数值；不得调用 QGIS、地图生成模型、在线底图或网络资源来补画边界和数据。

## 路由

- 开始前读取 [references/input-contract.md](references/input-contract.md)，用于检查输入、选择表格、严格连接、编写 resolved config 及核验工件。
- 用户没有 Excel、要求一张地区填写表或使用受保护模板时，读取 [references/template-workbook.md](references/template-workbook.md)。
- 用户要求使用内置边界、查询资产或抓取乡镇边界时，读取 [references/boundary-assets.md](references/boundary-assets.md)。
- 选定模式后读取 [references/style-spec.md](references/style-spec.md)，只加载对应的 `choropleth` 或 `bubble` 章节；做最终视觉复核时再读其中的共同版式要求。

## 工作流

全球国家级示例按用户确认的中国口径将台湾并入中国，不单独标注或绘制气泡；保留全部原始几何。合并数值前必须确认两条数据互不包含，避免重复计算。通过 `regionGroups` 显式记录成员与目标，审计保留原始行。气泡图最低档默认不绘制圆，仅保留灰色底图与名称；最低档仍参与分级和审计。

1. 有用户 Excel 时，只读检查 `.geojson` 与 `.xlsx`，先运行 `inspect`。根据 `requiredUserInputs` 补齐图名、单位、表格、指标及连接信息；不得凭文件名猜。没有 Excel 时，按用户所说地区生成受保护模板，等待用户只填写标题、指标名称、可选单位及指标值。
2. 数据检查完成后执行 V1.2 展示门禁。一次性询问用户尚未明确的三项：①图表类型：分级设色图（推荐）、比例气泡图或两者都做；②颜色：橙色、蓝色（推荐）或红蓝白（B版重排，配置编号 mixed-c）；③分级：默认 5 级自动分级（推荐）、3–7 级自动分级或自定义阈值。用户请求中已明确的选择不重复询问，未明确的选择不得静默采用默认值。颜色与图表类型可自由组合。
3. 用户选择“两者都做”时，为 `choropleth` 与 `bubble` 建立独立 config 和输出目录；默认共用用户确认的颜色、级数与分级方案，只有用户明确要求时才分别设置。
4. 根据 inspection report 解决 sheet/table、字段和连接。行政代码存在时先精确代码匹配，再精确规范化名称匹配。模糊匹配只能作为建议；别名必须显式写出 Excel 名、GeoJSON 名与展示名。任何歧义、重复 key 或非空未匹配行都必须在渲染前停止。
5. 普通 Excel 的空指标仍为阻断项，不得变成 0。只有本技能生成且通过版本、身份和边界哈希校验的模板，空白指标才按 0 处理，并写入 `defaulted_zero` 审计来源。
6. 用本技能的 Node CLI 渲染。目标已存在时停止；只有用户明确授权覆盖时才传 `--force`。
7. 两种地图默认只显示全部行政区名称，不显示数值。只有用户明确要求“显示数据”时，才配置 `labels.showValues: true`；未匹配区域始终只显示名称。
8. 检查六项工件、报告中的连接覆盖率/分类来源/区间语义/展示元数据/警告/哈希、audit workbook 的合计与别名，以及 PNG 尺寸、SVG 文本/路径和 PDF。最后实际查看 PNG；视觉参考只用于版式对照，不得替代源几何或数据。

从技能目录运行：

```sh
node dist/industry-map.mjs inspect --geojson <input.geojson> --excel <metrics.xlsx> --json <inspection.json>
node dist/industry-map.mjs template create --place <地区名或行政代码> --output <template.xlsx>
node dist/industry-map.mjs render --config <map-config.resolved.json>
```

若本地浏览器运行时不可用，先按兼容性文档设置 `INDUSTRY_MAP_BROWSER`。输入无效或报告出现阻断项时，保留诊断并停止；不要换用 QGIS、Python 地理栈或生成式图片作为降级方案。
