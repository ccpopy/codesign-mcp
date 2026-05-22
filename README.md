# codesign-mcp

[![npm version](https://img.shields.io/npm/v/codesign-mcp?label=npm&color=cb3837)](https://www.npmjs.com/package/codesign-mcp)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-000000)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

English | [简体中文](#简体中文)

Local MCP server for Tencent CoDesign sharing links. It exposes artboards, official layer specs, preview images, and designer-exported slices for design-to-code workflows.

## Features

- Read CoDesign sharing links through MCP tools.
- List designs and artboards from a sharing URL.
- Fetch official `meta_url` specs with layers, groups, text, colors, CSS, and coordinates.
- Download designer-exported slice assets from the official slice manifest.
- Keep login state in a persistent local Chromium profile.
- Store runtime files in the caller workspace by default.
- Provide a reusable MCP prompt and read-only workflow resource for design-to-code tasks.

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

## Security Notes

Remote metadata and artifact downloads are restricted to `https://codesign.qq.com` and `https://cdn*.codesign.qq.com`. Unsupported hosts fail explicitly with `REMOTE_URL_NOT_ALLOWED`.

`codesign_logout` only clears a profile directory inside the configured runtime directory. Unsafe profile paths fail explicitly with `PROFILE_DIR_UNSAFE`.

## Prompts

- `implement_codesign_page`: Generate a structured design-to-code prompt for a CoDesign sharing link. It guides an Agent to call `list_artboards`, `get_artboard_spec`, and `download_slice` in the intended order.

## Resources

- `codesign://workflow/design-to-code`: Read-only workflow guidance for using the MCP tools without cropping preview screenshots or fabricating unavailable CoDesign data.

For design-to-code work, prefer this flow:

```text
list_artboards -> get_artboard_spec -> download_slice
```

Preview screenshots are for visual comparison, not for production slicing.

## Design-to-Code Workflow Prompt

Before asking an Agent to implement a page from CoDesign, make sure the MCP server is connected. If the design requires login, call `codesign_status` first. When the profile does not exist or CoDesign is not logged in, call `codesign_login`, scan the QR code in the opened browser window, and then call `codesign_status` again to confirm the login state.

Use this prompt template with your Agent. Replace `<PROJECT_ID>` with the value after `/s/` in the CoDesign sharing URL. If the sharing link does not require a password, remove the password line.

```text
Implement the column page from this CoDesign design:

Link: https://codesign.qq.com/s/<PROJECT_ID>
Password: <PASSWORD_IF_REQUIRED>

Requirements:
1. First call the codesign-mcp list_artboards tool to get the artboard list.
2. Then call get_artboard_spec to get the official specification data.
3. If the design contains designer-exported slice assets, prefer download_slice. Do not crop assets from the full-page preview image.
4. Use preview images only for visual comparison, not as production asset sources.
5. Implement the page in the column directory.
```

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
3. Create and push a version tag, for example `v0.1.7`, to trigger publication.

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
- 提供可复用的 MCP 提示词和只读流程资源，服务于设计还原任务。

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

## 安全说明

远程标注数据和资源下载仅允许访问 `https://codesign.qq.com` 与 `https://cdn*.codesign.qq.com`。不支持的远程主机会明确返回 `REMOTE_URL_NOT_ALLOWED`。

`codesign_logout` 只会清理位于运行目录内的 profile 目录。不安全的 profile 路径会明确返回 `PROFILE_DIR_UNSAFE`。

## 提示词

- `implement_codesign_page`：为 CoDesign 分享链接生成结构化设计还原提示词，引导 Agent 按预期顺序调用 `list_artboards`、`get_artboard_spec` 和 `download_slice`。

## 资源

- `codesign://workflow/design-to-code`：只读流程说明，用于指导 MCP 工具的正确组合方式，避免裁剪预览图或伪造不可用的 CoDesign 数据。

设计还原建议优先使用：

```text
list_artboards -> get_artboard_spec -> download_slice
```

预览截图只适合做视觉对比，不应作为生产切图来源。

## 设计还原流程提示词

让 Agent 基于 CoDesign 实现页面前，请先确认 MCP 服务器已经连接。如果设计稿需要登录，先调用 `codesign_status`。当 profile 不存在或者 CoDesign 尚未登录时，调用 `codesign_login`，在打开的浏览器窗口中扫码登录，然后再次调用 `codesign_status` 确认登录状态。

可以把下面的模板发给 Agent。将 `<PROJECT_ID>` 替换为 CoDesign 分享链接中 `/s/` 后面的项目 ID。如果分享链接不需要密码，删除密码这一行。

```text
请基于这个 CoDesign 设计稿实现栏目页面：

链接：https://codesign.qq.com/s/<PROJECT_ID>
密码：<PASSWORD_IF_REQUIRED>

要求：
1. 先调用 codesign-mcp 的 list_artboards 获取画板列表。
2. 再调用 get_artboard_spec 获取官方标注信息。
3. 如果设计稿里存在设计师导出的切图资源，优先调用 download_slice 获取，不要从整页预览图里自行裁图。
4. 预览图只用于视觉对比，不作为生产切图来源。
5. 在 column 目录中实现页面。
```

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
3. 创建并推送版本标签，例如 `v0.1.7`，触发发布。

## 许可证

MIT
