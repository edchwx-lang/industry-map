# Protected template workbook

当用户没有 Excel 时，先获取地区名或行政代码，生成该地区下一级行政单元的数据模板：

```powershell
node dist/industry-map.mjs template create --place <地区名或行政代码> --output <模板.xlsx>
```

支持中国→省、省→市、市→县；东莞和澄海使用内置乡镇资产。其他乡镇若未缓存，不在模板创建阶段隐式联网抓取，应按 boundary-assets 的明确抓取流程处理。

用户只能填写黄色元数据单元格和指标值列：图名称必填并原样作为主标题；指标名称必填并作为图例指标名称；单位可留空；指标值只能是数字或空白。空白仅在这种受控模板中按 0 处理。

地区列、隐藏 adcode、模板版本、边界 ID 和 SHA-256 均不可改。读取时重新校验它们；不匹配就停止。模板渲染 config 只写 `templatePath`、`mode`、输出和样式选项，不得在 config 覆盖标题、指标名或单位。

审计表的每条值标记为 `entered` 或 `defaulted_zero`，报告同时记录模板版本、边界哈希和补零数量。
