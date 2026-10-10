# Compatibility and installation

V1.3 使用一个 Agent Skills 核心包，支持 Codex、Claude Code 和 WorkBuddy；运行时支持 Windows、macOS 与 Linux。最低运行环境为 Node.js 22。生产包已内置运行时依赖，使用者不需要运行 `npm install`。

## Install locations

将完整的 `industry-map` 目录安装到代理的 skills 根目录：

- Codex：`~/.codex/skills/industry-map`
- Claude Code：`~/.claude/skills/industry-map`
- WorkBuddy：`~/.workbuddy/skills/industry-map`

可从源码目录执行以下命令生成三个目录包和 WorkBuddy ZIP：

```sh
npm run package-agents -- --output <artifact-directory>
```

也可直接安装；命令在目标已存在时会停止，不会覆盖：

```sh
node scripts/install-skill.mjs --agent codex
node scripts/install-skill.mjs --agent claude
node scripts/install-skill.mjs --agent workbuddy
```

可用 `--skills-root <path>` 指定目标，或分别设置 `CODEX_SKILLS_DIR`、`CLAUDE_SKILLS_DIR`、`WORKBUDDY_SKILLS_DIR`。安装后运行：

```sh
node ~/.codex/skills/industry-map/dist/industry-map.mjs version
```

Claude Code 与 WorkBuddy 使用各自路径执行同一命令。

## Browser discovery

PNG、SVG 与 PDF 导出需要本机 Chrome、Chromium 或 Edge。V1.3 会按当前平台检查常见安装位置和 `PATH`；macOS 支持 `/Applications`、`~/Applications` 中的 Chrome 与 Edge。自动发现失败时设置 `INDUSTRY_MAP_BROWSER` 为可执行文件的绝对路径。浏览器始终使用一次性隔离 profile，不读取默认用户 profile。

V1.4.1 的 PNG 截图和 PDF 打印各限时 60 秒。超时或退出失败时保留浏览器路径、退出原因与末尾错误输出，不进行无限重试；先检查提示及 `INDUSTRY_MAP_BROWSER`。临时 profile 清理失败仅提示警告，不覆盖原始渲染错误。

## Cache locations

- Windows：`%LOCALAPPDATA%/industry-map/cache/boundary`
- macOS：`~/Library/Caches/industry-map/boundary`
- Linux：`$XDG_CACHE_HOME/industry-map/boundary`，未设置时为 `~/.cache/industry-map/boundary`

`INDUSTRY_MAP_CACHE_DIR` 可覆盖写入位置。V1.3 仍会只读查找旧的 `~/.codex/cache/industry-map/boundary`，新下载只写入平台原生目录。

## Portability boundary

代理只需能读取 `SKILL.md` 并调用 Node CLI；代理专属元数据不是核心运行依赖。路径由 Node 的 `path` 与 URL API 构造，不在配置或脚本中硬编码 Windows 分隔符。发布验收在 Windows 执行跨平台路径单元测试；macOS 上仍应以一次真实导出作为最终环境验收。
