# TypeSafe AI 使用指南阅读笔记

核对日期：2026-09-23。以下根据官方当前文档整理，实现采用 HTTP API，无需安装 SDK。

## 编程模型

Jev / System One 将 State 和有明确范围的问题转换成类型化判断。工作流、计算和最终行为由代码管理；它返回选项、概率或评分，不是聊天补全文本接口。一个问题尽量只表达一个明确判断，ID 只供代码对应响应，不能替代问题本身的语义。

- [文档索引](https://docs.typesafe.ai/llms.txt)
- [如何用 TypeSafe 构建软件](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)
- [State](https://docs.typesafe.ai/concepts/state)

State 顶层可以是字符串、对象或数组。存在多部分背景时可以使用命名字段；instructions 可通过反引号包裹的路径引用嵌套值，例如 `ticket.message`。图片、音视频需要先转换成文本。本页面面向直接粘贴文章的使用方式，始终将正文作为字符串发送，由程序处理 JSON 转义；用户无需编写 JSON。底层 API 能力仍支持结构化 State。

## 三种问题

| 类型 | criteria | 关键输出 | 本页面显示方式 |
| --- | --- | --- | --- |
| [Choice](https://docs.typesafe.ai/primitives/choice) | 选项名到描述的对象，最多 255 个；描述可为 null | choice、probabilities、confidence | 选中项、全部选项概率、置信度 |
| [Noul](https://docs.typesafe.ai/primitives/noul) | 可省略；可用 true / false 描述边界 | noul，范围 0–1 | 是的概率和补集“否”的概率 |
| [Score](https://docs.typesafe.ai/primitives/score) | 按顺序排列的 2–10 个等级 | score、legend、probabilities、confidence | 原始评分、等级范围、等级分布和置信度 |

instructions 和标准描述可以采用对象或数组，适合同时提供定义、排除条件或例子。Choice 的候选项要覆盖可能答案，可加入 other。Score 等级要能独立解释，按低到高排序。

Noul 接近 0.5 表示两种可能接近，不能解释成中等强度。Score 的等级从 0 编号，n 个等级的得分范围是 0 到 n−1；结果是按各等级概率计算的加权位置，不应直接显示成百分制，也不能假定是 0–1。

Choice 和 Score 的 confidence 概括概率分布的集中程度，不是最终工作流正确率。Noul 没有单独的 confidence。此页面不设置自动执行决策的阈值，只展示原始判断。

参考：[Confidence](https://docs.typesafe.ai/confidence)。

## 请求与并行

接口为 `POST https://api.typesafe.ai/v1/systemone`，通过 `Authorization: Bearer <API_KEY>` 认证。请求包含 `model`、`state`、`questions`；响应包含 `model`、`answers`、`usage`。answers 按原问题 ID 返回。

独立问题可以在同一次调用内并行评估，不会读取其他问题的答案。合并调用减少重复发送 State。本页面保留三个独立请求同时发送的模式，便于比较或分别排查；只在确实需要前一个答案来构造后续问题时才应串行请求。

- [HTTP API 参考](https://docs.typesafe.ai/api)
- [并行问题 cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions)
- [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)

默认模型使用 `jev-latest`，实际版本以响应中的 model 为准。页面允许填写具体版本，连接后会载入账户可用模型提示。Jev 的主要训练语言是英语；中文可以使用，但需要在自己的场景验证效果，所以示例同时提供中英文版本。

参考：[模型、语言和限制](https://docs.typesafe.ai/models)。

## 错误与实现边界

401 表示认证失败；422 表示参数未通过校验；429 是限流；529 是服务过载。实现透传上游状态与正文，429 / 529 使用有上限的退避重试并遵循 Retry-After。取消会中止尚未完成的 HTTP 等待。

本项目的 1 MB 请求体限制、三个问题编辑器、60 秒上游超时和最多两次重试均是本工具的设计选择，不是 TypeSafe API 的全部能力或官方统一限制。模型的限制与配额以官方文档及账户为准。

当前使用本地 Node 服务调用官方 API，浏览器仅访问同源的本机接口，不依赖 TypeSafe 允许网页跨域。凭证仅由部署者通过 TYPESAFE_API_KEY 配置，页面不提供个人 Key 输入，后端不接收用户 Key 会话。公开版计划使用平台 Key 与 USDT 调用额度，访问控制和计费尚未实现。详见 [中文部署指南](deployment.md) / [English](deployment.en.md)。

## 可行性评估模板

“这个项目可不可行”涉及不同判断，因此模板把它拆成下一步阶段选择、最小技术演示可行性、商业证据充分度。技术可以实现并不意味着已经有人愿意付费。模板明确要求不把规划、示意数字或其他厂商的采用量当成本项目的实际客户验证，也不假定访问或核实了文中的链接。

Noul 的概率是模型对当前命题的判断，不是创业成功率。Score 的 0–4 分衡量当前输入提供了多强的商业验证证据，不是项目质量或市场规模评分。

## 模板设计

新增的 12 个模板分别给 Choice、Noul 和 Score 提供具体问题与不同的判断边界。问题同时发送时彼此独立，因此每个问题都从同一份 State 单独得出结论，不引用另一个问题的结果。Choice 用于选择类别或下一步，Noul 用于一个明确的是否命题，Score 用于有序等级，不把三个数值混成一个“综合正确率”。

方向参考 [TypeSafe 官方用例地图](https://docs.typesafe.ai/concepts/use-case-map)、[RAG 分类实践](https://docs.typesafe.ai/cookbooks/rag_classification)与社区 [Jev-Case](https://github.com/Hiwoniu/Jev-Case) 的主题索引。Jev-Case 收集了开发者发布的应用案例，不是可以原样复制的 API 模板；本项目的模板、样例、标签和等级为本项目独立编写。完整中英双语目录见[模板指南](templates.md)。
