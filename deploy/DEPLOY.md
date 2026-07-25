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
