# LLM Proofread — 项目 TODO

## 数据模型与基础
- [x] 数据库 schema：本地用户表（用户名/密码哈希/角色/状态）
- [x] 数据库 schema：登录日志表（用户、IP、时间、UA）
- [x] 数据库 schema：LLM 配置表（Base URL、API Key、模型、Prompt）
- [x] 数据库 schema：违禁词表
- [x] 数据库 schema：不规范表述替换规则表（键值对）
- [x] 数据库 schema：API Token 表（管理员生成、可吊销）
- [x] 生成并应用数据库迁移

## 后端功能
- [x] 自建密码认证：登录/登出，JWT 会话 Cookie
- [x] 管理员账号：启动时若不存在则自动创建，随机生成密码并打印在 Docker/启动日志中
- [x] 登录时记录 IP 地址与登录历史
- [x] 用户管理 API：创建、启用/禁用、重置密码、删除、列表（含最近登录 IP）
- [x] LLM 配置管理 API（增删改查、设为默认、连接测试）
- [x] 违禁词管理 API（添加、删除、批量导入、列表）
- [x] 替换规则管理 API（键值对增删改查）
- [x] 文本段落切分逻辑
- [x] 规则引擎：违禁词检测（位置标注）+ 不规范表述替换建议
- [x] LLM 校对引擎：调用 OpenAI 兼容接口（OpenAI/DeepSeek/通义），结构化 JSON 输出
- [x] 双重审核并行执行与结果合并
- [x] API Token 管理 API：管理员生成、吊销、列表
- [x] 开放校对 API：POST /api/v1/proofread，Token 认证，返回原文/修改后/修改段落明细
- [x] iframe 嵌入支持：允许 iframe（去除 X-Frame-Options 限制）、?token= 免登录访问

## 前端页面（Apple Design 风格）
- [x] 全局主题：系统字体、负字距大标题、半透明工具栏、弹性动画、reduced-motion 适配
- [x] 登录页（用户名/密码）
- [x] 校对工作区：文本输入、段落切分提交、进度显示
- [x] 段落级 Inline Diff 展示（绿色新增、红色删除线、违禁词标红、替换规则高亮）
- [x] 逐段接受/忽略建议，一键复制全文
- [x] 配置中心：LLM 配置管理页
- [x] 配置中心：违禁词管理页
- [x] 配置中心：替换规则管理页
- [x] 管理页：用户管理（含登录 IP 历史）
- [x] 管理页：API Token 管理（生成/吊销/复制）
- [x] iframe 嵌入模式：?token= 免登录、精简界面
- [x] API 使用文档页

## 测试与部署
- [x] Vitest 单元测试：认证、规则引擎、段落切分、Token 校验（22 个用例全部通过）
- [x] Dockerfile 与 docker-compose.yml（容器一键部署，多架构 amd64/arm64）
- [x] README 文档（部署指南、API 文档、Credit）
- [x] 浏览器联调验证核心流程（登录、规则校对、Inline Diff、接受/忽略、Token 免登录嵌入）
