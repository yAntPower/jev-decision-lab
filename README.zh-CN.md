# Jev Decision Lab

非官方开源 Jev 请求实验室。粘贴普通文本，用表单配置 Choice / Noul / Score，发送真实请求并查看概率、评分、耗时、Token 用量和原始响应。支持单问题、合并请求和三个独立请求并发。

**页面无需输入 API Key。模型服务统一使用部署者在服务端配置的凭证。** 当前可运行版本是 HTML/CSS/JavaScript 页面 + 零第三方依赖的 Node.js 本机服务。

## 启动

安装 Node.js 22 或更高版本。部署者在启动环境中配置 `TYPESAFE_API_KEY`，然后在项目目录运行：

~~~bash
npm start
~~~

无需 `npm install` 或构建。打开 **http://127.0.0.1:8787**，页面自动检查服务；终端按 Ctrl+C 停止。环境变量已经配置时无需再次输入或复制 Key。首次部署的配置方法见 [部署指南](docs/deployment.md)。

如果变量只在交互式 Bash 中初始化，可从已配置的终端启动，或执行：

~~~bash
bash -ic 'exec node server.mjs'
~~~

程序不扫描 `.env` 或 shell 配置文件，不打印 Key，也不把服务端凭证发送到浏览器。环境变量改变后需重启。尚未配置时，页面显示“服务待配置”并停用运行按钮，不提供手动输入 Key 的入口。

端口冲突时，Linux / macOS 使用 `PORT=8788 npm start`；PowerShell 先设置 `$env:PORT = "8788"`。

## 使用

1. 等待页面显示“服务已就绪”。
2. 粘贴文章、Markdown 或其他普通文本，无需 JSON。
3. 编辑问题、选项及评分等级；高级 JSON 是可选项。
4. 单独运行一种问题，或合并 / 并发运行全部三种问题。
5. 查看、复制或下载结果。

**语言：简体中文 · [English](README.md)**

页面右上角可切换简体中文 / English；固定文字、12 个评估模板和虚构方案示例均有对应语言版本。模板涵盖项目验证、客服与故障分诊、模型与工具路由、Agent 下一步、RAG 片段、引文核查、候选值选择、发布变更、输入守卫和文档变更。切换语言时，未改动的示例字段随之翻译，已编辑的正文、问题和标准保留原文。各模板的 Choice / Noul / Score 针对不同判断分别定义，见[模板指南](docs/templates.md)。

模型对材料的判断不是事实核实、发布许可或真实成功率。私人方案、真实评估记录和个人分析脚本均排除在开源源码包之外。

## 两种使用方式

| 方式 | 使用者是否输入 Key | 服务凭证由谁配置 | 当前状态 |
| --- | --- | --- | --- |
| 下载源码，本地部署 | 网页无需输入 | 部署者通过 `TYPESAFE_API_KEY` 配置 | 已实现 |
| 使用运营方公开站点 | 无需提供个人 Key | 运营方配置平台 Key | 访问控制与 USDT 计费待实现 |

已移除用户自带 Key（BYOK）功能，包括前端输入、连接 / 断开操作及后端 Key 会话接口。自部署仍需要部署者拥有可用的 TypeSafe 服务凭证；开源代码不附带共享 Key 或免费调用额度。

请求路径是：**浏览器 → 本机 Node 服务 → TypeSafe 官方 API**。浏览器与本机服务同源，因此不依赖官方 API 允许浏览器跨域。完整功能需要启动 Node 服务，不能仅双击 HTML 或使用纯静态托管。

当前服务只监听 `127.0.0.1`，拒绝公开模式和非回环监听。公开版将使用平台 Key，由用户支付 USDT 获得调用额度；**目前尚无充值、收款、余额或计费功能**，请勿把当前服务直接开放到公网。更多数据处理说明见 [隐私说明](dist/privacy.html)。

## 验证与开源发布

~~~bash
npm run check
npm test
npm run package
~~~

测试使用假 Key 和模拟 API，不读取真实环境 Key。覆盖无用户凭证调用、旧入口关闭、三种请求、并发与部分失败、错误、超时、取消、私有文件隔离和发布清单。

`npm run package` 生成干净的源码目录，附 SHA-256 文件清单。只复制明确列出的公开文件，不读取环境文件和私人报告。请用生成的目录建立公开仓库，不要直接上传整个工作目录。

代码采用 [MIT 许可证](LICENSE)。参阅[贡献指南](CONTRIBUTING.md)、[行为准则](CODE_OF_CONDUCT.md)和[安全说明](SECURITY.md)。项目与 TypeSafe AI 无官方隶属关系。TypeSafe 的服务、模型与商标不包含在本许可证中。`private: true` 仅防止意外发布到 npm。

[中文部署指南](docs/deployment.md) · [English deployment guide](docs/deployment.en.md) · [中英双语模板指南](docs/templates.md) · [官方指南笔记](docs/typesafe-guide.md) · [产品规划](docs/roadmap.md)
