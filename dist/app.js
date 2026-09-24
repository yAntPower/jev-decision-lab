import { TYPES, LABELS, assemble, requestPlan, readAnswer, parseJSON, retryDelay, runPlan, criteriaRows, criteriaFromForm, validatePayload } from "./core.js";

import { TEMPLATES, TEMPLATE_ORDER, translateTemplateEdits } from "./presets.js";
import { EN, getLocale, setLocale, tr } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const pretty = (value) => JSON.stringify(value, null, 2);
const percent = (value) => `${(value * 100).toFixed(1)}%`;
const duration = (ms) => ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
const describe = (value) => typeof value === "string" ? value : JSON.stringify(value);
const ZH_BY_EN = new Map(Object.entries(EN).map(([zh, en]) => [en, zh]));
const chineseSource = (value) => Object.hasOwn(EN, value) ? value : ZH_BY_EN.get(value);
function translateExisting(id, before) {
  const element = $(id);
  const previous = element.textContent;
  const chinese = before === "en" ? ZH_BY_EN.get(previous) : previous;
  if (chinese && Object.hasOwn(EN, chinese)) element.textContent = tr(chinese);
}
try { setLocale(localStorage.getItem("jev-decision-lab-language")); } catch { /* private browsing may deny storage */ }
const staticText = [];
const staticAttributes = [];
function captureStaticText() {
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  for (let item = walker.nextNode(); item; item = walker.nextNode()) {
    const original = item.nodeValue;
    const chinese = chineseSource(original.trim());
    if (chinese) staticText.push({ item, original, chinese });
  }
  for (const element of document.querySelectorAll("[placeholder], [aria-label], meta[name=description]")) {
    for (const name of ["placeholder", "aria-label", "content"]) {
      const original = element.getAttribute(name);
      const chinese = original && chineseSource(original);
      if (chinese) staticAttributes.push({ element, name, chinese });
    }
  }
}
function renderStaticText() {
  const language = getLocale();
  document.documentElement.lang = language === "en" ? "en" : "zh-CN";
  for (const { item, original, chinese } of staticText) {
    if (!item.isConnected) continue;
    const translated = language === "en" ? EN[chinese] : chinese;
    item.nodeValue = original.replace(original.trim(), translated);
  }
  for (const { element, name, chinese } of staticAttributes) {
    if (element.isConnected) element.setAttribute(name, language === "en" ? EN[chinese] : chinese);
  }
}
function renderTemplateOptions() {
  const selected = $("scenario-select").value || currentPreset;
  $("scenario-select").replaceChildren(...TEMPLATE_ORDER.map((id) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = TEMPLATES[id][getLocale()].title;
    return option;
  }));
  $("scenario-select").value = selected;
  if (!$("scenario-select").value) $("scenario-select").value = currentPreset;
  renderTemplateInfo();
}
function renderTemplateInfo() {
  const template = TEMPLATES[$("scenario-select").value]?.[getLocale()];
  if (!template) return;
  $("template-title").textContent = template.title;
  $("template-summary").textContent = template.summary;
  for (const type of TYPES) $(`template-${type}`).textContent = template.drafts[type].instructions;
}
function mergeTemplateLanguage(from, to) {
  const previous = $("state-input").value;
  const translated = translateTemplateEdits(currentPreset, from, to, previous, drafts);
  $("state-input").value = translated.state;
  drafts = translated.drafts;
  if (previous !== translated.state) contentRevision++;
}
captureStaticText();
const META = {
  choice: { caption: "从定义好的选项中选择一个，返回选项、概率分布和置信度。", criteria: "JSON 对象：选项名 → 描述。可用 null 省略描述，最多 255 个选项。", hint: "选项应覆盖可能答案，必要时加入 other。", empty: "选中的选项与完整概率分布" },
  noul: { caption: "判断一个条件是否成立，返回“是”的概率，范围为 0–1。", criteria: "可选 JSON 对象：用 true / false 描述两种情况。留空会省略 criteria。", hint: "接近 0.5 表示是与否的概率相近，不代表中等程度。", empty: "“是”的概率 · 不含单独的 confidence" },
  score: { caption: "沿着你定义的有序等级评分，结果可以落在两个等级之间。", criteria: "JSON 数组：2–10 个等级，按从低到高排列。等级编号从 0 开始。", hint: "例如 3 个等级对应 0–2 分；每个等级应有独立含义。", empty: "加权评分、等级概率与置信度" },
};

let drafts = structuredClone(TEMPLATES.support[getLocale()].drafts);
let activeType = "noul";
let contentRevision = 0;
let currentPreset = "support";
let loadedProposal = null;
let serviceVerified = false;
let serverReady = false;
let connecting = false;
let initializing = true;
let activeController = null;
let runStarted = 0;
let records = [];
let lastRun = null;
const results = Object.fromEntries(TYPES.map((type) => [type, { status: "idle" }]));
let toastTimer;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 3000);
}

