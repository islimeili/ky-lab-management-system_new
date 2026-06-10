# 实验室管理系统

一个面向实验室团队的响应式 Web MVP，包含药品库存、团队权限、实验模板、个人实验执行记录、失败原因记录，以及受控文件上传。

## 技术栈

- 前端：React + Vite + TypeScript
- 后端：Fastify + TypeScript
- 数据库：Prisma + MySQL 8
- 文件：本地开发默认保存到 `apps/api/uploads`，生产环境可替换为腾讯云 COS 或阿里云 OSS

## 快速开始

```bash
npm install
Copy-Item apps/api/.env.example apps/api/.env
npm run prisma:generate
npm run dev:api
npm run dev:web
```

前端默认运行在 `http://localhost:5173`，API 默认运行在 `http://localhost:4000`。

## 数据库

编辑 `apps/api/.env` 中的 `DATABASE_URL`，指向 MySQL 8 数据库：

```env
DATABASE_URL="mysql://user:password@localhost:3306/lab_lms"
JWT_SECRET="change-me"
```

首次连接数据库后运行：

```bash
npm run prisma:migrate
```

## 文件上传策略

- 药品图片上传默认开放，单图建议小于 10MB。
- 视频/附件上传默认受控，团队未开通时显示：`若想使用本功能，请联系系统负责人 3119314861@qq.com`。
- 视频/附件单文件最大 200MB。
- 生产环境建议将 `FileStorage` 服务替换为腾讯云 COS 或阿里云 OSS 直传。

## 权限规则

- 群主 `OWNER`：创建团队的人，可以设定/取消管理员，管理药品和实验模板。
- 管理员 `ADMIN`：可以管理药品，创建、编辑、归档实验模板。
- 成员 `MEMBER`：可以查看药品，使用实验模板，保存自己的实验执行记录。
- 执行记录默认按个人隔离：管理员和成员只能查看自己的记录。
- 群主可以查看所有人的执行记录，也可以单独授权某个成员/管理员查看全部执行记录。
- 被授权查看全部执行记录的人只获得查看权限，不能修改或结束别人的实验记录。
- 所有业务数据都绑定团队，后端接口会检查当前用户是否属于该团队。

## 主要 API

- `POST /auth/register`：注册用户，可同时创建第一个团队。
- `POST /auth/login`：登录并返回 JWT。
- `GET /teams`：获取当前用户加入的团队。
- `PATCH /teams/:teamId/members/:userId/role`：群主设置或取消管理员。
- `PATCH /teams/:teamId/members/:userId/run-visibility`：群主授权或取消某人查看全部执行记录。
- `GET /inventory?teamId=...`：药品列表。
- `POST /inventory`：群主/管理员新增药品。
- `POST /inventory/:itemId/events`：群主/管理员记录消耗、补充、报废、调整。
- `GET /orders?teamId=...`：查看药品订购表。
- `POST /orders`：团队成员提交药品订购申请。
- `PATCH /orders/:orderId/status`：群主/管理员更新订购状态。
- `GET /protocols?teamId=...`：实验模板列表，所有成员可用。
- `POST /protocols`：群主/管理员创建实验模板。
- `POST /runs`：成员使用模板开始一次实验。
- `PATCH /runs/:runId/steps/:stepId`：勾选或取消实验步骤。
- `PATCH /runs/:runId/finish`：标记实验成功、失败或中止。
- `GET /files/policy?teamId=...&kind=...`：查询上传权限和 200MB 限制。
- `POST /files?teamId=...&kind=...`：上传药品图片、视频或附件。

## 云部署建议

首版可先用免费资源验证流程，但不要把永久免费作为正式产品前提。

- 腾讯云路线：CloudBase 或轻量应用服务器 + MySQL/TDSQL-C + COS。优势是未来衔接微信生态更顺。
- 阿里云路线：轻量应用服务器/函数计算 + RDS MySQL + OSS。优势是基础云产品组合成熟。
- 数据库保持 MySQL 8，文件层集中在 `apps/api/src/services/storage.ts`，后续替换 COS/OSS 时优先改这一层。

## 服务器 Docker 部署

项目已准备好 `docker-compose.server.yml`，适合在一台免费/低配 Linux 云服务器上先跑 MVP：

```bash
cp .env.server.example .env.server
# 编辑 .env.server，填写 MYSQL_ROOT_PASSWORD、MYSQL_PASSWORD、JWT_SECRET、WEB_ORIGIN
docker compose --env-file .env.server -f docker-compose.server.yml up -d --build
```

部署后：

- 前端站点：`http://服务器IP`
- 后端健康检查：`http://服务器IP/api/health`
- MySQL 数据卷：`mysql-data`
- 上传文件数据卷：`api-uploads`

如果服务器是 Ubuntu，可以先运行：

```bash
bash deploy/server-setup-ubuntu.sh
```

脚本会安装 Docker 和 Docker Compose 插件。安装后需要重新登录一次 SSH，或执行 `newgrp docker`。
