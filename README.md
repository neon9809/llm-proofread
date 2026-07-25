# 文语校对 — LLM Proofread

基于大语言模型与规则引擎双重审核的长文本智能校对 Web 应用。粘贴长文本后系统自动按段落切分，并行执行违禁词检测、不规范表述替换与大模型校对，以段落级 Inline Diff（绿色新增、红色删除线）呈现结果，支持逐段接受/忽略与一键复制全文。

## 功能特性

| 模块 | 说明 |
| --- | --- |
| 双重审核引擎 | 规则引擎（违禁词 + 替换规则）与 LLM 校对并行执行，结果合并展示 |
| 段落级 Inline Diff | 每段原文与校对结果内联对比，绿色高亮新增、红色删除线标注删除、违禁词标红 |
| LLM 配置管理 | 支持配置 Base URL / API Key / 模型 / 自定义 Prompt，兼容 OpenAI、DeepSeek、通义千问等 OpenAI 兼容接口 |
| 违禁词管理 | 手动添加、批量导入、删除；命中段落直接标红提示 |
| 替换规则管理 | 键值对配置（如「的的地」→「地」），命中后高亮并给出替换建议 |
| 用户与安全 | 管理员启动时自动创建（随机密码打印在容器日志），用户管理、每次登录记录 IP |
| iframe 嵌入 | `/embed?token=pk_xxx` 免登录嵌入，精简界面 |
| 开放 API | 管理员生成 Token，`POST /api/v1/proofread` 返回原文、修改后全文与逐段修改明细 |
| Apple Design 风格 | 系统字体、负字距大标题、半透明工具栏、弹性动画、`prefers-reduced-motion` 适配 |

## 技术栈

React 19 + Tailwind 4 + shadcn/ui（前端），Express 4 + tRPC 11 + Drizzle ORM + MySQL（后端），bcryptjs + jose JWT（认证），vitest（测试）。

## 容器一键部署

镜像发布于 GitHub Container Registry（ghcr.io），支持 `linux/amd64` 与 `linux/arm64` 多架构。

```bash
docker pull ghcr.io/neon9809/llm-proofread:latest
```

或使用 Docker Compose：

```bash
cd deploy
# 修改 docker-compose.yml 中的 JWT_SECRET 与数据库口令
docker compose up -d
# 查看管理员随机初始密码
docker compose logs app | grep "初始密码"
```

详细步骤见 [deploy/DEPLOY.md](deploy/DEPLOY.md)。

## 开放 API 示例

```bash
curl -X POST https://your-domain/api/v1/proofread \
  -H "Authorization: Bearer pk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"text": "待校对文本", "use_llm": true, "use_rules": true}'
```

响应字段：`original`（原文）、`corrected`（修改后全文）、`paragraphs`（逐段明细：原文、修改后、是否变更、LLM 说明、规则命中及位置）。完整文档见应用内「API 文档」页。

## iframe 嵌入

```html
<iframe src="https://your-domain/embed?token=pk_xxx" width="100%" height="720"></iframe>
```

## 本地开发

```bash
pnpm install
pnpm dev        # 启动开发服务器
pnpm test       # 运行 vitest 测试
```

## Credit

本项目由 [Manus AI](https://manus.im) 构建。

### 需求来源（用户提示词整理）

| 轮次 | 需求摘要 |
| --- | --- |
| 1 | 调研开源网页文本校对项目：可配置大语言模型、违禁词与不规范表述列表，调用大模型 API 校对，段落内一一对应显示校对结果 |
| 2 | 制订完整开发计划（技术选型、功能模块、阶段规划） |
| 3 | 指定 Apple Design 设计风格：系统字体、负字距大标题、半透明工具栏、弹性动画、pointer-down 即时反馈、prefers-reduced-motion 适配 |
| 4 | 明确核心功能：段落切分批量校对、段落级 Inline Diff、LLM 配置管理（兼容 OpenAI/DeepSeek/通义）、违禁词管理、替换规则管理、双重审核引擎、逐段接受/忽略与一键复制 |
| 5 | 容器一键部署；管理员随机初始密码打印在 Docker 日志；用户管理列表；每次登录记录 IP |
| 6 | 支持 iframe 嵌入（token 免登录）；开放 API 返回原文、修改后全文与具体修改段落；API Token 由管理员生成 |