function clearError() {
  $("form-error").hidden = true;
  document.querySelectorAll('[aria-invalid="true"]').forEach((element) => element.removeAttribute("aria-invalid"));
}

function showError(error) {
  $("form-error").textContent = error.message || String(error);
  $("form-error").hidden = false;
  const type = TYPES.find((item) => error.message?.startsWith(LABELS[item]));
  if (type && type !== activeType) selectType(type);
  if (error.field && $(error.field)) {
    $(error.field).setAttribute("aria-invalid", "true");
    $(error.field).focus();
  }
}

function editorConfig() {
  return { stateText: $("state-input").value, stateFormat: "text", model: $("model-input").value, drafts };
}

function payloadFor(types = TYPES) { return assemble(editorConfig(), types); }

function snapshotFor(type) {
  try { return JSON.stringify(payloadFor([type])); } catch { return "invalid"; }
}

function selectType(type) {
  activeType = type;
  for (const item of TYPES) {
    $(`tab-${item}`).setAttribute("aria-selected", String(item === type));
    $(`tab-${item}`).tabIndex = item === type ? 0 : -1;
  }
  $("question-editor").setAttribute("aria-labelledby", `tab-${type}`);
  $("type-caption").textContent = tr(META[type].caption);
  $("type-doc").href = `https://docs.typesafe.ai/primitives/${type}`;
  $("criteria-description").textContent = tr(META[type].criteria);
  $("question-hint").textContent = tr(META[type].hint);
  $("question-id").value = drafts[type].id;
  $("instructions-format").value = drafts[type].format;
  $("instructions-input").value = drafts[type].instructions;
  $("criteria-input").value = drafts[type].criteria;
  $("criteria-mode").value = drafts[type].criteriaMode;
  renderCriteriaEditor();
  $("run-current").textContent = getLocale() === "en" ? `Run ${LABELS[type]} only ↗` : `仅运行 ${LABELS[type]} ↗`;
  refreshPreview();
  updateControls();
}

function renderCriteriaEditor() {
  const draft = drafts[activeType];
  const useForm = draft.criteriaMode === "form";
  $("criteria-fields").hidden = !useForm;
  $("criteria-json-editor").hidden = useForm;
  $("add-criterion").hidden = !useForm || activeType === "noul";
  $("add-criterion").textContent = activeType === "score" ? tr("＋ 添加等级") : tr("＋ 添加选项");
  $("criteria-description").textContent = tr(!useForm ? META[activeType].criteria : activeType === "choice" ? "每项填写一个名称和描述，描述可以留空。选项名称不能重复。" : activeType === "noul" ? "分别描述什么算“是”、什么算“否”。都留空时，仅按上面的问题判断。" : "按从低到高的顺序描述 2–10 个等级，编号由页面自动生成。");
  $("criteria-fields").replaceChildren();
  if (!useForm) return;
  draft.rows.forEach((row, index) => {
    const container = node("div", "criterion-row");
    const heading = node("div", "criterion-heading");
    if (activeType === "choice") {
      const label = node("label", "criterion-key-label", getLocale() === "en" ? `Option ${index + 1}` : `选项 ${index + 1}`);
      label.htmlFor = `criterion-key-${index}`;
      const keyInput = node("input");
      keyInput.id = label.htmlFor;
      keyInput.value = row.key;
      keyInput.setAttribute("data-edit", "");
      keyInput.addEventListener("input", () => { row.key = keyInput.value; changed(); });
      heading.append(label, keyInput);
    } else heading.append(node("strong", "", activeType === "noul" ? tr(row.key === "true" ? "什么情况算“是”" : "什么情况算“否”") : getLocale() === "en" ? `Level ${index} · ${tr(index === 0 ? "最低" : index === draft.rows.length - 1 ? "最高" : "中间等级")}` : `等级 ${index} · ${index === 0 ? "最低" : index === draft.rows.length - 1 ? "最高" : "中间等级"}`));
    if (activeType !== "noul") {
      const remove = node("button", "text-button", tr("移除"));
      remove.type = "button";
      remove.setAttribute("data-edit", "");
      remove.setAttribute("aria-label", getLocale() === "en" ? `Remove ${activeType} item ${index + 1}` : `移除第 ${index + 1} 个${activeType === "score" ? "等级" : "选项"}`);
      remove.addEventListener("click", () => { draft.rows.splice(index, 1); renderCriteriaEditor(); changed(); });
      heading.append(remove);
    }
    const label = node("label", "sr-only", getLocale() === "en" ? `${activeType === "score" ? "Level" : "Criterion"} ${index + 1} description` : `${activeType === "score" ? "等级" : "标准"} ${index + 1} 的描述`);
    label.htmlFor = `criterion-description-${index}`;
    const description = node("textarea");
    description.id = label.htmlFor;
    description.rows = activeType === "choice" ? 2 : 3;
    description.value = typeof row.description === "string" ? row.description : describe(row.description);
    description.placeholder = tr(activeType === "score" ? "用一句话描述这个等级" : "填写判断标准（可选）");
    description.setAttribute("data-edit", "");
    description.addEventListener("input", () => { row.description = description.value; changed(); });
    container.append(heading, label, description);
    $("criteria-fields").append(container);
  });
}

