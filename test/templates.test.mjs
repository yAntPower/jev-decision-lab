import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assemble } from "../dist/core.js";
import { EN, getLocale, setLocale } from "../dist/i18n.js";
import { TEMPLATES, TEMPLATE_ORDER, translateTemplateEdits } from "../dist/presets.js";

test("every bilingual template assembles three distinct, valid Jev judgments", () => {
  assert.equal(TEMPLATE_ORDER.length, 12);
  const seenIds = new Set();
  for (const id of TEMPLATE_ORDER) {
    const chinese = TEMPLATES[id].zh;
    const english = TEMPLATES[id].en;
    assert.ok(chinese.title && english.title && chinese.title !== english.title, id);
    assert.ok(chinese.summary && english.summary && chinese.summary !== english.summary, id);
    if (id !== "feasibility") assert.ok(chinese.state && english.state && chinese.state !== english.state, id);
    for (const language of ["zh", "en"]) {
      const example = TEMPLATES[id][language];
      const payload = assemble({ stateText: example.state || "A project proposal", stateFormat: "text", model: "jev-latest", drafts: example.drafts });
      assert.equal(Object.keys(payload.questions).length, 3, `${id}/${language}`);
      const questions = Object.values(payload.questions);
      assert.deepEqual(questions.map(question => question.type).sort(), ["choice", "noul", "score"]);
      assert.ok(questions.every(question => typeof question.instructions === "string" && question.instructions.length > 10));
      assert.ok(Object.keys(questions.find(question => question.type === "choice").criteria).length >= 2);
      assert.deepEqual(Object.keys(questions.find(question => question.type === "noul").criteria).sort(), ["false", "true"]);
      assert.ok(questions.find(question => question.type === "score").criteria.length >= 2);
    }
    for (const type of ["choice", "noul", "score"]) {
      const zh = chinese.drafts[type];
      const en = english.drafts[type];
      assert.equal(zh.id, en.id, `${id}/${type} response key changes with language`);
      assert.notEqual(zh.instructions, en.instructions, `${id}/${type} instructions were not translated`);
      assert.ok(!seenIds.has(zh.id), `Repeated judgment ID: ${zh.id}`);
      seenIds.add(zh.id);
    }
  }
});

test("language changes translate sample fields while preserving user edits", () => {
  const original = TEMPLATES.support.zh;
  const drafts = structuredClone(original.drafts);
  drafts.choice.instructions = "只找出主要负责团队：这是我自己改写的问题。";
  drafts.choice.rows[0].description = "我自己定义的账单范围。";
  const editedState = "我自己的客户工单。";
  const translated = translateTemplateEdits("support", "zh", "en", editedState, drafts);
  assert.equal(translated.state, editedState);
  assert.equal(translated.drafts.choice.instructions, drafts.choice.instructions);
  assert.equal(translated.drafts.choice.rows[0].description, drafts.choice.rows[0].description);
  assert.equal(translated.drafts.noul.instructions, TEMPLATES.support.en.drafts.noul.instructions);
  assert.equal(translated.drafts.choice.rows[1].description, TEMPLATES.support.en.drafts.choice.rows[1].description);
  assert.equal(drafts.noul.instructions, original.drafts.noul.instructions, "source drafts must not mutate");
  assert.equal(translateTemplateEdits("support", "zh", "en", original.state, original.drafts).state, TEMPLATES.support.en.state);
});

test("English is the source-page default and Chinese remains selectable", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const privacy = await readFile(new URL("../dist/privacy.html", import.meta.url), "utf8");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<option value="en" selected>English<\/option>/);
  assert.match(html, /<option value="zh">Chinese \(Simplified\)<\/option>/);
  assert.doesNotMatch(html, /[\p{Script=Han}]/u);
  assert.match(privacy, /<html lang="en">/);
  assert.match(privacy, /<section class="panel" id="chinese" hidden>/);
  assert.ok(readme.startsWith("# Jev Decision Lab\n"));
  assert.ok(readme.indexOf("[简体中文](README.zh-CN.md)") > readme.indexOf("## Use"));
  assert.ok(readme.indexOf("[简体中文](README.zh-CN.md)") < readme.indexOf("## Two usage scenarios"));
  assert.equal(getLocale(), "en");
  setLocale("zh");
  assert.equal(getLocale(), "zh");
  assert.equal(EN["请求实验室"], "Request playground");
  setLocale(null);
  assert.equal(getLocale(), "en");
});
