# GitHub + VibeCoding 部署说明

当前仓库地址：

```text
https://github.com/islimeili/ky-lab-management-system_new.git
```

这个项目是全栈系统，不是纯静态网页：前端在 `apps/web`，后端 API 在 `apps/api`，数据库需要 MySQL 8，文件上传需要持久化存储。部署平台如果只部署静态前端，药品图片、登录、团队数据、实验记录等后端功能都不会真正保存。

## 1. 上传到 GitHub

本项目已经排除了 `node_modules`、构建产物、日志、上传文件和真实 `.env` 文件。可以安全上传源码与模板配置。

当前本地仓库已经可以用 SSH 推送：

```bash
git remote set-url origin git@github.com-ky-lab-management:islimeili/ky-lab-management-system_new.git
git branch -M main
git push -u origin main
```

如果后续换电脑，需要重新配置 SSH key 或改用 HTTPS 登录 GitHub。

## 2. VibeCoding 如果支持 Docker Compose

优先选择 Docker Compose 部署，这是最接近真实生产环境的方案。导入 GitHub 仓库后，使用根目录下的：

```text
docker-compose.server.yml
.env.server.example
```

需要在平台环境变量中配置：

```env
MYSQL_ROOT_PASSWORD=强密码
MYSQL_PASSWORD=强密码
JWT_SECRET=长随机字符串
WEB_ORIGIN=https://你的域名或平台地址
```

服务启动后：

- 前端：平台提供的站点域名
- 后端：`/api/health`
- 数据库：MySQL 8 容器
- 上传文件：`api-uploads` 卷

如果平台要求端口：

```text
Web/Nginx public port: 80
API internal port: 4000
MySQL internal port: 3306
```

如果平台要求健康检查：

```text
/api/health
```

## 3. VibeCoding 如果只支持前端静态部署

只部署 `apps/web`：

```text
Root Directory: apps/web
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

这种方式只能部署当前前端界面。后端 API、MySQL、文件上传仍需要部署到腾讯云/阿里云服务器，或改用平台提供的数据库和后端服务。

如果 VibeCoding 只支持分别创建服务，可以拆成三项：

```text
1. MySQL 服务
   Database: lab_lms
   User: lab_user
   Password: 使用 MYSQL_PASSWORD

2. API 服务
   Root: apps/api
   Build: npm install && npm run prisma:generate && npm run build
   Start: npx prisma migrate deploy && npm run start
   Port: 4000
   Env:
     DATABASE_URL=mysql://lab_user:<MYSQL_PASSWORD>@<MYSQL_HOST>:3306/lab_lms
     JWT_SECRET=<长随机字符串>
     WEB_ORIGIN=<前端域名>
     UPLOAD_DIR=/app/uploads

3. Web 服务
   Root: apps/web
   Build: npm install && npm run build
   Output: dist
```

注意：拆分部署时，`apps/web` 需要能访问 API 域名。当前 Docker Compose 方案通过 Nginx 把 `/api` 反向代理到后端；如果平台拆分前后端，后续需要在前端增加可配置 API 地址。

## 4. 腾讯云/阿里云服务器部署

领取 Ubuntu 云服务器后，在服务器上执行：

```bash
git clone https://github.com/islimeili/ky-lab-management-system_new.git
cd ky-lab-management-system_new
bash deploy/server-setup-ubuntu.sh
cp .env.server.example .env.server
```

编辑 `.env.server` 后启动：

```bash
docker compose --env-file .env.server -f docker-compose.server.yml up -d --build
```

验证：

```bash
curl http://服务器IP/api/health
```