function updateControls() {
  const busy = Boolean(activeController);
  document.querySelectorAll("[data-edit]").forEach((element) => { element.disabled = busy; });
  $("check-service").disabled = initializing || connecting || busy || location.protocol === "file:";
  $("check-service").textContent = tr(connecting ? "正在检查…" : "重新检查");
  $("run-all").disabled = !serviceVerified || busy || connecting;
  $("run-current").disabled = !serviceVerified || busy || connecting;
  $("cancel-button").hidden = !busy;
  $("cancel-button").disabled = Boolean(activeController?.signal.aborted);
  $("run-all").textContent = busy ? tr("正在评估…") : `▶ ${tr("运行全部 3 个问题")}`;
  $("add-criterion").disabled = busy || drafts[activeType].rows.length >= (activeType === "score" ? 10 : 255);
}

function refreshPreview() {
  const scope = $("preview-scope").value;
  try {
    const payload = payloadFor(scope === "current" ? [activeType] : TYPES);
    $("request-json").textContent = pretty(scope === "parallel" ? requestPlan(payload, "parallel") : payload);
    $("copy-request").disabled = false;
  } catch (error) {
    $("request-json").textContent = `${tr("请求尚未通过校验")}\n\n${error.message}`;
    $("copy-request").disabled = true;
  }
  $("state-count").textContent = getLocale() === "en" ? `${$("state-input").value.length.toLocaleString("en")} characters` : `${$("state-input").value.length.toLocaleString("zh-CN")} 字符`;
}

function changed() {
  clearError();
  refreshPreview();
  renderResults();
  updateControls();
}

function loadExample(name, notify = true) {
  const example = TEMPLATES[name]?.[getLocale()];
  if (!example) return;
  currentPreset = name;
  drafts = structuredClone(example.drafts);
  if (name !== "feasibility") { $("state-input").value = example.state; contentRevision++; loadedProposal = null; }
  selectType(activeType);
  changed();
  if (notify) toast(tr(name === "feasibility" ? "可行性问题已载入，正文保持不变。" : "文本示例和问题已载入。"));
}

async function loadProposal(notify = true) {
  const revision = contentRevision;
  const language = getLocale();
  try {
    const response = await fetch(language === "en" ? "./examples/proposal.en.md" : "./examples/proposal.md", { cache: "no-store" });
    if (!response.ok) throw new Error(tr("未能载入方案，请直接粘贴正文。"));
    const text = await response.text();
    if (contentRevision !== revision || activeController || getLocale() !== language) return;
    $("state-input").value = text;
    contentRevision++;
    loadedProposal = { language, text };
    $("scenario-select").value = "feasibility";
    loadExample("feasibility", false);
    renderTemplateInfo();
    if (notify) toast(tr("虚构方案示例已载入，可编辑后评估。"));
  } catch (error) { if (notify) showError(error); }
}

async function translateLoadedProposal(previous) {
  const revision = contentRevision;
  const language = getLocale();
  try {
    const response = await fetch(language === "en" ? "./examples/proposal.en.md" : "./examples/proposal.md", { cache: "no-store" });
    if (!response.ok) return;
    const text = await response.text();
    if (contentRevision !== revision || activeController || getLocale() !== language || $("state-input").value !== previous.text) return;
    $("state-input").value = text;
    loadedProposal = { language, text };
    contentRevision++;
    changed();
  } catch { /* Keep the current text if the sample file is unavailable. */ }
}

