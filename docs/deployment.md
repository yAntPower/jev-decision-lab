# 本地部署指南

**简体中文 · [English](deployment.en.md)** · [README](../README.zh-CN.md)

## 准备

下载干净的源码包并解压，安装 Node.js 22+。不需要 npm 依赖、Docker、数据库或浏览器扩展。

网页使用者无需输入 API Key。首次自部署时，部署者需要在运行环境配置有效的 `TYPESAFE_API_KEY`；这是服务配置，不是网页登录或使用步骤。源码包不包含平台凭证。

## 配置并启动

已有环境变量时，在配置它的终端进入项目目录，直接运行：

~~~bash
npm start
~~~

如果变量只在交互式 Bash 中初始化，可运行 `bash -ic 'exec node server.mjs'`。程序本身不扫描 `.env` 或 shell 配置文件，不必打印 Key 来检查配置。

首次配置的部署者可在 Bash 终端使用隐藏输入，避免将凭证写入命令历史：

~~~bash
read -rsp "TypeSafe API Key (deployment only): " TYPESAFE_API_KEY
echo
export TYPESAFE_API_KEY
npm start
~~~

PowerShell 可使用：

~~~powershell
$deploySecret = Read-Host "TypeSafe API Key (deployment only)" -AsSecureString
$env:TYPESAFE_API_KEY = [System.Net.NetworkCredential]::new("", $deploySecret).Password
Remove-Variable deploySecret
npm start
~~~

上述命令只在当前终端配置环境，不会创建配置文件。更改环境变量后重启服务。

打开 `http://127.0.0.1:8787`。页面自动检查服务并加载模型列表，就绪后直接填写正文和问题。未配置时显示“服务待配置”；配置无效时显示连接失败，均不会弹出 Key 输入框。

## 网络与数据

浏览器访问同源本机接口，Node 连接 `https://api.typesafe.ai/v1`。服务端凭证不会返回页面，浏览器无需保存凭证或认证 Cookie。应用不保存输入、结果或调用历史；下载结果由使用者主动发起。输入内容和问题会发送给 TypeSafe。

服务只监听 `127.0.0.1`，默认端口 8787。Linux / macOS 用 `PORT=8788 npm start` 改端口；PowerShell 先执行 `$env:PORT = "8788"`。

连接失败时检查启动终端的配置、服务端网络和 TypeSafe 账户状态，不要把真实 Key 粘贴到 Issue 或日志。请求上限为 1 MB，上游等待最多 60 秒。取消不能保证上游已接收的计算不计费。

完整功能需要 Node 服务。直接双击 HTML 或纯静态托管不能替代它。

## 发布源码与公开服务

执行 `npm run check`、`npm test`、`npm run package`，使用生成的干净目录建立公开仓库。私人报告、个人分析脚本及环境文件不在发布清单中。

产品不再提供用户自带 Key 功能。公开版也将由运营方配置平台 Key，用户通过 USDT 购买调用额度，无需自己的 TypeSafe Key。

**公开版访问控制、账户额度、到账确认和计费尚未实现。** 当前只允许本机运行，`APP_MODE=public` 和非回环监听会被拒绝；不要通过反向代理绕过这个边界。当前没有可直接用于公网的 Docker/Caddy 部署配置。后续工作见 [产品规划](roadmap.md)。
