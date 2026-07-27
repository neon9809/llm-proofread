# 容器一键部署指南

本项目支持通过 Docker Compose 一键部署，镜像支持 `amd64` 与 `arm64` 多架构。

## 快速开始

```bash
cd deploy
# 修改 docker-compose.yml 中的 JWT_SECRET 与数据库口令后：
docker compose up -d
```

启动后访问 `http://<服务器IP>:3000`。

## 管理员初始密码

首次启动时系统自动创建 `admin` 账号，**随机初始密码打印在容器日志中**：

```bash
docker compose logs app | grep "初始密码"
```

示例输出：

```
========================================
[Init] 管理员账号已创建
[Init] 用户名: admin
[Init] 初始密码: Xy3kP9mQvR2sT8wZ
[Init] 请登录后立即修改密码
========================================
```

登录后请立即在「配置 → 密码」中修改密码。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | MySQL 连接串，如 `mysql://user:pass@host:3306/dbname` |
| `JWT_SECRET` | 是 | 会话与 Token 签名密钥，请使用足够长的随机字符串 |
| `PORT` | 否 | 服务端口，默认 3000 |
| `TURNSTILE_SITE_KEY` | 否 | Cloudflare Turnstile 站点密钥，与 `TURNSTILE_SECRET_KEY` 同时填写后启用登录页人机验证 |
| `TURNSTILE_SECRET_KEY` | 否 | Cloudflare Turnstile 密钥，服务端校验 token |
| `OIDC_ISSUER` | 否 | OIDC IdP issuer，如 `https://accounts.google.com`，与 client_id/client_secret 同时填写后启用 SSO |
| `OIDC_CLIENT_ID` | 否 | OIDC 客户端 ID |
| `OIDC_CLIENT_SECRET` | 否 | OIDC 客户端密钥 |
| `OIDC_SCOPES` | 否 | OIDC scope，默认 `openid profile email` |
| `OIDC_DISPLAY_NAME` | 否 | 登录页 SSO 按钮文案，默认 `SSO` |
| `OIDC_APPROVE_REQUIRED` | 否 | `true` 时 OIDC 新用户注册后默认禁用，需管理员在「用户管理」页启用后方可登录 |
| `FOOTER_BEIAN` | 否 | 登录页、工作区、iframe 嵌入页底部显示的文本，见下方说明 |

## Cloudflare Turnstile 人机验证（可选）

1. 访问 https://dash.cloudflare.com → Turnstile，创建一个站点
2. 将拿到的 **Site Key** 填入 `TURNSTILE_SITE_KEY`，**Secret Key** 填入 `TURNSTILE_SECRET_KEY`
3. 重启容器后登录页会出现验证码 widget，登录时由服务端调用 CF siteverify 校验
4. 两个变量必须同时填写才会启用；任一留空则不开启验证（开发环境友好）

## Footer 底部信息（可选）

在登录页、工作区、iframe 嵌入页底部显示的文本，由 `FOOTER_BEIAN` 环境变量控制：

- **留空（默认）**：显示「GitHub开源项目 [文语校对](https://github.com/neon9809/llm-proofread)」
- **`disable`**：所有页面均不显示任何 footer
- **自定义文本**：支持 markdown 超链接格式 `[文字](URL)`（仅 http/https），用 `\n` 换行

示例：

```
FOOTER_BEIAN: "© 2026 你的公司 · [京ICP备XXXXXXXX号](https://beian.miit.gov.cn/)\n[京公网安备 XXXXXXXX号](http://www.beian.gov.cn/)"
```

## OIDC 单点登录（可选）

支持任意标准 OIDC IdP（Google / GitHub / Authentik / Keycloak / Authelia 等）。

1. 在 IdP 创建一个应用，回调地址填 `https://你的域名/api/oidc/callback`
2. 将 issuer、client_id、client_secret 填入对应环境变量
3. 重启容器后登录页出现 SSO 按钮，点击跳转 IdP 完成登录

实现细节：

- 标准 Authorization Code Flow + PKCE，state 参数防 CSRF
- 通过 IdP 的 `.well-known/openid-configuration` 自动发现端点
- OIDC 用户首次登录自动在 `local_users` 表创建账号（username 为 `oidc:<sub 哈希>`，role=user，无密码），后续登录仅刷新登录信息
- 开启 `OIDC_APPROVE_REQUIRED=true` 后，新注册的 OIDC 用户默认禁用，需管理员在「用户管理」页启用（用户列表中 OIDC 用户带 `SSO` 标识）；启用前登录会被拒绝并提示待审批
- 管理员可在「用户管理」将 OIDC 用户提权为 admin
- OIDC 用户的「修改密码」入口自动隐藏（不通过本地密码登录）
- 签发的会话 Cookie 与本地密码登录一致，复用同一套认证流程

## 数据库表初始化

应用启动时自动执行缺失表的创建（基于 drizzle 迁移文件），无需手工建表。

## LLM 配置

登录后在「配置 → 大模型」中添加 OpenAI 兼容接口：

| 服务商 | Base URL 示例 | 模型示例 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |

## iframe 嵌入与开放 API

1. 管理员在「API Token」页面生成 Token；
2. iframe 嵌入：`<iframe src="https://your-domain/embed?token=pk_xxx"></iframe>`（免登录）；
3. API 调用：

```bash
curl -X POST https://your-domain/api/v1/proofread \
  -H "Authorization: Bearer pk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"text": "待校对文本", "useLlm": true, "useRules": true}'
```

响应返回 `original`（原文）、`corrected`（校对后全文）、`paragraphs`（逐段明细）、`llm_config`（使用的模型）、`changed_count`（有修改的段落数）。可选参数：`use_fixed_expressions`（启用固定表述参考库）。

## 审计日志（可选）

设置 `ENABLE_AUDIT_LOG=true` 后，每次校对任务会以 txt 文件写入 `/app/audit-logs` 目录（已挂载为 Docker volume，容器重建不丢失）：

- **文件名**：`时间_来源ID_随机串.txt`
- **内容**：时间、来源 IP、浏览器 UA、认证方式、提交文本、校对结果、逐段明细
- **保留期**：`AUDIT_LOG_RETENTION_DAYS` 天（默认 90，0 = 永久），每小时自动清理

## 固定表述参考库

管理员在「配置 → 固定表述」维护标准表述文本。校对时启用「固定表述」开关后，该内容自动追加到 LLM 系统提示词末尾。