function changeLanguage(language) {
  if (activeController) return;
  const before = getLocale();
  if (language === before) return;
  const previousProposal = loadedProposal && $("state-input").value === loadedProposal.text ? loadedProposal : null;
  mergeTemplateLanguage(before, language);
  setLocale(language);
  try { localStorage.setItem("jev-decision-lab-language", getLocale()); } catch { /* language remains usable */ }
  renderStaticText();
  renderTemplateOptions();
  selectType(activeType);
  $("mode-description").textContent = tr($("run-mode").value === "batch" ? "同一份 State 发送一次，三个问题由 TypeSafe 并行评估。" : "同时发送三个独立 HTTP 请求，每个请求包含一个问题；State 会重复发送三次。");
  for (const id of ["health-status", "connection-status", "run-status", "results-status", "form-error"]) translateExisting(id, before);
  if (lastRun) {
    const succeeded = TYPES.filter((type) => results[type].status === "success").length;
    const failed = TYPES.filter((type) => results[type].status === "error").length;
    const cancelled = TYPES.filter((type) => results[type].status === "cancelled").length;
    const summary = getLocale() === "en" ? `${succeeded} succeeded${failed ? ` · ${failed} failed` : ""}${cancelled ? ` · ${cancelled} cancelled` : ""}` : `${succeeded} 个成功${failed ? ` · ${failed} 个失败` : ""}${cancelled ? ` · ${cancelled} 个已取消` : ""}`;
    $("results-status").textContent = summary;
    $("run-status").textContent = getLocale() === "en" ? `Run finished: ${summary}; total time ${$("metric-latency").textContent}.` : `本次运行结束：${summary}，总耗时 ${$("metric-latency").textContent}。`;
  }
  $("toast").hidden = true;
  renderResults();
  updateRaw();
  updateControls();
  if (previousProposal && previousProposal.language !== language) void translateLoadedProposal(previousProposal);
}

function friendlyError(status, body, retryAfter) {
  const explanations = {
    400: "请求格式无效，请检查输入。", 401: "模型服务认证失败，请联系部署者检查服务配置。",
    402: "模型服务额度不足，请联系维护者。", 403: "模型服务没有调用权限，请联系维护者。",
    404: "接口或模型不存在，请检查模型名称。", 413: "请求体过大，请缩短输入。",
    422: "TypeSafe 未通过参数校验，请查看原始响应中的字段说明。",
    429: "请求达到限流，请稍后重试。", 529: "TypeSafe 暂时过载，请稍后重试。",
    502: "连接 TypeSafe 失败，请检查网络或代理。", 503: "TypeSafe 暂时不可用。", 504: "请求超时，请稍后重试。",
  };
  const detail = typeof body?.error === "string" ? body.error : typeof body?.error?.message === "string" ? body.error.message : typeof body?.message === "string" ? body.message : "";
  const message = explanations[status] ? tr(explanations[status]) : getLocale() === "en" ? `Request failed (HTTP ${status}).` : `请求失败（HTTP ${status}）。`;
  const localizedDetail = tr(detail);
  return `${message}${localizedDetail && !message.includes(localizedDetail) ? ` ${localizedDetail}` : ""}${retryAfter ? ` Retry-After: ${retryAfter}` : ""}`;
}

