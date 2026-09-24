# Contributing

Jev Decision Lab is a small, local Jev playground distributed under the [MIT License](LICENSE). It requires Node.js 22+ and has no npm dependencies. Before opening a pull request, run:

~~~bash
npm run check
npm test
npm run package
~~~

- Preserve plain-text input, all three judgment types, and raw response inspection.
- Keep the upstream fixed to the official TypeSafe API and the current service bound to loopback only.
- The deployer configures the service credential through the environment. Do not add visitor API-key inputs or key-session endpoints.
- Use fake credentials, fictional examples, and mocked APIs in tests. Never publish real keys, private prompts, or responses.
- Update the explicit release allowlist when adding public files, and keep both language versions of user-facing behavior in sync.
- Platform-key access and USDT billing are planned, not implemented. Do not present the local release as a public paid service.

Describe the problem, resulting behavior, and verification in each pull request. Follow the [Code of Conduct](CODE_OF_CONDUCT.md), and report sensitive findings as described in [Security](SECURITY.md).

## 中文

项目使用 Node.js 22+，没有 npm 依赖。提交 Pull Request 前运行上述三项检查。保留纯文本输入、Choice / Noul / Score 三类判断和原始响应展示；服务只连接 TypeSafe 官方接口并监听本机。部署者通过环境变量配置凭证，页面不得重新加入访客 Key 输入。测试使用假 Key 与虚构内容，不公开私人材料。增加公开文件时更新发布清单，并同步维护中英文界面与文档。公开版平台 Key 和 USDT 计费尚未实现。PR 请说明问题、改动后行为及验证结果。
