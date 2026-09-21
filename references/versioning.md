# Versioning

`industry-map` 使用语义版本。当前源码版本为 V1.4（`1.4.0`），产品线为 V1；全局安装在验收后另行同步：

V1.4 新增明确投影与等比例渲染校验、原始全国境界线图层、深圳十区县边界及 Node-only Shapefile 导入器。标注使用不透明深灰、无描边阴影，并进行屏幕空间防重叠。发布前需完成三种范围、两种模式验收；不自动上传、打 tag 或替换全局安装。

- patch：兼容性修复、文档或数据资产修订；
- minor：向后兼容的新能力；
- major：输入、配置或输出契约发生不兼容变化。

V1.2 收紧展示决策门禁：旧配置必须显式加入 `mode`、`paletteId`、`classes`、`classification.method` 和 `classification.source`。自定义分级改用各档下限 `thresholds`，区间语义为左闭右开，末档无有限上界。

V1.3 保持 V1.2 的输入、分级和输出契约，新增 Codex、Claude Code、WorkBuddy 目录包、WorkBuddy ZIP、跨平台浏览器发现和平台原生缓存目录。旧 `.codex` 边界缓存仍可读取。

V1.3.1 固定已确认的浅蓝、橙色与红蓝白配色，支持中英文标题与单位；气泡最低档仅保留灰色底图。国家级示例将台湾边界与独立模拟数值并入中国，以显式 regionGroups 保留审计来源并防止未经确认的重复统计。标签采用 `v1.3.1`。

运行 `node dist/industry-map.mjs version`，并以输出的 `package.json` 版本作为唯一版本依据。全局同步时先生成独立生产包、完成烟测，再通过同目录重命名切换；旧版本保留为带版本号的可恢复备份，直到新版本验收通过。
