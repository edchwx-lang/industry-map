# V1.4 compatibility verification / 兼容性验证

Verified 2026-09-21 from source commit `27936ed`.

- Full source test suite: 123 passed, 0 failed on Windows.
- Claude Code and WorkBuddy distribution folders each ran without node_modules or runtime npm install. Both reported version1.4.0 and resolved all8 bundled boundary assets.
- Each distribution independently exported world bubbles, China provincial colors, and Shenzhen district colors to PNG/SVG/PDF. All6 runs had complete data joins, equal horizontal/vertical screen scaling and zero overlapping label rectangles. World labels11; national labels34; Shenzhen labels10.
- Agent Skills entrypoint is SKILL.md with name/description frontmatter and relative supporting resources; core rendering uses bundled Node CLI, not Codex-only tools.
- Requirements: Node.js22+ and local Chrome/Chromium/Edge. Native Claude Code/WorkBuddy host invocation and macOS/Linux export were NOT tested; this verifies the portable package/runtime, not every host environment or account permission.

官方格式依据：

- [Claude Code skills](https://code.claude.com/docs/en/skills): personal `~/.claude/skills/industry-map`, or project `.claude/skills/industry-map`.
- [WorkBuddy project configuration](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Project): supports project `.codebuddy/skills/industry-map/SKILL.md`. This is an alternative when a host version does not discover the existing `.workbuddy/skills` location; use only one installation to avoid duplicate discovery.

未改动用户现有宿主安装，也未替换 Codex 全局技能。示例指标为模拟数据；边界及第三方软件许可保留原有约束。
