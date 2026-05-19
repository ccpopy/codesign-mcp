# codesign-mcp

English | [简体中文](#简体中文)

Local MCP server for Tencent CoDesign sharing links. It exposes artboards, official layer specs, preview images, and designer-exported slices for design-to-code workflows.

## Features

- Read CoDesign sharing links through MCP tools.
- List designs and artboards from a sharing URL.
- Fetch official `meta_url` specs with layers, groups, text, colors, CSS, and coordinates.
- Download designer-exported slice assets from the official slice manifest.
- Keep login state in a persistent local Chromium profile.
- Store runtime files in the caller workspace by default.

## Installation

Run directly with npm:

```bash
npx -y codesign-mcp
```

Or install globally:

```bash
npm install -g codesign-mcp
codesign-mcp
```

## MCP Configuration

For most MCP clients, use the zero-config form:

```json
{
  "mcpServers": {
    "codesign-mcp": {
      "command": "npx",
      "args": ["-y", "codesign-mcp@latest"]
    }
  }
}
```

The server detects its workspace in this order:

1. `CODESIGN_WORKSPACE_DIR`
2. `INIT_CWD`, which is normally the directory where `npx` was launched
3. `process.cwd()`

Runtime files are written under the detected workspace:

```text
<workspace>/.codesign-mcp/profile
<workspace>/.codesign-mcp/artifacts
<workspace>/.codesign-mcp/codesign-mcp.log
```

Use the `codesign_status` tool to inspect `workspaceRoot` and `workspaceRootSource`. If your MCP client launches servers from a global application directory instead of the project directory, set one of these explicitly:

```json
{
  "mcpServers": {
    "codesign-mcp": {
      "command": "npx",
      "args": ["-y", "codesign-mcp@latest"],
      "cwd": "F:/your-project"
    }
  }
}
```

Or:

```text
CODESIGN_WORKSPACE_DIR=F:/your-project
```

Optional environment variables:

```text
CODESIGN_DATA_DIR=F:/your-project/.codesign-mcp
CODESIGN_PROFILE_DIR=F:/your-project/.codesign-mcp/profile
CODESIGN_ARTIFACTS_DIR=F:/your-project/.codesign-mcp/artifacts
CODESIGN_LOG_FILE=F:/your-project/.codesign-mcp/codesign-mcp.log
CODESIGN_IDLE_MS=600000
CODESIGN_KEEP_BROWSER=1
CODESIGN_LOG_LEVEL=info
```

## Tools

- `codesign_status`: Show runtime paths, browser state, and profile state.
- `codesign_login`: Open a visible Chromium window for CoDesign QR-code login.
- `codesign_logout`: Clear the persisted profile.
- `list_artboards`: Resolve a CoDesign sharing URL into designs and artboards.
- `get_artboard_spec`: Fetch official CoDesign `meta_url` specs with layers, text, colors, CSS, groups, and slice metadata.
- `get_artboard_image`: Fetch preview or cover images for visual comparison.
- `download_slice`: Download designer-exported slice assets from the official slice manifest.
- `debug_collect_network`: Collect a redacted network summary for diagnosis.

For design-to-code work, prefer this flow:

```text
list_artboards -> get_artboard_spec -> download_slice
```

Preview screenshots are for visual comparison, not for production slicing.

## Development

```bash
npm install
npm test
node scripts/stdio-smoke.mjs
```

## Publishing

This package is intended to be published from GitHub Actions using npm Trusted Publishing. Do not store long-lived npm tokens in the repository.

Before first publish:

1. Configure npm Trusted Publishing for this GitHub repository and `.github/workflows/publish.yml`.
2. Enable 2FA on npm for account and publishing protection.
3. Create a GitHub release to trigger publication.

## License

MIT

---

## 简体中文

[English](#codesign-mcp) | 简体中文

面向腾讯 CoDesign 分享链接的本地 MCP 服务器。它为设计还原流程提供画板列表、官方图层标注、预览图以及设计师导出的切图资源。

## 功能

- 通过 MCP 工具读取 CoDesign 分享链接。
- 从分享链接获取设计稿和画板列表。
- 获取官方 `meta_url` 标注数据，包括图层、分组、文字、颜色、CSS 和坐标。
- 从官方切图清单下载设计师导出的切图资源。
- 使用本地 Chromium profile 持久化扫码登录态。
- 默认把运行数据写入调用方项目目录。

## 安装

直接通过 npm 运行：

```bash
npx -y codesign-mcp
```

也可以全局安装：

```bash
npm install -g codesign-mcp
codesign-mcp
```

## MCP 配置

大多数 MCP 客户端可以直接使用零配置写法：

```json
{
  "mcpServers": {
    "codesign-mcp": {
      "command": "npx",
      "args": ["-y", "codesign-mcp@latest"]
    }
  }
}
```

服务器会按这个顺序判断工作区：

1. `CODESIGN_WORKSPACE_DIR`
2. `INIT_CWD`，通常是启动 `npx` 时所在的目录
3. `process.cwd()`

运行数据会写入识别到的工作区：

```text
<workspace>/.codesign-mcp/profile
<workspace>/.codesign-mcp/artifacts
<workspace>/.codesign-mcp/codesign-mcp.log
```

可以通过 `codesign_status` 工具查看 `workspaceRoot` 和 `workspaceRootSource`。如果 MCP 客户端从全局应用目录启动服务器，而不是从项目目录启动，可以显式设置其中一种：

```json
{
  "mcpServers": {
    "codesign-mcp": {
      "command": "npx",
      "args": ["-y", "codesign-mcp@latest"],
      "cwd": "F:/your-project"
    }
  }
}
```

或者：

```text
CODESIGN_WORKSPACE_DIR=F:/your-project
```

可选环境变量：

```text
CODESIGN_DATA_DIR=F:/your-project/.codesign-mcp
CODESIGN_PROFILE_DIR=F:/your-project/.codesign-mcp/profile
CODESIGN_ARTIFACTS_DIR=F:/your-project/.codesign-mcp/artifacts
CODESIGN_LOG_FILE=F:/your-project/.codesign-mcp/codesign-mcp.log
CODESIGN_IDLE_MS=600000
CODESIGN_KEEP_BROWSER=1
CODESIGN_LOG_LEVEL=info
```

## 工具

- `codesign_status`：查看运行路径、浏览器状态和 profile 状态。
- `codesign_login`：打开可见 Chromium 窗口，用于扫码登录 CoDesign。
- `codesign_logout`：清理持久化 profile。
- `list_artboards`：把 CoDesign 分享链接解析为设计稿和画板列表。
- `get_artboard_spec`：读取官方 CoDesign `meta_url` 标注数据，包括图层、文字、颜色、CSS、分组和切图元数据。
- `get_artboard_image`：获取预览图或封面图，主要用于视觉对比。
- `download_slice`：从官方切图清单下载设计师导出的切图资源。
- `debug_collect_network`：收集脱敏后的网络摘要，用于诊断。

设计还原建议优先使用：

```text
list_artboards -> get_artboard_spec -> download_slice
```

预览截图只适合做视觉对比，不应作为生产切图来源。

## 开发

```bash
npm install
npm test
node scripts/stdio-smoke.mjs
```

## 发布

建议通过 GitHub Actions 的 npm Trusted Publishing 发布。不要在仓库里保存长期有效的 npm token。

首次发布前：

1. 在 npm 上为这个 GitHub 仓库和 `.github/workflows/publish.yml` 配置 Trusted Publishing。
2. 为 npm 账号开启 2FA。
3. 创建 GitHub Release 触发发布。

## 许可证

MIT
