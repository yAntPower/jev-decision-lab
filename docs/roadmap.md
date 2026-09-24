# 产品边界 / Product scope

## 已实现 / Implemented

本地 Jev 请求实验室支持普通文本、Choice / Noul / Score、合并与并发请求、结果导出和中英文部署文档。部署者配置服务端 `TYPESAFE_API_KEY`，网页自动检查服务，使用者无需提供个人 Key。

The local Jev playground supports plain text, Choice / Noul / Score, combined and concurrent requests, result export and bilingual deployment docs. The deployer configures `TYPESAFE_API_KEY` on the server; the page checks readiness automatically without asking visitors for keys.

## 凭证方案 / Credential model

本地与未来公开版本都使用部署者配置的服务端凭证。用户自带 Key（BYOK）功能已取消：没有 Key 输入、连接 / 断开控件、Key 会话接口或凭证 Cookie。不会再将 BYOK 列为待实现功能。源码包不包含平台 Key。

Both local use and the planned public service use deployer-configured server credentials. BYOK has been removed: there is no key input, connect/disconnect control, key-session endpoint or credential cookie. BYOK is no longer planned. Source releases contain no platform key.

## 公开服务与 USDT：后续 / Public service and USDT: future work

公开版本由运营方提供平台 Key，用户支付 USDT 获得调用额度，无需拥有 TypeSafe Key。后端至少需要提供访问控制、额度与用量账本、并发预扣与结算，以及 USDT 到账确认和防重复入账。需要确定支持的网络、代币合约及收款方式，凭证不得嵌入前端。

The operator provides the platform key. Visitors pay USDT for access credits without needing a TypeSafe key. The backend needs access control, a usage/credit ledger, concurrent reservation and settlement, payment verification and deduplication. The supported network, token contract and receiving method must be defined. Platform credentials must never ship in frontend code.

目前没有充值入口、收款地址、余额或计费功能，公开模式尚未开放。当前本机服务不能作为已完成的收费站点发布。

No payment screen, receiving address, balance or billing is implemented, and public mode is disabled. The local service must not be presented as a completed paid public service.
