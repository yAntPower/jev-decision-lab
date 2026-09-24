import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assemble, validatePayload, readAnswer, requestPlan, runPlan, retryDelay, criteriaFromForm, criteriaRows } from "../dist/core.js";
import { setLocale } from "../dist/i18n.js";
import { EXAMPLES } from "../dist/presets.js";

setLocale("zh");

function config() {
  return {
    stateText: '{"message":"Please refund the duplicate charge."}', stateFormat: "json", model: "jev-latest",
    drafts: {
      choice: { id: "route", format: "text", instructions: "Which team should handle the message?", criteria: '{"billing":"Charges and refunds","other":null}' },
      noul: { id: "refund", format: "text", instructions: "Is a refund requested?", criteria: "" },
      score: { id: "severity", format: "text", instructions: "How severe is the issue?", criteria: '["No impact","Limited impact","Serious impact"]' },
    },
  };
}

test("v1 assembly keeps structured state, named question IDs, and optional Noul criteria", () => {
  const payload = assemble(config());
  assert.deepEqual(Object.keys(payload).sort(), ["model", "questions", "state"]);
  assert.deepEqual(payload.state, { message: "Please refund the duplicate charge." });
  assert.equal(payload.questions.route.type, "choice");
  assert.equal(payload.questions.route.criteria.other, null);
  assert.equal(payload.questions.refund.type, "noul");
  assert.equal(Object.hasOwn(payload.questions.refund, "criteria"), false);
  assert.equal(payload.questions.severity.criteria.length, 3);
});

test("structured instructions and descriptions survive serialization", () => {
  const input = config();
  input.drafts.choice.format = "json";
  input.drafts.choice.instructions = '{"question":"Which team?","focus":["primary request"]}';
  input.drafts.choice.criteria = '{"billing":{"covers":["refunds"]},"other":null}';
  const payload = assemble(input, ["choice"]);
  assert.deepEqual(payload.questions.route.instructions.focus, ["primary request"]);
  assert.deepEqual(payload.questions.route.criteria.billing.covers, ["refunds"]);
});

test("malformed JSON, duplicate question IDs, and invalid state fail before sending", () => {
  const input = config();
  input.stateText = "{broken}";
  assert.throws(() => assemble(input), /State 不是有效的 JSON/);
  input.stateText = "null";
  assert.throws(() => assemble(input), /State 需要/);
  input.stateText = '"content"';
  input.drafts.noul.id = "route";
  assert.throws(() => assemble(input), /ID 必须互不相同/);
});

test("Score accepts 2–10 levels and Choice cannot exceed 255 options", () => {
  const payload = assemble(config());
  payload.questions.severity.criteria = ["one"];
  assert.throws(() => validatePayload(payload), /2–10/);
  payload.questions.severity.criteria = Array.from({ length: 10 }, (_, i) => `Level ${i}`);
  assert.doesNotThrow(() => validatePayload(payload));
  payload.questions.route.criteria = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`key${i}`, null]));
  assert.throws(() => validatePayload(payload), /1–255/);
});

test("single-question execution does not require unrelated drafts to be valid", () => {
  const input = config();
  input.drafts.score.criteria = "broken";
  assert.equal(Object.keys(assemble(input, ["noul"]).questions).length, 1);
});

test("question IDs such as __proto__ remain ordinary own properties", () => {
  const input = config();
  input.drafts.noul.id = "__proto__";
  const payload = assemble(input, ["noul"]);
  assert.equal(Object.hasOwn(payload.questions, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(payload.questions), Object.prototype);
});

test("parallel plan launches every request before awaiting and preserves partial success", async () => {
  const payload = assemble(config());
  const pending = [];
  const settled = [];
  const execution = runPlan(payload, "parallel", (request) => new Promise((resolve, reject) => {
    pending.push({ id: Object.keys(request.questions)[0], resolve, reject });
  }), (result) => settled.push(result));
  assert.equal(pending.length, 3, "All three calls must start before any completes");
  pending[1].reject(new Error("HTTP 429"));
  pending[2].resolve({ answers: { severity: { score: 1 } } });
  pending[0].resolve({ answers: { route: { choice: "billing" } } });
  const outcomes = await execution;
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ["fulfilled", "rejected", "fulfilled"]);
  assert.equal(settled.length, 3);
});

