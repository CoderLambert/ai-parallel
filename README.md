# AI Parallel

AI Parallel 是一个 Chrome / Edge Manifest V3 扩展：在一个工作区中打开多个 AI 网页，一次输入，并行发送，并按需收集、比较和导出回答。

> No API keys. No proxy server. AI Parallel reuses your existing provider web sessions locally in the browser.

## 功能

- 多模型网页工作区：ChatGPT、DeepSeek、智谱清言、Qwen、Kimi、Claude、Gemini、Grok
- 一次输入并行发送到多个 Provider
- Compare Drawer：收集当前回答并安全显示为纯文本
- 导出 Markdown、JSON，或下载 `.md` 文件
- Agent Handoff：把问题和多模型回答交给目标模型继续处理
- 本地 Prompt Library
- Prompt Templates：分类、输入 JSON Schema、变量表单、JSON 输出校验和 JSON 导入/导出
- 布局切换与 Provider 独立刷新/打开

默认启用 ChatGPT、DeepSeek、智谱清言、Qwen 和 Kimi。Claude、Gemini 与 Grok 可按需开启。

## Provider 运行模式

| Provider | 运行方式 | 说明 |
| --- | --- | --- |
| ChatGPT | 工作区 iframe | 使用原站页面和当前登录会话 |
| DeepSeek | 工作区 iframe | 使用原站页面和当前登录会话 |
| 智谱清言 | 工作区 iframe | 使用原站页面和当前登录会话 |
| Qwen | 工作区 iframe | 使用原站页面和当前登录会话 |
| Kimi | 工作区 iframe | 使用原站页面和当前登录会话 |
| Claude | 工作区 iframe | DOM Adapter 为 best effort |
| Gemini | 工作区 iframe | DOM Adapter 为 best effort |
| Grok | 受控顶层标签页 | 避免登录 iframe 与 WebSocket timeout |

Grok 官网依赖已登录的实时 WebSocket，认证页也禁止 iframe。AI Parallel 会打开或复用正常的 `grok.com` 标签页，然后通过受限消息桥完成 Prompt 发送、回答收集和 Handoff。

## 从 GitHub Release 安装

