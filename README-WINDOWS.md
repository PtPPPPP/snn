# SNN 社团网站（Windows 本地使用）

## 建议放置位置

将压缩包内的所有文件解压到：

`D:\Program\snn\vibe-coding\website`

注意不要多套一层目录。解压后应能直接看到 `app`、`public`、`package.json` 等文件。

## 首次启动

在目标文件夹空白处右键打开终端，依次执行：

```powershell
npm install
npx vite
```

终端会显示本地访问地址，通常为：

`http://localhost:5173`

按 `Ctrl + C` 可停止服务。

## 主要文件

- `app/page.tsx`：首页文字与页面结构
- `app/globals.css`：网站样式和移动端适配
- `public/`：Logo、公众号二维码和机械臂图片
- `package.json`：项目依赖与命令

## 常用操作

以后再次启动只需在项目目录运行：

```powershell
npx vite
```

如果要用 VS Code 打开整个项目：

```powershell
code .
```

