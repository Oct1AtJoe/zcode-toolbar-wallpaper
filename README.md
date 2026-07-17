# zcode-toolbar-wallpaper

给 [ZCode](https://github.com/nicepkg/zcode)（Electron 应用）工具栏加一个「更换壁纸」按钮，点击即可一键换图。

## 功能

- **工具栏按钮**：在 ZCode 左上角工具栏注入一个图片图标按钮，点击选取最新壁纸并注入
- **壁纸注入**：通过 CDP（Chrome DevTools Protocol）将图片设为 ZCode 背景
- **遮罩变暗**：全屏黑色遮罩层，让壁纸上的文字更清晰（可调节透明度）
- **持久化**：记住上次设的壁纸，ZCode 重启后自动恢复
- **图片缩放**：自动将大图缩到 2560px（JPEG 85%），避免 Electron 渲染卡顿

## 前提条件

- **Node.js** >= 18
- **ZCode** 需通过 `--remote-debugging-port=9222` 启动（CDP 注入的前提）

## 安装

```bash
git clone https://github.com/<your-username>/zcode-toolbar-wallpaper.git
cd zcode-toolbar-wallpaper
npm install
```

## 快速开始

### 1. 放壁纸图片

把图片放进 `wallpapers/` 目录（支持 jpg/png/webp）。

### 2. 一键启动

双击 **`start.vbs`**（无黑窗）或 **`start.bat`**（有日志输出）。

脚本会自动：
- 检查 Node.js
- 启动 ZCode（带 debug port，已开则跳过）
- 缩图（wallpapers/ → wallpapers-thumb/）
- 启动后台 server
- 恢复上次壁纸

### 3. 使用

启动后 3 秒内，ZCode 左上角工具栏会出现一个 🖼️ 按钮。点击即可把 `wallpapers/` 里最新的图片设为壁纸。

**再点一次 `start.vbs`** = 停旧 server + 重启（不用去任务管理器杀进程）。

## API

server 启动后提供以下接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/action` | 执行动作 |
| GET | `/api/status` | 查询当前壁纸状态 |
| GET | `/api/job/:id` | 查询任务状态 |

### 动作

```bash
# 一键换壁纸（选 wallpapers/ 最新图）
curl -X POST http://127.0.0.1:18923/api/action -H "Content-Type: application/json" -d '{"action":"pickWallpaper"}'

# 重新注入（随机选图）
curl -X POST http://127.0.0.1:18923/api/action -H "Content-Type: application/json" -d '{"action":"injectImage"}'

# 移除壁纸
curl -X POST http://127.0.0.1:18923/api/action -H "Content-Type: application/json" -d '{"action":"remove"}'

# 调整遮罩透明度 (0-100)
curl -X POST http://127.0.0.1:18923/api/action -H "Content-Type: application/json" -d '{"action":"setWallpaperDim","alpha":60}'
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ZCODE_DEBUG_PORT` | 9222 | ZCode CDP 调试端口 |
| `ZCODE_DEBUG_HOST` | 127.0.0.1 | CDP 主机地址 |
| `ZCODE_WP_DIM` | 60 | 遮罩透明度 (0-100，0=不遮) |
| `ZCODE_WP_CSS` | - | 直接指定 CSS 文件（跳过随机选图） |

## 测试

```bash
npm test
```

73 个测试覆盖：纯函数（inject/buildExpression、pickButton、resize、state）+ server API 端点。

## 项目结构

```
lib/
  cdp.cjs              CDP 连接/目标列表
  inject.cjs           壁纸注入引擎 (图片 + remove + dim)
  wallpaper-pick.cjs   工具栏按钮注入
  wallpaper-dim.cjs    遮罩变暗（实时调节）
  resize.cjs           图片缩放 (sharp)
  server.cjs           HTTP server (pickWallpaper action)
  state.cjs            .wallpaper.json 持久化
  wallpaper.css        UI 透明层 CSS
bin/
  launch-zcode.bat     启动 ZCode (带 debug port)
  probe.ps1            端口探测脚本
wallpapers/            放原图
wallpapers-thumb/      缩图输出 (gitignore)
```

## License

MIT
