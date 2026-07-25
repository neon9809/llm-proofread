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
| `FOOTER_BEIAN` | 否 | 登录页底部显示的备案信息文本，留空则不显示 |

## Cloudflare Turnstile 人机验证（可选）

1. 访问 https://dash.cloudflare.com → Turnstile，创建一个站点
2. 将拿到的 **Site Key** 填入 `TURNSTILE_SITE_KEY`，**Secret Key** 填入 `TURNSTILE_SECRET_KEY`
3. 重启容器后登录页会出现验证码 widget，登录时由服务端调用 CF siteverify 校验
4. 两个变量必须同时填写才会启用；任一留空则不开启验证（开发环境友好）

## 登录页备案信息（可选）

将备案文本填入 `FOOTER_BEIAN`，会在登录页底部以小字号 footer 形式显示。支持 markdown 超链接格式 `[文字](URL)`（仅 http/https），用 `\n` 换行。留空则不显示 footer。

示例：

```
FOOTER_BEIAN: "© 2026 你的公司 · [京ICP备XXXXXXXX号](https://beian.miit.gov.cn/)\n[京公网安备 XXXXXXXX号](http://www.beian.gov.cn/)"
```

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

响应包含 `originalText`（原文）、`correctedText`（修改后全文）、`paragraphs`（逐段明细，含命中与修改）。
