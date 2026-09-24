# Security

The service currently binds to `127.0.0.1` for local use. Only the Node process uses the deployer-configured `TYPESAFE_API_KEY` to call the fixed official TypeSafe API. The browser accepts no visitor API keys, and the backend rejects client credential headers and extra credential fields.

The application does not write service credentials to logs, disk, browser storage, request previews, or exports, and it uses no credential cookies. Verbatim credential echoes in upstream errors are redacted. The credential still exists in the service process's environment and memory; deployers must protect host and process access. Never paste credentials into application content.

Public mode and non-loopback binding are disabled. A planned public service would use a platform key with access control and USDT-funded credits; those controls and billing are **not implemented**. Do not expose this local release through a public reverse proxy.

## Reporting

Do not post real credentials or private input in a public issue. Use GitHub private vulnerability reporting if the repository offers it. Otherwise, ask the maintainer for a private channel without including sensitive details. Reproductions should use fake credentials and fictional content.

## 中文

当前服务仅监听 `127.0.0.1`。部署者通过 `TYPESAFE_API_KEY` 配置凭证，只有 Node 进程使用它调用固定的 TypeSafe 官方接口；页面不接收访客 Key。程序不把服务凭证写入日志、磁盘、浏览器存储、请求预览或导出，但凭证仍存在于服务进程的环境和内存中，部署者须保护主机和进程访问。公开版的访问控制和 USDT 计费尚未实现，请勿通过反向代理将当前本地服务开放到公网。发现漏洞时不要在公开 Issue 中粘贴真实 Key 或私人内容；如仓库启用 GitHub 私密漏洞报告，请使用该入口。
