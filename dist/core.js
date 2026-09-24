import { getLocale, tr } from "./i18n.js";

export const TYPES = ["choice", "noul", "score"];
export const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const LABELS = { choice: "Choice", noul: "Noul", score: "Score" };

export class ValidationError extends Error {
  constructor(message, field = "") {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

export const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const structured = (value) => typeof value === "string" || isRecord(value) || Array.isArray(value);
const nonempty = (value) => structured(value) && (typeof value === "string" ? value.trim().length > 0 : Object.keys(value).length > 0);
const probability = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

export function parseJSON(text, label, field = "") {
  try { return JSON.parse(text); }
  catch (error) { throw new ValidationError(getLocale() === "en" ? `${label} is not valid JSON: ${error.message}` : `${label} 不是有效的 JSON：${error.message}`, field); }
}

export function criteriaRows(type, criteria) {
  if (type === "noul") return ["true", "false"].map((key) => ({ key, description: criteria?.[key] ?? "" }));
  if (type === "score") {
    if (!Array.isArray(criteria)) throw new ValidationError(tr("Score 的高级标准需要一个数组。"), "criteria-input");
    return criteria.map((description, index) => ({ key: String(index), description }));
  }
  if (!isRecord(criteria)) throw new ValidationError(tr("Choice 的高级标准需要一个对象。"), "criteria-input");
  return Object.entries(criteria).map(([key, description]) => ({ key, description: description ?? "" }));
}

export function criteriaFromForm(type, rows) {
  if (!Array.isArray(rows)) throw new ValidationError(tr("请填写判断标准。"), "criteria-fields");
  const clean = (value) => typeof value === "string" ? value.trim() : value;
  if (type === "score") {
    if (rows.length < 2 || rows.length > 10) throw new ValidationError(tr("Score 需要 2–10 个评分等级。"), "criteria-fields");
    return rows.map(({ description }, index) => {
      const value = clean(description);
      if (!nonempty(value)) throw new ValidationError(getLocale() === "en" ? `Score level ${index + 1} needs a description.` : `Score 第 ${index + 1} 个等级需要填写描述。`, `criterion-description-${index}`);
      return value;
    });
  }
  if (type === "noul") {
    const entries = rows.map(({ key, description }) => [key, clean(description)]).filter(([, description]) => description !== "");
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (rows.length < 1 || rows.length > 255) throw new ValidationError(tr("Choice 需要 1–255 个选项。"), "criteria-fields");
  const keys = new Set();
  return Object.fromEntries(rows.map(({ key, description }, index) => {
    key = key.trim();
    if (!key) throw new ValidationError(getLocale() === "en" ? `Choice option ${index + 1} needs a name.` : `Choice 第 ${index + 1} 个选项需要一个名称。`, `criterion-key-${index}`);
    if (keys.has(key)) throw new ValidationError(getLocale() === "en" ? `Choice option “${key}” is duplicated.` : `Choice 选项名称“${key}”重复了，请修改。`, `criterion-key-${index}`);
    keys.add(key);
    return [key, clean(description) === "" ? null : clean(description)];
  }));
}

export function validatePayload(payload) {
  if (!isRecord(payload)) throw new ValidationError(tr("请求必须是 JSON 对象。"));
  if (!nonempty(payload.state)) throw new ValidationError(tr("State 需要非空文本、JSON 对象或数组。"), "state-input");
  if (typeof payload.model !== "string" || !payload.model.trim() || payload.model.length > 128) {
    throw new ValidationError(tr("请填写有效的模型名称。"), "model-input");
  }
  if (!isRecord(payload.questions) || Object.keys(payload.questions).length < 1 || Object.keys(payload.questions).length > 3) {
    throw new ValidationError(tr("每次请求需要包含 1–3 个问题。"));
  }
  for (const [id, question] of Object.entries(payload.questions)) {
    if (!id.trim() || id.length > 96) throw new ValidationError(tr("问题 ID 不能为空，且不能超过 96 个字符。"), "question-id");
    if (!isRecord(question) || !TYPES.includes(question.type)) throw new ValidationError(getLocale() === "en" ? `${id} has an invalid question type.` : `${id} 的问题类型无效。`);
    const label = LABELS[question.type];
    if (!nonempty(question.instructions)) throw new ValidationError(getLocale() === "en" ? `${label} instructions need nonempty text, an object or an array.` : `${label} 的 instructions 需要非空文本、对象或数组。`, "instructions-input");
    const criteria = question.criteria;
    if (question.type === "choice") {
      if (!isRecord(criteria) || Object.keys(criteria).length < 1 || Object.keys(criteria).length > 255) {
        throw new ValidationError(tr("Choice 的 criteria 必须是包含 1–255 个选项的 JSON 对象。"), "criteria-input");
      }
      if (Object.entries(criteria).some(([key, value]) => !key.trim() || (value !== null && !nonempty(value)))) {
        throw new ValidationError(tr("Choice 选项名不能为空；描述应为非空文本、对象、数组或 null。"), "criteria-input");
      }
    } else if (question.type === "score") {
      if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10 || criteria.some((value) => !nonempty(value))) {
        throw new ValidationError(tr("Score 的 criteria 必须是含 2–10 个非空等级描述的数组，按从低到高排列。"), "criteria-input");
      }
    } else if (criteria !== undefined) {
      if (!isRecord(criteria) || Object.keys(criteria).some((key) => !["true", "false"].includes(key)) || Object.values(criteria).some((value) => !nonempty(value))) {
        throw new ValidationError(tr("Noul 的 criteria 仅支持 true / false 描述；也可以留空省略。"), "criteria-input");
      }
    }
  }
  return payload;
}

export function assemble({ stateText, stateFormat, model, drafts }, selectedTypes = TYPES) {
  const state = stateFormat === "json" ? parseJSON(stateText, "State", "state-input") : stateText;
  if (stateFormat !== "json" && typeof state === "string" && !state.trim()) throw new ValidationError(tr("请先输入需要评估的文本。"), "state-input");
  const entries = selectedTypes.map((type) => {
    const draft = drafts[type];
    const instructions = draft.format === "json" ? parseJSON(draft.instructions, `${LABELS[type]} instructions`, "instructions-input") : draft.instructions.trim();
    const question = { type, instructions };
    if (draft.criteriaMode === "form") {
      const criteria = criteriaFromForm(type, draft.rows);
      if (criteria !== undefined) question.criteria = criteria;
    } else if (draft.criteria.trim()) question.criteria = parseJSON(draft.criteria, `${LABELS[type]} criteria`, "criteria-input");
    return [draft.id.trim(), question];
  });
  if (new Set(entries.map(([id]) => id)).size !== entries.length) throw new ValidationError(tr("三个问题的 ID 必须互不相同。"), "question-id");
  return validatePayload({ model: model.trim(), state, questions: Object.fromEntries(entries) });
}

export function requestPlan(payload, mode = "batch") {
  validatePayload(payload);
  if (mode === "batch") return [payload];
  if (mode !== "parallel") throw new ValidationError(tr("发送方式无效。"));
  return Object.entries(payload.questions).map(([id, question]) => ({ model: payload.model, state: payload.state, questions: { [id]: question } }));
}

export function readAnswer(response, id, question) {
  if (!isRecord(response) || !isRecord(response.answers) || !Object.hasOwn(response.answers, id)) throw new Error(getLocale() === "en" ? `Response is missing answers.${id}; inspect the raw response.` : `响应缺少 answers.${id}，请查看原始响应。`);
  const answer = response.answers[id];
  if (!isRecord(answer) || answer.type !== question.type) throw new Error(getLocale() === "en" ? `${id} response type does not match the request.` : `${id} 的响应类型与请求不符。`);
  if (question.type === "noul") {
    if (!probability(answer.noul)) throw new Error(tr("Noul 响应缺少有效的 0–1 概率。"));
    return { ...answer, rows: [["是 · true", answer.noul], ["否 · false", 1 - answer.noul]] };
  }
  if (!probability(answer.confidence) || !isRecord(answer.probabilities)) throw new Error(tr("响应缺少有效的 confidence 或 probabilities。"));
  const expected = question.type === "choice" ? Object.keys(question.criteria) : question.criteria.map((_, index) => String(index));
  const distribution = answer.probabilities;
  if (Object.keys(distribution).length !== expected.length || expected.some((key) => !Object.hasOwn(distribution, key) || !probability(distribution[key]))) {
    throw new Error(tr("返回的概率分布与请求选项不匹配。"));
  }
  // Allow service-side rounding while rejecting a clearly malformed distribution.
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > Math.max(0.02, expected.length * 0.0001)) throw new Error(tr("响应中的概率之和不接近 1。"));
  if (question.type === "choice") {
    if (typeof answer.choice !== "string" || !Object.hasOwn(question.criteria, answer.choice)) throw new Error(tr("返回的 Choice 不是请求中的选项。"));
    return { ...answer, rows: Object.entries(distribution).sort((a, b) => b[1] - a[1]) };
  }
  const max = question.criteria.length - 1;
  if (typeof answer.score !== "number" || !Number.isFinite(answer.score) || answer.score < 0 || answer.score > max) throw new Error(getLocale() === "en" ? `Score is outside the 0–${max} level range.` : `Score 超出了 0–${max} 的等级范围。`);
  if (!isRecord(answer.legend) || expected.some((key) => !Object.hasOwn(answer.legend, key))) throw new Error(tr("Score 响应缺少完整的 legend。"));
  return { ...answer, max, rows: expected.map((key) => [key, distribution[key]]) };
}

export function retryDelay(header, attempt, now = Date.now()) {
  if (header !== null && header !== undefined && String(header).trim() !== "") {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  return 1000 * (2 ** attempt);
}

export async function runPlan(payload, mode, send, onSettled = () => {}) {
  // allSettled preserves successful answers even if another HTTP request fails.
  return Promise.allSettled(requestPlan(payload, mode).map(async (request) => {
    try {
      const response = await send(request);
      onSettled({ request, response });
      return response;
    } catch (error) {
      onSettled({ request, error });
      throw error;
    }
  }));
}
