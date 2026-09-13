# AI Parallel Browser Extension

一个本地 Chrome / Edge Manifest V3 扩展：输入一次 Prompt，同时打开多个主流 AI Web Chat，新建会话并自动发送。

## 支持站点

- ChatGPT — `https://chatgpt.com/`
- DeepSeek — `https://chat.deepseek.com/`
- 智谱清言 — `https://chatglm.cn/`
- Qwen — `https://chat.qwen.ai/`
- Kimi — `https://www.kimi.com/`
- Claude — `https://claude.ai/new`
- Gemini — `https://gemini.google.com/app`

## 设计

```text
Popup
  │ LAUNCH_PARALLEL(prompt, providers)
  ▼
Service Worker
  ├─ chrome.tabs.create(...)
  ├─ session storage: tabId -> prompt/job
  └─ tab group: AI Compare
         │
         ▼
Content Script (目标站点)
  ├─ 根据 sender.tab.id 领取 job
  ├─ 尝试进入新会话
  ├─ 等待 textarea / contenteditable
  ├─ 写入 Prompt
  └─ 点击 Send / Enter 兜底
```

Prompt 不放在 URL，不发送到第三方中转服务。扩展只使用你浏览器里已经登录的各站账号。

## 安装

### Chrome

1. 解压此目录。
2. 打开 `chrome://extensions/`。
3. 开启右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择仓库中的 `apps/browser-extension/`。
6. 固定扩展图标。

### Edge

打开 `edge://extensions/`，开启开发者模式，然后加载已解压扩展。

## 使用

1. 先分别登录需要使用的 AI 网站。
2. 点击扩展图标。
3. 勾选模型。
4. 输入 Prompt。
5. 点击 **并行发送**，或按 `Ctrl/Cmd + Enter`。
6. 扩展会把本轮标签页放进一个 `AI Compare` 标签组。

## 为什么不直接 iframe 多站点

主流 AI 站点通常通过 `X-Frame-Options` / CSP 禁止第三方 iframe，而且跨域页面也不能被扩展 Popup 的普通 JS 直接操作。本扩展使用 Manifest V3 Content Script，在已授权的站点上下文中完成输入与发送。

## 稳定性说明

各 AI 网站的 DOM 经常更新。本项目采取两层策略：

1. 每个 Provider 有一组站点级 selector。
2. selector 失效时使用可见 `textarea` / `contenteditable` 和 Send/Submit 语义进行兜底。

如果某个网站升级后失败，Popup 的“最近一次”会显示错误。通常只需修改 `content/runner.js` 对应 Provider 的 selector，不需要改整体架构。

## 权限

- `storage`：保存勾选项、草稿和本轮一次性任务。
- `tabs`：创建模型页面。
- `tabGroups`：把本轮页面整理到同一个标签组。
- `host_permissions`：仅限清单中的 AI Web Chat 域名。

没有 `webRequest`、Cookie、History、Downloads 等权限。

## 开发

这是 monorepo 中的零构建 app，目前没有运行时依赖。

在仓库根目录执行：

```bash
npm run check
```

修改扩展文件后，在扩展管理页点击 **重新加载** 即可。
