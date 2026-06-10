# GitHub + VibeCoding 部署说明

## 1. 上传到 GitHub

本项目已经排除了 `node_modules`、构建产物、日志、上传文件和真实 `.env` 文件。可以安全上传源码与模板配置。

推荐创建私有仓库：

```bash
git remote add origin https://github.com/<your-name>/<repo-name>.git
git branch -M main
git push -u origin main
```

如果用 GitHub 网页创建仓库，不要勾选初始化 README、`.gitignore` 或 License，避免和本地已有文件冲突。

## 2. VibeCoding 如果支持 Docker Compose

优先选择 Docker Compose 部署，使用根目录下的：

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

## 3. VibeCoding 如果只支持前端静态部署

只部署 `apps/web`：

```text
Root Directory: apps/web
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

这种方式只能部署当前前端界面。后端 API、MySQL、文件上传仍需要部署到腾讯云/阿里云服务器，或改用平台提供的数据库和后端服务。

## 4. 腾讯云/阿里云服务器部署

领取 Ubuntu 云服务器后，在服务器上执行：

```bash
git clone https://github.com/<your-name>/<repo-name>.git
cd <repo-name>
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
