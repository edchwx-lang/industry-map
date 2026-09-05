# Versioning

`industry-map` 使用语义版本。当前稳定版本为 V1.3.1（`1.3.1`），产品线为 V1：

- patch：兼容性修复、文档或数据资产修订；
- minor：向后兼容的新能力；
- major：输入、配置或输出契约发生不兼容变化。

V1.2 收紧展示决策门禁：旧配置必须显式加入 `mode`、`paletteId`、`classes`、`classification.method` 和 `classification.source`。自定义分级改用各档下限 `thresholds`，区间语义为左闭右开，末档无有限上界。

V1.3 保持 V1.2 的输入、分级和输出契约，新增 Codex、Claude Code、WorkBuddy 目录包、WorkBuddy ZIP、跨平台浏览器发现和平台原生缓存目录。旧 `.codex` 边界缓存仍可读取。

V1.3.1 固定已确认的浅蓝、橙色与红蓝白配色，支持中英文标题与单位；气泡最低档仅保留灰色底图。国家级示例将台湾边界与独立模拟数值并入中国，以显式 regionGroups 保留审计来源并防止未经确认的重复统计。标签采用 `v1.3.1`。

运行 `node dist/industry-map.mjs version`，并以输出的 `package.json` 版本作为唯一版本依据。全局同步时先生成独立生产包、完成烟测，再通过同目录重命名切换；旧版本保留为带版本号的可恢复备份，直到新版本验收通过。
