# zcode-toolbar-wallpaper

![preview](preview.jpg?v=2)

给 [ZCode](https://github.com/nicepkg/zcode)（Electron 应用）工具栏加一个「更换壁纸」按钮，点击即可一键换图，旁边附带遮罩浓度滑块。

## 功能

- **工具栏按钮**：在 ZCode 左上角工具栏注入一个 🖼️ 图片图标按钮，点击选取最新壁纸并注入
- **遮罩浓度滑块**：按钮右侧的滑块，以 5% 为步长调节遮罩浓度（0%–100%），拖动后点击「更换壁纸」即生效
- **遮罩持久化**：遮罩浓度会随壁纸一起保存，ZCode 重启后自动恢复上次的浓度
- **壁纸注入**：通过 CDP（Chrome DevTools Protocol）将图片设为 ZCode 背景
- **持久化**：记住上次设的壁纸，ZCode 重启后自动恢复
- **图片缩放**：自动将大图缩到 2560px（JPEG 85%），避免 Electron 渲染卡顿
- **字体皮肤**：把 ZCode 界面字体换成 Assistant（与 WorkBuddy 一致），4 个字重（Regular/Medium/SemiBold/Bold），woff2 随项目自带，由 HTTP server 提供给浏览器加载，非侵入不改 app.asar
- **毛玻璃侧边栏**：左侧任务侧边栏毛玻璃磨砂效果（`backdrop-filter: blur(20px)` + 半透明深色底），透出壁纸，仅作用侧边栏，主编辑区不受影响

## 安装

### 1. 安装 Node.js

需要 **Node.js >= 18**。如果还没装，去 [nodejs.org](https://nodejs.org/) 下载 LTS 版本安装即可。

验证安装：
```bash
node --version
```

### 2. 下载本项目

```bash
git clone https://github.com/Oct1AtJoe/zcode-toolbar-wallpaper.git
cd zcode-toolbar-wallpaper
```

> 不会用 git？点 [这里](https://github.com/Oct1AtJoe/zcode-toolbar-wallpaper/archive/refs/heads/main.zip) 下载 ZIP，解压后进入文件夹即可。

### 3. 安装依赖

```bash
npm install
```

### 4. 放入壁纸图片

把图片放进 `wallpapers/` 目录（支持 `.jpg` / `.jpeg` / `.png` / `.webp` / `.gif` / `.svg`）。

### 5. 启动

**推荐**：双击 **`start.vbs`**（无黑窗，静默启动）。

或双击 **`start.bat`**（有日志输出，便于排错）。

启动脚本会自动完成以下全部步骤：
1. 检查 Node.js 是否可用
2. 以调试端口 9222 启动 ZCode（已在运行则跳过）
3. 缩放 `wallpapers/` 中的图片到 `wallpapers-thumb/`
4. 启动后台 HTTP server（端口 18923）
5. 恢复上次的壁纸和遮罩浓度
6. 注入皮肤（Assistant 字体 + 毛玻璃侧边栏）

启动后约 3 秒内，ZCode 左上角工具栏会出现按钮和滑块。

> **再点一次 `start.vbs`** = 停旧 server + 重启（不用去任务管理器杀进程）。

#### 桌面快捷方式（推荐）

不想每次进文件夹双击？建一个桌面快捷方式：

1. 右键 `start.vbs` → **创建快捷方式**（生成「start.vbs - 快捷方式」）
2. 把它重命名为你想要的名字（如「ZCode 壁纸」）
3. （可选）右键快捷方式 → **属性** → **更改图标** → 选一个 `.ico` 文件（ZCode 自带的图标在 `ZCode 安装目录\resources\tray_icon.ico`）
4. 把快捷方式剪切粘贴到桌面

以后双击桌面图标即可一键启动 ZCode + 壁纸 + 皮肤。

### 6. 使用

- **🖼️ 按钮**：点击后选取 `wallpapers/` 里最新放入的图片作为壁纸
- **滑块**：拖动调节遮罩浓度（0% = 无遮罩，100% = 全黑），调好后点 🖼️ 按钮生效

## 排错

| 问题 | 解决方法 |
|------|----------|
| 工具栏没出现按钮 | 等 3 秒；或再双击一次 `start.vbs` 重启 |
| 找不到 ZCode.exe | 设置环境变量 `ZCODE_EXE` 指向 ZCode.exe 的完整路径 |
| 端口 9222 被占用 | 关闭占用该端口的程序，或修改 `bin/launch-zcode.bat` 中的 `DEBUG_PORT` |
| 想看启动日志 | 双击 `start.bat`（而非 `.vbs`），或查看 `.start.log` 文件 |
| 想移除壁纸 | 运行 `npm run remove`，或 `curl -X POST http://127.0.0.1:18923/api/action -H "Content-Type: application/json" -d "{\"action\":\"remove\"}"` |

## API

server 启动后提供以下接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/action` | 执行动作 |
| GET | `/api/status` | 查询当前壁纸状态 |
| GET | `/api/job/:id` | 查询任务状态 |

### 动作

```bash
# 一键换壁纸（选 wallpapers/ 最新图，dim 指定遮罩浓度 0-100，可选）
curl -X POST http://127.0.0.1:18923/api/action \
  -H "Content-Type: application/json" \
  -d '{"action":"pickWallpaper","dim":60}'

# 重新注入（随机选图）
curl -X POST http://127.0.0.1:18923/api/action \
  -H "Content-Type: application/json" \
  -d '{"action":"injectImage"}'

# 移除壁纸
curl -X POST http://127.0.0.1:18923/api/action \
  -H "Content-Type: application/json" \
  -d '{"action":"remove"}'

# 注入皮肤（Assistant 字体 + 毛玻璃侧边栏）
curl -X POST http://127.0.0.1:18923/api/action \
  -H "Content-Type: application/json" \
  -d '{"action":"injectSkin"}'

# 移除皮肤
curl -X POST http://127.0.0.1:18923/api/action \
  -H "Content-Type: application/json" \
  -d '{"action":"removeSkin"}'

# 实时调整遮罩透明度 (0-100，不触发换壁纸)
curl -X POST http://127.0.0.1:18923/api/action \
  -H "Content-Type: application/json" \
  -d '{"action":"setWallpaperDim","alpha":60}'
```

> `pickWallpaper` 的 `dim` 参数会随壁纸一起持久化，重启后自动恢复。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ZCODE_EXE` | 自动探测 | ZCode.exe 的完整路径（探测失败时手动指定） |
| `ZCODE_DEBUG_PORT` | 9222 | ZCode CDP 调试端口 |
| `ZCODE_DEBUG_HOST` | 127.0.0.1 | CDP 主机地址 |
| `ZCODE_WP_DIM` | 60 | 遮罩透明度 (0-100，0=不遮) |
| `ZCODE_WP_CSS` | - | 直接指定 CSS 文件（跳过随机选图） |
| `ZCODE_SKIN_PORT` | 18923 | 皮肤字体文件 HTTP 服务端口（@font-face 加载用） |
| `ZCODE_SKIN_HOST` | 127.0.0.1 | 皮肤字体服务主机 |

## 测试

```bash
npm test
```

104 个测试覆盖：纯函数（inject/buildExpression、skin/buildSkinExpression、pickButton、resize、state）+ server API 端点。

## 项目结构

```
lib/
  cdp.cjs              CDP 连接/目标列表
  inject.cjs           壁纸注入引擎 (图片 + remove + dim 持久化)
  skin-inject.cjs      皮肤注入引擎 (字体 + 毛玻璃 + remove)
  wallpaper-pick.cjs   工具栏按钮 + 遮罩滑块注入
  wallpaper-dim.cjs    遮罩变暗（实时调节）
  resize.cjs           图片缩放 (sharp)
  server.cjs           HTTP server (pickWallpaper/injectSkin + /fonts 字体)
  state.cjs            .wallpaper.json 持久化
  wallpaper.css        UI 透明层 CSS
  skin.css             皮肤 CSS (字体覆盖 + 毛玻璃规则)
  fonts/               Assistant woff2 字体 (4 字重)
bin/
  launch-zcode.bat     启动 ZCode (带 debug port)
  probe.ps1            端口探测脚本
wallpapers/            放原图
wallpapers-thumb/      缩图输出 (gitignore)
```

## 致谢

本项目基于 [zzh-learner/zcode-wallpaper](https://github.com/zzh-learner/zcode-wallpaper) 改造而来，在此基础上新增了工具栏按钮、遮罩浓度滑块、dim 持久化等功能。感谢原作者的工作。

## License

MIT
