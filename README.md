# Industry Map · 产业地图

**中文** | [English](README.en.md)

将 **Excel 指标数据 + GeoJSON 行政边界** 转换为可审计的分级设色图与分级气泡图。

**当前版本：V1.3.1** · Codex / Claude Code / WorkBuddy · Windows / macOS / Linux

[下载 V1.3.1](https://github.com/edchwx-lang/industry-map/releases/tag/v1.3.1) · [技能说明](SKILL.md) · [配置文档](references/input-contract.md)

## 示例

全球半导体重点企业分布。以下企业数量为**模拟数据，仅用于展示制图能力，不代表真实企业数量、排名或完整行业统计**。三张图使用同一数据与分级阈值。

### 蓝色 · 分级设色图

![全球半导体重点企业分布：蓝色分级设色图](docs/images/world-blue.png)

### 橙色 · 分级设色图

![全球半导体重点企业分布：橙色分级设色图](docs/images/world-orange.png)

### 红蓝白 · 分级气泡图

![全球半导体重点企业分布：红蓝白分级气泡图](docs/images/world-red-blue-white-bubble.png)

示例采用 `[0,100)`、`[100,200)`、`[200,300)`、`[300,400)`、`400及以上`。最低档不绘制气泡，仅保留灰色底图；较高档依次使用浅蓝、蓝、浅红、红。中国包含台湾：保留全部源几何，取消台湾单独标签和气泡；两条独立模拟数值合并为 760 家，全球模拟合计仍为 3801 家。原始行保留在审计来源中。

## 能做什么

- 两种图表与三种配色自由组合：浅蓝、橙色、红蓝白。
- 默认推荐 5 级，也支持 3–7 级自动分级与用户自定义阈值；区间左闭右开，末档开放。
- 渲染前确认图表类型、颜色、分级；已明确的选择不重复询问。
- 精确代码/名称连接，重复键、歧义和无效数值阻断；不自动猜测匹配。
- 中英文标题和单位、画布居中标题、4K 输出；PNG、SVG、PDF 三种格式。
- 同时输出数据审计 Excel、配置与渲染报告，记录分类、来源和哈希。
- 支持受保护的地区 Excel 填写模板；无需 QGIS 或在线底图。

## 安装

需要 **Node.js 22+** 与本机 **Chrome、Chromium 或 Edge**。发布包已包含 JavaScript 依赖，运行时无需 `npm install`。

1. 从 [V1.3.1 发布页](https://github.com/edchwx-lang/industry-map/releases/tag/v1.3.1) 下载 `industry-map-v1.3.1.zip`。
2. 解压后将完整的 `industry-map` 文件夹放到对应目录：

| Agent | 技能目录 |
| --- | --- |
| Codex | `~/.codex/skills/industry-map` |
| Claude Code | `~/.claude/skills/industry-map` |
| WorkBuddy | `~/.workbuddy/skills/industry-map` |

`~` 表示用户主目录。若已有版本，先移到 skills 目录外备份，避免重复发现。安装后重启或刷新 Agent 的技能列表。

在安装后的 `industry-map` 文件夹运行：

```sh
node dist/industry-map.mjs version
```

应输出 `"version":"1.3.1"`。跨平台路径与浏览器设置见 [兼容性说明](references/compatibility.md)。Windows 已执行实际导出；macOS/Linux 路径有单元测试覆盖，尚未在这两种系统上完成真机导出验收。

## 使用

向 Agent 提供 Excel 和边界文件，例如：

> 使用 industry-map，制作全球半导体重点企业分布。单位为企业数量（家）；分别输出蓝色、橙色分级设色图，以及红蓝白气泡图。使用 5 级，阈值为 0、100、200、300、400。

也可以直接运行 CLI：

```sh
node dist/industry-map.mjs inspect --geojson input.geojson --excel metrics.xlsx --json inspection.json
node dist/industry-map.mjs render --config map-config.json
```

配置示例见 [输入与输出契约](references/input-contract.md)。已有输出默认拒绝覆盖，仅在明确授权后使用 `--force`。区域合并需显式配置并确认数值互不包含，不能将已含台湾的中国总数再次相加。

每次渲染生成：地图 `.png` / `.svg` / `.pdf`、`data-audit.xlsx`、`map-config.resolved.json`、`render-report.json`。

## 开发与打包

```sh
npm ci
npm test
npm run build
npm run package-agents -- --output ../industry-map-packages
```

## V1.3.1 更新

固定新版浅蓝与红蓝白配色；保留橙色。支持中英文版式，最低档气泡隐藏但不丢失审计数据；新增显式区域合并与来源追溯。本页三张图包含这些修订。

## 数据与使用限制

边界来自随包清单记载的来源，详见 [边界 manifest](boundary/manifest.json) 和 [边界说明](references/boundary-assets.md)。保留其非商业使用及上游条款提示；公开仓库不意味着所有边界素材均可无条件商用。示例不是官方地图或统计发布，地区标签密集处可能重叠。第三方软件许可见 [第三方说明](THIRD_PARTY_NOTICES.md)。