async function requestJSON(path, { method = "GET", body, signal } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 65_000);
  try {
    const response = await fetch(path, {
      method, credentials: "omit", cache: "no-store", redirect: "error",
      headers: body === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!response.ok) {
      const error = new Error(friendlyError(response.status, data, response.headers.get("retry-after")));
      Object.assign(error, { status: response.status, body: data, retryAfter: response.headers.get("retry-after") });
      throw error;
    }
    if (typeof data === "string" || data === null) throw Object.assign(new Error(tr("接口没有返回有效的 JSON 对象。请查看原始响应。")), { body: data, status: response.status });
    return { data, status: response.status, requestId: response.headers.get("x-request-id") };
  } catch (error) {
    if (timedOut) throw new Error(tr("等待服务响应超时（65 秒），请稍后重试。"));
    if (controller.signal.aborted) throw new DOMException(tr("请求已取消。"), "AbortError");
    if (error instanceof TypeError) throw new Error(tr("无法连接服务，请检查网络或联系站点维护者。"));
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException(tr("请求已取消。"), "AbortError"));
    const abort = () => { clearTimeout(timer); reject(new DOMException(tr("请求已取消。"), "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function sendWithRetry(request, signal) {
  const started = performance.now();
  const attempts = [];
  const types = Object.values(request.questions).map((question) => question.type);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await requestJSON("/api/systemone", { method: "POST", body: request, signal });
      attempts.push({ attempt: attempt + 1, status: response.status });
      return { ...response, elapsedMs: performance.now() - started, attempts };
    } catch (error) {
      attempts.push({ attempt: attempt + 1, status: error.status ?? null, message: error.message, body: error.body ?? null });
      const delay = retryDelay(error.retryAfter, attempt);
      if (signal.aborted || !$("auto-retry").checked || attempt >= 2 || ![429, 529].includes(error.status) || delay > 60_000) {
        Object.assign(error, { elapsedMs: performance.now() - started, attempts });
        throw error;
      }
      types.forEach((type) => { results[type].progress = getLocale() === "en" ? `Retry ${attempt + 1} in ${Math.ceil(delay / 1000)} seconds` : `${Math.ceil(delay / 1000)} 秒后第 ${attempt + 1} 次重试`; });
      renderResults();
      try { await abortableDelay(delay, signal); }
      catch (abortError) { throw Object.assign(abortError, { elapsedMs: performance.now() - started, attempts }); }
      types.forEach((type) => { results[type].progress = `${tr("正在重试")} · ${attempt + 1}/2`; });
      renderResults();
    }
  }
}

function renderResults() {
  for (const type of TYPES) {
    const result = results[type];
    const content = $(`${type}-content`);
    const badge = $(`${type}-status`);
    const card = content.closest("article");
    card.setAttribute("aria-busy", String(result.status === "loading"));
    content.replaceChildren();
    const stale = result.status === "success" && result.snapshot !== snapshotFor(type);
    badge.className = `result-badge ${stale ? "stale" : result.status}`;
    badge.textContent = tr(stale ? "输入已更新" : ({ idle: "未运行", loading: "请求中", success: "已返回", error: "失败", cancelled: "已取消" }[result.status]));
    if (result.status === "idle" || result.status === "loading") {
      const empty = node("div", "empty-result");
      empty.append(node("span", result.status === "loading" ? "spinner" : "empty-mark", result.status === "idle" ? "{ }" : undefined));
      empty.append(node("strong", "", result.status === "loading" ? result.progress || tr("等待 TypeSafe 返回") : tr("等待真实响应")));
      empty.append(node("span", "", tr(META[type].empty)));
      content.append(empty);
      continue;
    }
    if (result.status === "error" || result.status === "cancelled") {
      content.append(node("p", "result-error", result.message));
      if (result.status === "error") {
        const detailButton = node("button", "text-button", tr("查看原始响应 ↓"));
        detailButton.type = "button";
        detailButton.addEventListener("click", () => { $("response-details").open = true; $("response-details").scrollIntoView({ block: "nearest", behavior: "smooth" }); });
        content.append(detailButton);
      }
    } else {
      const answer = result.answer;
      if (stale) content.append(node("p", "stale-note", tr("这是之前输入的结果，请重新运行以更新。")));
      content.append(node("p", "result-label", tr(type === "choice" ? "选中的选项" : type === "noul" ? "P(是) · yes probability" : "概率加权评分")));
      const value = node("div", "result-value", type === "choice" ? answer.choice : type === "noul" ? percent(answer.noul) : answer.score.toFixed(3).replace(/\.?0+$/, ""));
      if (type === "score") value.append(node("span", "scale", `/ ${answer.max}`));
      content.append(value);
      if (type === "choice" && result.question.criteria[answer.choice] !== null) content.append(node("p", "result-detail", describe(result.question.criteria[answer.choice])));
      if (type !== "noul") content.append(node("p", "result-detail", `${tr("置信度")} ${percent(answer.confidence)}`));
      const subtitle = node("div", "result-subtitle");
      subtitle.append(node("span", "", tr("概率分布")), node("span", "", getLocale() === "en" ? `${type === "noul" ? 2 : answer.rows.length} ${type === "noul" ? "outcomes" : type === "score" ? "levels" : "options"}` : type === "noul" ? "2 个结果" : `${answer.rows.length} 个${type === "score" ? "等级" : "选项"}`));
      content.append(subtitle);
      for (const [key, prob] of answer.rows) {
        const row = node("div", "probability-row");
        const line = node("div", "probability-line");
        const label = type === "score" ? `${key} · ${describe(answer.legend[key])}` : type === "noul" ? tr(key) : key;
        line.append(node("span", "", label), node("span", "", percent(prob)));
        const track = node("div", "probability-track");
        track.setAttribute("aria-hidden", "true");
        const fill = node("div", "probability-fill");
        fill.style.width = `${prob * 100}%`;
        track.append(fill);
        row.append(line, track);
        content.append(row);
      }
      content.append(node("p", "result-note", tr(type === "noul" ? "这里的数值是“是”的概率，不是程度评分，也不含单独的 confidence。" : type === "score" ? "评分是等级编号的概率加权平均；confidence 描述概率的集中程度。" : "confidence 描述概率分布的集中程度，不等于答案正确率。")));
    }
    content.append(node("div", "result-source", `${result.id} · ${result.time}${result.elapsedMs !== undefined ? ` · ${duration(result.elapsedMs)}` : ""}`));
  }
}

function rawEnvelope() {
  return { endpoint: "https://api.typesafe.ai/v1/systemone", mode: lastRun?.mode, startedAt: lastRun?.startedAt, requests: records };
}

function updateRaw() {
  $("response-json").textContent = records.length ? pretty(rawEnvelope()) : tr("请求正在进行，等待响应…");
  $("response-count").textContent = getLocale() === "en" ? `${records.length} HTTP requests finished` : `${records.length} 个 HTTP 请求已结束`;
  $("copy-response").disabled = records.length === 0;
  $("export-results").disabled = records.length === 0;
  const successful = records.filter((record) => record.response && record.status >= 200 && record.status < 300);
  const usages = successful.map((record) => record.response.usage);
  if (usages.length && usages.every((usage) => Number.isFinite(usage?.input_tokens) && Number.isFinite(usage?.output_tokens))) {
    $("metric-tokens").textContent = `${usages.reduce((sum, usage) => sum + usage.input_tokens, 0).toLocaleString()} / ${usages.reduce((sum, usage) => sum + usage.output_tokens, 0).toLocaleString()}`;
  } else $("metric-tokens").textContent = "—";
  const models = [...new Set(successful.map((record) => record.response.model).filter((model) => typeof model === "string"))];
  $("metric-model").textContent = models.join(" · ") || "—";
}

async function run(types = TYPES, mode = $("run-mode").value) {
  if (activeController) throw new Error(tr("已有请求正在运行。"));
  if (!serviceVerified) throw new Error(tr("模型服务尚未就绪，请先检查服务状态。"));
  const payload = payloadFor(types);
  clearError();
  const controller = new AbortController();
  activeController = controller;
  runStarted = performance.now();
  records = [];
  lastRun = { mode: types.length === 1 ? "single" : mode, startedAt: new Date().toISOString() };
  for (const [id, question] of Object.entries(payload.questions)) {
    results[question.type] = { status: "loading", id, question, snapshot: snapshotFor(question.type), time: new Date().toLocaleTimeString(getLocale() === "en" ? "en-US" : "zh-CN", { hour12: false }) };
  }
  $("run-status").textContent = types.length === 1 ? getLocale() === "en" ? `Sending ${LABELS[types[0]]} request…` : `正在发送 ${LABELS[types[0]]} 请求…` : tr(mode === "batch" ? "正在发送 1 个请求，并行评估 3 个问题…" : "正在并发发送 3 个独立请求…");
  $("results-status").textContent = tr("正在运行");
  $("metric-latency").textContent = getLocale() === "en" ? "Timing…" : "计时中…";
  updateControls();
  renderResults();
  updateRaw();
  const clock = setInterval(() => { $("metric-latency").textContent = duration(performance.now() - runStarted); }, 100);
  try {
    await runPlan(payload, mode, (request) => sendWithRetry(request, controller.signal), ({ request, response, error }) => {
      records.push({ questionIds: Object.keys(request.questions), request, status: response?.status ?? error?.status ?? null, elapsedMs: Math.round(response?.elapsedMs ?? error?.elapsedMs ?? 0), requestId: response?.requestId ?? null, attempts: response?.attempts ?? error?.attempts ?? [], ...(error ? { error: error.message, response: error.body ?? null } : { response: response.data }) });
      for (const [id, question] of Object.entries(request.questions)) {
        const result = results[question.type];
        result.elapsedMs = response?.elapsedMs ?? error?.elapsedMs;
        if (error) {
          result.status = error.name === "AbortError" ? "cancelled" : "error";
          result.message = error.message;
          if ([401, 403].includes(error.status) || error.body?.code === "SERVICE_NOT_CONFIGURED") {
            serviceVerified = false;
            $("connection-status").textContent = tr("模型服务配置失效，请联系部署者处理后重新检查。");
            $("health-status").textContent = tr("模型服务未就绪");
            $("health-status").classList.remove("ready");
          }
        } else {
          try { result.answer = readAnswer(response.data, id, question); result.status = "success"; }
          catch (parseError) { result.status = "error"; result.message = parseError.message; }
        }
      }
      updateRaw();
      renderResults();
    });
  } finally {
    clearInterval(clock);
    const elapsedMs = performance.now() - runStarted;
    activeController = null;
    $("metric-latency").textContent = duration(elapsedMs);
    const succeeded = types.filter((type) => results[type].status === "success").length;
    const failed = types.filter((type) => results[type].status === "error").length;
    const cancelled = types.filter((type) => results[type].status === "cancelled").length;
    const summary = getLocale() === "en" ? `${succeeded} succeeded${failed ? ` · ${failed} failed` : ""}${cancelled ? ` · ${cancelled} cancelled` : ""}` : `${succeeded} 个成功${failed ? ` · ${failed} 个失败` : ""}${cancelled ? ` · ${cancelled} 个已取消` : ""}`;
    $("results-status").textContent = summary;
    $("run-status").textContent = getLocale() === "en" ? `Run finished: ${summary}; total time ${duration(elapsedMs)}.` : `本次运行结束：${summary}，总耗时 ${duration(elapsedMs)}。`;
    updateControls();
  }
  return { ...rawEnvelope(), outcomes: Object.fromEntries(types.map((type) => [type, { status: results[type].status, ...(results[type].status === "success" ? { answer: results[type].answer } : { message: results[type].message }) }])) };
}

async function copy(text) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const helper = node("textarea", "sr-only");
      helper.value = text;
      document.body.append(helper);
      helper.select();
      const ok = document.execCommand("copy");
      helper.remove();
      if (!ok) throw new Error("clipboard unavailable");
    }
    toast(tr("已复制 JSON"));
  } catch { toast(tr("浏览器未允许复制，请直接选中 JSON 复制。")); }
}