1. 打开 [Releases](https://github.com/CoderLambert/ai-parallel/releases/latest)。
2. 下载 `ai-parallel-browser-extension-vX.Y.Z.zip`。
3. 解压 ZIP，保留解压目录，不要在安装后删除或移动它。
4. Chrome 打开 `chrome://extensions/`；Edge 打开 `edge://extensions/`。
5. 开启右上角“开发者模式”。
6. 点击“加载已解压的扩展程序”。
7. 选择解压得到的 `ai-parallel-browser-extension` 文件夹。
8. 固定 AI Parallel 图标，点击即可打开工作区。

Chrome 不能直接把普通 ZIP 当成未打包扩展安装，必须先解压。

### 校验下载文件

每个 Release 都提供 SHA-256 文件：

```bash
sha256sum -c ai-parallel-browser-extension-vX.Y.Z.zip.sha256
```

## 首次使用

1. 先在各 Provider 官网完成登录。
2. 点击 AI Parallel 图标打开工作区。
3. 在顶部选择 Provider。
4. 在底部输入 Prompt，按 `Ctrl+Enter` / `Cmd+Enter` 或点击“发送”。
5. 等待原站生成回答，点击 `Compare` 收集结果。

Grok 第一次参与发送时会打开或复用官网标签页。扩展升级后，如果旧 Grok 标签页没有新版桥接脚本，AI Parallel 会自动刷新该标签页一次。

## 更新

### 手动更新

下载新 Release，解压并覆盖原目录，然后在 `chrome://extensions/` / `edge://extensions/` 中点击 AI Parallel 的“重新加载”。如果替换了目录位置，需要删除旧扩展后重新“加载已解压的扩展程序”。

### Linux：使用 `ai-parallel-sync`

从 Release 下载 `ai-parallel-sync` 后安装：

```bash
install -Dm755 ai-parallel-sync ~/.local/bin/ai-parallel-sync
ai-parallel-sync
```

首次运行会把扩展同步到：

```text
~/.local/share/ai-parallel/browser-extension
```

第一次在浏览器中加载这个固定目录。以后只需运行 `ai-parallel-sync`，再到扩展管理页点击“重新加载”。命令默认同步最新 `v*` Release 标签，需要 `git`、`node`、`npm` 和 `rsync`。

## 常见问题

### `accounts.x.ai refused to connect`

不要在 iframe 中登录 Grok。当前版本会让 Grok 在正常顶层标签页中运行。请确认已更新扩展，并完全关闭后重新打开旧的 AI Parallel 工作区标签页。

### Grok 显示 WebSocket `timeout`

确认普通 `https://grok.com/` 标签页可以聊天。AI Parallel v2.1.4 起不再把 Grok 嵌入 iframe；如果仍看到旧 iframe，请在扩展管理页重新加载扩展并重新打开工作区。

### `ERR_BLOCKED_BY_CLIENT`

这通常来自广告或隐私扩展。若被阻止的是 Provider 的核心接口，请暂时关闭对应站点的拦截后重试；单纯的统计/广告请求失败通常不影响聊天。

### Provider 显示“未就绪”或发送失败

- 重新加载对应面板。
- 确认已经登录原站。
- 在扩展管理页重新加载 AI Parallel，并重新打开工作区。
- Provider 网页 DOM 会更新；选择器 Adapter 属于 best effort，需要随原站变化维护。

## 权限与隐私

AI Parallel 请求：

- `storage`：保存 Provider 选择、草稿、Prompt Library 和本地 Prompt Templates。
- `tabs`：打开/聚焦工作区和 Grok 顶层标签页。
- `declarativeNetRequest*`：仅对已配置 Provider 的 `sub_frame` 响应移除 iframe 限制头。
- Provider host permissions：注入本地 Adapter，并与原站页面交互。

扩展不保存 Provider 密码，不请求 Cookie 权限，不把 Prompt 放进目标 URL，也不把回答发送到 AI Parallel 自有服务器。回答只在用户点击 Compare 后收集到当前扩展页面，并按纯文本渲染。

## 本地开发

要求 Node.js 18+：

```bash
git clone https://github.com/CoderLambert/ai-parallel.git
cd ai-parallel
npm run check
npm test
```

运行 credential-free 浏览器 E2E（先构建 Chrome 产物，并安装一次 Chromium）：

```bash
pnpm build:chrome
pnpm exec playwright install chromium
AI_PARALLEL_BROWSER_HEADLESS=true pnpm e2e:browser
```

需要真实 Provider 登录态时，使用独立的手动、受保护 authenticated smoke
流程；默认 Browser Smoke 仍不读取凭据。配置和保留边界见
[Authenticated Provider Smoke](docs/testing/AUTHENTICATED-PROVIDER-SMOKE.md)。

从源码加载时，在扩展管理页选择 `apps/browser-extension`。

生成 Release 包：

```bash
npm run package:extension
```

产物位于 `dist/`。

## 架构

```text
AI Parallel Workspace
  ├─ iframe Providers ─ postMessage ─ Provider Adapter
  └─ Grok top-level tab ─ service worker ─ tabs.sendMessage ─ Grok Adapter
```

Provider Adapter 统一提供 `sendPrompt()`、`collectResponse()` 和 `newChat()`。详细设计见 [docs/architecture.md](docs/architecture.md)。第三方架构参考和署名见 [ATTRIBUTION.md](ATTRIBUTION.md)。

## 项目状态

AI Web UI 不是稳定 API，Provider DOM 或安全策略变化可能导致 Adapter 暂时失效。欢迎通过 GitHub Issues 提交复现步骤、页面截图和控制台错误。