test("batch plan sends a single state and all three questions", async () => {
  const payload = assemble(config());
  let calls = 0;
  await runPlan(payload, "batch", async (request) => {
    calls++;
    assert.equal(Object.keys(request.questions).length, 3);
    assert.deepEqual(request.state, payload.state);
    return {};
  });
  assert.equal(calls, 1);
  assert.throws(() => requestPlan(payload, "unknown"));
});

test("Noul zero is a valid answer, not an absent value", () => {
  const answer = readAnswer({ answers: { refund: { type: "noul", noul: 0 } } }, "refund", assemble(config()).questions.refund);
  assert.deepEqual(answer.rows, [["是 · true", 0], ["否 · false", 1]]);
  assert.equal(Object.hasOwn(answer, "confidence"), false);
});

test("Score is evaluated against the actual level range, not 0–1", () => {
  const question = assemble(config()).questions.severity;
  const response = { answers: { severity: { type: "score", score: 1.75, confidence: 0.4, probabilities: { 0: 0, 1: 0.25, 2: 0.75 }, legend: { 0: "No impact", 1: "Limited impact", 2: "Serious impact" } } } };
  const answer = readAnswer(response, "severity", question);
  assert.equal(answer.max, 2);
  assert.equal(answer.score, 1.75);
  response.answers.severity.score = 3;
  assert.throws(() => readAnswer(response, "severity", question), /等级范围/);
});

test("response validation rejects missing answers and mismatched option sets", () => {
  const question = assemble(config()).questions.route;
  assert.throws(() => readAnswer({ answers: {} }, "route", question), /缺少 answers.route/);
  const response = { answers: { route: { type: "choice", choice: "billing", confidence: 1, probabilities: { billing: 1, unexpected: 0 } } } };
  assert.throws(() => readAnswer(response, "route", question), /选项不匹配/);
});

test("Retry-After respects both seconds and HTTP dates", () => {
  const now = Date.UTC(2026, 8, 22, 12);
  assert.equal(retryDelay("5", 0, now), 5000);
  assert.equal(retryDelay(new Date(now + 12000).toUTCString(), 0, now), 12000);
  assert.equal(retryDelay(null, 1, now), 2000);
  assert.equal(retryDelay("0", 0, now), 0);
});

test("pasted Chinese proposal, Markdown, quotes and code remain verbatim text", async () => {
  const text = ((await readFile(new URL("../dist/examples/proposal.md", import.meta.url), "utf8")) + '\n```yaml\nproject: "demo"\n```\n').repeat(50);
  const request = assemble({ stateText: text, stateFormat: "text", model: "jev-latest", drafts: EXAMPLES.feasibility.drafts });
  assert.equal(typeof request.state, "string");
  assert.equal(request.state, text);
  assert.equal(JSON.parse(JSON.stringify(request)).state, text);
  assert.ok(text.length > 10_000);
  assert.equal(Object.keys(request.questions).length, 3);
  assert.equal(request.questions.commercial_evidence.criteria.length, 5);
  assert.equal(request.questions.technical_feasibility.type, "noul");
});

test("even incomplete JSON pasted into text mode is literal input", () => {
  const text = '这份方案可行吗？\n```yaml\nrelease: 1.8.2\n```\n{unfinished: "quoted"';
  assert.equal(assemble({ stateText: text, stateFormat: "text", model: "jev-latest", drafts: EXAMPLES.feasibility.drafts }).state, text);
});

test("ordinary criteria forms produce typed API criteria and reject duplicate choices", () => {
  assert.deepEqual(criteriaFromForm("choice", [{ key: "可行", description: "可以实现" }, { key: "不确定", description: "" }]), { 可行: "可以实现", 不确定: null });
  assert.throws(() => criteriaFromForm("choice", [{ key: "可行", description: "A" }, { key: " 可行 ", description: "B" }]), /重复/);
  assert.equal(criteriaFromForm("noul", [{ key: "true", description: "" }, { key: "false", description: "" }]), undefined);
  assert.throws(() => criteriaFromForm("score", [{ description: "低" }, { description: "" }]), /第 2 个等级/);
});

test("switching structured JSON criteria through form mode preserves unchanged descriptions", () => {
  const criteria = { primary: { what: "Refunds", examples: ["Duplicate charge"] }, other: null };
  assert.deepEqual(criteriaFromForm("choice", criteriaRows("choice", criteria)), criteria);
  for (const [name, example] of Object.entries(EXAMPLES)) {
    assert.doesNotThrow(() => assemble({ stateText: example.state || "项目方案", stateFormat: "text", model: "jev-latest", drafts: example.drafts }), name);
  }
});