function populateModels(models) {
  if (!Array.isArray(models)) return;
  $("model-list").replaceChildren(...models.map((model) => {
    const option = document.createElement("option");
    option.value = model.name;
    option.textContent = model.description || model.name;
    return option;
  }));
}

async function checkService() {
  if (connecting || activeController) return;
  connecting = true;
  serviceVerified = false;
  serverReady = false;
  $("health-status").classList.remove("ready");
  $("connection-status").textContent = tr("正在检查模型服务…");
  updateControls();
  try {
    const { data: health } = await requestJSON("/api/health");
    if (health.ok !== true) throw new Error(tr("服务状态响应异常，请联系维护者。"));
    serverReady = true;
    $("server-warning").hidden = true;
    if (!health.environmentKeyAvailable) {
      $("health-status").textContent = tr("服务待配置");
      $("connection-status").textContent = tr("部署者尚未完成模型服务配置，暂时无法运行。");
      $("run-status").textContent = tr("服务配置完成后，点击“重新检查”即可继续。");
      return;
    }
    const { data } = await requestJSON("/api/models");
    populateModels(data.models);
    serviceVerified = true;
    $("health-status").textContent = tr("服务已就绪");
    $("health-status").classList.add("ready");
    $("connection-status").textContent = tr("模型服务已连接，直接填写内容并运行。");
    $("run-status").textContent = tr("可以运行当前问题或全部 3 个问题。");
  } catch (error) {
    $("health-status").textContent = tr("服务连接失败");
    $("connection-status").textContent = error.message;
    $("run-status").textContent = tr("暂时无法运行，请稍后重新检查服务。");
    $("server-warning").hidden = serverReady;
  } finally { connecting = false; updateControls(); }
}

