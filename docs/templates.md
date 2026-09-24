# 评估模板 / Judgment templates

[简体中文](#简体中文) · [English](#english) · [返回中文 README](../README.zh-CN.md) / [Back to English README](../README.md)

## 简体中文

页面提供 12 个可编辑示例。每个模板将同一份正文作为 State，分别提出三个独立问题：Choice 选一个类别或动作，Noul 判断一个条件成立的概率，Score 按有序等级评分。模板只是问题设置，不会替使用者执行退款、发布或封禁。结果应通过真实数据和确定性规则复核。

| 模板 | Choice | Noul | Score |
| --- | --- | --- | --- |
| 项目验证阶段 | 下一步验证阶段 | 最小演示能否做出 | 客户与付费证据强度 |
| 客服工单分流 | 主要处理团队 | 是否明确要求退款 | 语言表达的不满程度 |
| 故障报告分诊 | 受影响功能 | 是否有替代路径 | 导出阻断程度 |
| Agent 模型路由 | 处理路径 | 是否需要外部信息 | 推理复杂度 |
| Agent 工具选择 | 下一步工具 | 是否授权写操作 | 当前请求所需动作的副作用 |
| Agent 下一步 | 继续、停止或人工等动作 | 是否观察到所需事实 | 答复准备程度 |
| RAG 片段筛选 | 片段与问题的关系 | 是否含直接答案 | 回答相关性 |
| 引文支持核查 | 证据与声明的关系 | 是否直接支持关键事实 | 证据强度 |
| 候选值选择 | 哪个预提值符合目标 | 目标值是否明确出现 | 候选映射歧义 |
| Agent 发布变更 | 工具描述的语义变化 | 副作用是否扩大 | 潜在行为影响 |
| Agent 输入守卫 | 内容处置路径 | 是否注入指令 | 对给定规则的风险 |
| 产品文档变更影响 | 哪些内容需更新 | 是否有过时的明确数值 | 文档与产品不一致程度 |

应用模板会载入当前语言的样例问题和标准。项目验证模板会保留已输入的正文，便于粘贴自己的方案。切换语言时，仅自动翻译未修改的示例字段；自己输入或改写的文字保持原样。页面不会翻译模型已经返回的原始数据。

## English

The page includes 12 editable examples. Each sends the same text as State and asks three independent questions: Choice selects a category or action, Noul gives the probability of one yes/no condition, and Score rates an ordered degree. Templates configure judgments; they do not execute refunds, releases or blocks. Check outputs against real data and deterministic rules.

| Template | Choice | Noul | Score |
| --- | --- | --- | --- |
| Project validation stage | Next validation stage | Whether a small demo is feasible | Strength of customer/payment evidence |
| Support ticket routing | Main team | Explicit refund request | Expressed frustration |
| Bug report triage | Affected feature | Available workaround | Degree of export blockage |
| Agent model routing | Processing path | Need for external context | Reasoning complexity |
| Agent tool selection | Next tool | Authorization for a write | Side effects of the required action |
| Agent next step | Continue, stop, review, etc. | Required facts observed | Readiness to answer |
| RAG passage selection | Passage-to-question relationship | Direct answer present | Answer relevance |
| Citation support check | Evidence-to-claim relationship | Explicit support for the key fact | Evidence strength |
| Candidate value selection | Matching pre-extracted value | Target value explicitly present | Mapping ambiguity |
| Agent release change | Semantic change in a tool description | Whether side effects expand | Potential behavior impact |
| Agent input guard | Handling route | Instruction injection attempt | Risk under the supplied policy |
| Product-doc change impact | Content needing an update | Explicit outdated number | Product/document mismatch |

Applying a template loads its example questions and criteria in the current language. The project-validation template keeps the text you entered. Changing language translates only untouched sample fields; your own edits stay as written. The page does not translate raw model responses already returned.

The template directions draw on [TypeSafe's use-case map](https://docs.typesafe.ai/concepts/use-case-map), its [RAG classification cookbook](https://docs.typesafe.ai/cookbooks/rag_classification), and themes indexed by the community [Jev-Case](https://github.com/Hiwoniu/Jev-Case) repository. Jev-Case collects published examples rather than ready-to-run API templates. This project's prompts, labels, sample states and ordered levels were written for this application.