$("check-service").addEventListener("click", () => { void checkService(); });

for (const type of TYPES) {
  $(`tab-${type}`).addEventListener("click", () => selectType(type));
  $(`tab-${type}`).addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === "Home" ? 0 : event.key === "End" ? 2 : (TYPES.indexOf(type) + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    selectType(TYPES[index]);
    $(`tab-${TYPES[index]}`).focus();
  });
}

for (const [id, key] of [["question-id", "id"], ["instructions-input", "instructions"], ["criteria-input", "criteria"]]) {
  $(id).addEventListener("input", () => { drafts[activeType][key] = $(id).value; changed(); });
}
$("instructions-format").addEventListener("change", () => {
  const draft = drafts[activeType];
  if ($("instructions-format").value === "json") draft.instructions = pretty(draft.instructions);
  else {
    try { const parsed = JSON.parse(draft.instructions); draft.instructions = typeof parsed === "string" ? parsed : pretty(parsed); } catch { /* preserve unfinished input */ }
  }
  draft.format = $("instructions-format").value;
  $("instructions-input").value = draft.instructions;
  changed();
});
$("state-input").addEventListener("input", () => { contentRevision++; loadedProposal = null; changed(); });
$("model-input").addEventListener("input", changed);
$("language-select").addEventListener("change", () => changeLanguage($("language-select").value));
$("scenario-select").addEventListener("change", renderTemplateInfo);
$("load-example").addEventListener("click", () => loadExample($("scenario-select").value));
$("load-proposal").addEventListener("click", () => { void loadProposal(); });
$("reset-question").addEventListener("click", () => { drafts[activeType] = structuredClone(TEMPLATES[currentPreset][getLocale()].drafts[activeType]); selectType(activeType); changed(); });
$("criteria-mode").addEventListener("change", () => {
  const draft = drafts[activeType];
  try {
    if ($("criteria-mode").value === "json") {
      const value = criteriaFromForm(activeType, draft.rows);
      draft.criteria = value === undefined ? "" : pretty(value);
      $("criteria-input").value = draft.criteria;
    } else {
      const value = draft.criteria.trim() ? parseJSON(draft.criteria, `${LABELS[activeType]} criteria`, "criteria-input") : undefined;
      // Validate before converting, so an incomplete advanced edit is never lost.
      validatePayload({ model: "jev-latest", state: tr("标准格式检查"), questions: { criteria_check: { type: activeType, instructions: tr("检查标准"), ...(value === undefined ? {} : { criteria: value }) } } });
      draft.rows = criteriaRows(activeType, value);
    }
    draft.criteriaMode = $("criteria-mode").value;
    renderCriteriaEditor();
    changed();
  } catch (error) { $("criteria-mode").value = draft.criteriaMode; showError(error); }
});
$("add-criterion").addEventListener("click", () => {
  const rows = drafts[activeType].rows;
  let next = rows.length + 1;
  while (rows.some((row) => row.key === (getLocale() === "en" ? `Option${next}` : `选项${next}`))) next++;
  rows.push({ key: activeType === "score" ? String(rows.length) : getLocale() === "en" ? `Option${next}` : `选项${next}`, description: "" });
  renderCriteriaEditor();
  changed();
  $(`criterion-${activeType === "choice" ? "key" : "description"}-${rows.length - 1}`).focus();
});
$("run-mode").addEventListener("change", () => {
  $("mode-description").textContent = tr($("run-mode").value === "batch" ? "同一份 State 发送一次，三个问题由 TypeSafe 并行评估。" : "同时发送三个独立 HTTP 请求，每个请求包含一个问题；State 会重复发送三次。");
  $("preview-scope").value = $("run-mode").value;
  refreshPreview();
});
$("preview-scope").addEventListener("change", refreshPreview);
$("format-criteria").addEventListener("click", () => {
  if (!$("criteria-input").value.trim() && activeType === "noul") return toast(tr("留空会省略 Noul criteria。"));
  try { drafts[activeType].criteria = pretty(parseJSON($("criteria-input").value, "criteria", "criteria-input")); $("criteria-input").value = drafts[activeType].criteria; changed(); }
  catch (error) { showError(error); }
});
$("run-all").addEventListener("click", () => { void run().catch(showError); });
$("run-current").addEventListener("click", () => { void run([activeType], "batch").catch(showError); });
$("cancel-button").addEventListener("click", () => { activeController?.abort(); $("run-status").textContent = tr("正在取消未完成的请求…"); updateControls(); });
$("copy-request").addEventListener("click", () => { void copy($("request-json").textContent); });
$("copy-response").addEventListener("click", () => { void copy($("response-json").textContent); });
$("export-results").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([pretty(rawEnvelope())], { type: "application/json" }));
  const link = node("a");
  link.href = url;
  link.download = `typesafe-response-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function initialize() {
  $("language-select").value = getLocale();
  renderStaticText();
  renderTemplateOptions();
  loadExample("support", false);
  $("scenario-select").value = "support";
  renderTemplateInfo();
  updateControls();
  if (location.protocol === "file:") {
    $("server-warning").hidden = false;
    $("health-status").textContent = tr("离线预览 · 未启动服务");
    $("connection-status").textContent = tr("请按部署文档启动服务后访问页面。");
    initializing = false;
    updateControls();
    return;
  }
  try { await checkService(); }
  finally { initializing = false; updateControls(); }
}

// Progressive enhancement: browsers without WebMCP use the same visible UI.
function registerTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const definitions = [
    {
      name: "get_typesafe_request_preview", title: tr("读取 TypeSafe 请求"),
      description: "Read the currently assembled request and completed results, without credentials or network calls.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("Expected an empty object.");
        return { serviceVerified, busy: Boolean(activeController), request: payloadFor(), lastRun: records.length ? rawEnvelope() : null };
      },
    },
    {
      name: "run_typesafe_questions", title: tr("运行 TypeSafe 问题"),
      description: "Send the visible, configured questions to TypeSafe using the deployer-configured server credential. This makes real API calls and may consume tokens; returns results after the UI updates.",
      inputSchema: { type: "object", properties: { type: { enum: ["all", ...TYPES] }, mode: { enum: ["batch", "parallel"] } }, required: ["type", "mode"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (!input || Object.keys(input).some((key) => !["type", "mode"].includes(key)) || !["all", ...TYPES].includes(input.type) || !["batch", "parallel"].includes(input.mode)) throw new Error("Invalid question type or mode.");
        return run(input.type === "all" ? TYPES : [input.type], input.type === "all" ? input.mode : "batch");
      },
    },
  ];
  for (const definition of definitions) {
    try { Promise.resolve(context.registerTool(definition, { signal: lifecycle.signal })).catch(() => {}); }
    catch { /* WebMCP is optional; native controls remain available. */ }
  }
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}

window.addEventListener("pagehide", () => { activeController?.abort(); });
void initialize();
registerTools();
