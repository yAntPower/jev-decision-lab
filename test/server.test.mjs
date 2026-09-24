import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp, runtimeOptions } from "../server.mjs";

const secret = "test-only-not-a-real-api-key";
const payload = { model: "jev-latest", state: "A sample request.", questions: { check: { type: "noul", instructions: "Does this contain a request?" } } };
const modelResponse = () => Response.json({ models: [{ name: "jev-latest", description: "Test model" }] });
const inferenceResponse = { model: "jev-test", answers: { check: { type: "noul", noul: 0.88 } }, usage: { input_tokens: 120, output_tokens: 10 } };

async function setup(t, options = {}) {
  // Tests inject a fake credential. Never access the process environment.
  const server = createApp({ environmentKey: secret, ...options });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, headers = {}, method = body === undefined ? "GET" : "POST") => fetch(`${base}${path}`, {
    method, headers: { Origin: base, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { server, base, request };
}

test("configured service verifies models and runs without browser credentials or cookies", async (t) => {
  const upstream = [];
  const app = await setup(t, { fetchImpl: async (url, options) => {
    upstream.push({ url, options });
    return url.endsWith("/models") ? modelResponse() : Response.json(inferenceResponse);
  } });
  const before = await (await app.request("/api/health")).json();
  assert.equal(before.environmentKeyAvailable, true);
  assert.equal(before.authenticated, false);
  assert.equal(JSON.stringify(before).includes(secret), false);
  const models = await app.request("/api/models");
  assert.equal(models.status, 200);
  assert.equal(models.headers.get("set-cookie"), null);
  assert.equal((await models.text()).includes(secret), false);
  const after = await (await app.request("/api/health")).json();
  assert.equal(after.authenticated, true);
  assert.equal(after.credentialSource, "environment");
  const run = await app.request("/api/systemone", payload);
  assert.equal(run.status, 200);
  assert.deepEqual(await run.json(), inferenceResponse);
  assert.equal(upstream[0].url, "https://api.typesafe.ai/v1/models");
  assert.equal(upstream[1].url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(upstream[1].options.headers.Authorization, `Bearer ${secret}`);
  assert.deepEqual(JSON.parse(upstream[1].options.body), payload);
  assert.equal(upstream[1].options.redirect, "error");
  assert.equal(run.headers.get("access-control-allow-origin"), null);
  assert.equal(run.headers.get("set-cookie"), null);
  assert.match(run.headers.get("cache-control"), /no-store/);
});

test("unconfigured service returns a setup error and never calls TypeSafe", async (t) => {
  let calls = 0;
  const app = await setup(t, { environmentKey: "", fetchImpl: async () => { calls++; return modelResponse(); } });
  for (const [path, body] of [["/api/models", undefined], ["/api/systemone", payload]]) {
    const response = await app.request(path, body, { Cookie: "typesafe_session=old-session" });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "SERVICE_NOT_CONFIGURED");
  }
  const health = await (await app.request("/api/health")).json();
  assert.equal(health.environmentKeyAvailable, false);
  assert.equal(health.credentialSource, null);
  assert.equal(calls, 0);
});

test("retired key sessions and browser-supplied credentials cannot reach the upstream", async (t) => {
  let calls = 0;
  const app = await setup(t, { fetchImpl: async () => { calls++; return modelResponse(); } });
  for (const method of ["POST", "DELETE"]) {
    const response = await app.request("/api/session", { apiKey: "client-key" }, {}, method);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  for (const headers of [{ Authorization: "Bearer client-key" }, { "X-API-Key": "client-key" }]) {
    const response = await app.request("/api/systemone", payload, headers);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "CLIENT_CREDENTIALS_NOT_ACCEPTED");
  }
  assert.equal((await app.request("/api/systemone", { ...payload, apiKey: "client-key" })).status, 422);
  assert.equal(calls, 0);
});

test("invalid requests fail before any upstream call", async (t) => {
  let calls = 0;
  const app = await setup(t, { fetchImpl: async () => { calls++; return modelResponse(); } });
  assert.equal((await app.request("/api/systemone", { ...payload, state: null })).status, 422);
  assert.equal((await app.request("/api/systemone", payload, { "Content-Type": "text/plain" })).status, 415);
  const invalidJSON = await fetch(`${app.base}/api/systemone`, { method: "POST", headers: { Origin: app.base, "Content-Type": "application/json" }, body: "{" });
  assert.equal(invalidJSON.status, 400);
  const tooLarge = await app.request("/api/systemone", { ...payload, state: "x".repeat(1024 * 1024) });
  assert.equal(tooLarge.status, 413);
  assert.match((await tooLarge.json()).error, /1 MB/);
  assert.equal(calls, 0);
});

test("invalid or revoked server credential is never reported as verified", async (t) => {
  let valid = false;
  const app = await setup(t, { fetchImpl: async () => valid ? modelResponse() : Response.json({ error: "invalid credential" }, { status: 401 }) });
  assert.equal((await app.request("/api/models")).status, 401);
  assert.equal((await (await app.request("/api/health")).json()).authenticated, false);
  valid = true;
  assert.equal((await app.request("/api/models")).status, 200);
  assert.equal((await (await app.request("/api/health")).json()).authenticated, true);
  valid = false;
  assert.equal((await app.request("/api/systemone", payload)).status, 401);
  assert.equal((await (await app.request("/api/health")).json()).authenticated, false);
});

test("malformed model lists do not mark the service ready", async (t) => {
  const app = await setup(t, { fetchImpl: async () => Response.json({ models: [null] }) });
  assert.equal((await app.request("/api/models")).status, 502);
  assert.equal((await (await app.request("/api/health")).json()).authenticated, false);
});

test("upstream errors preserve status, details, Retry-After and request identifiers", async (t) => {
  const app = await setup(t, { fetchImpl: async () => Response.json({ detail: "Rate limited" }, { status: 429, headers: { "Retry-After": "9", "X-Request-ID": "test-request", "X-Typesafe-Request-ID": "upstream-request" } }) });
  const response = await app.request("/api/systemone", payload);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "9");
  assert.equal(response.headers.get("x-request-id"), "test-request");
  assert.equal(response.headers.get("x-typesafe-request-id"), "upstream-request");
  assert.deepEqual(await response.json(), { detail: "Rate limited" });
});

test("plain-text upstream errors remain readable without HTML execution", async (t) => {
  const app = await setup(t, { fetchImpl: async () => new Response("<h1>Unavailable</h1>", { status: 503, headers: { "Content-Type": "text/html" } }) });
  const response = await app.request("/api/systemone", payload);
  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type"), /text\/plain/);
  assert.equal(await response.text(), "<h1>Unavailable</h1>");
});

test("credential echoes in upstream bodies and forwarded headers are redacted", async (t) => {
  const app = await setup(t, { fetchImpl: async () => Response.json({ error: `Bad credential: ${secret}` }, { status: 401, headers: { "X-Request-ID": secret, "X-Typesafe-Request-ID": secret } }) });
  const response = await app.request("/api/models");
  assert.equal(response.status, 401);
  const body = await response.text();
  assert.equal(body.includes(secret), false);
  assert.match(body, /REDACTED/);
  assert.equal(response.headers.get("x-request-id"), "[REDACTED]");
  assert.equal(response.headers.get("x-typesafe-request-id"), "[REDACTED]");
});

test("cross-site requests, untrusted Host, and non-public files are rejected", async (t) => {
  const app = await setup(t, { fetchImpl: async () => { throw new Error("Must not reach upstream"); } });
  assert.equal((await app.request("/api/systemone", payload, { Origin: "https://untrusted.example" })).status, 403);
  assert.equal((await app.request("/api/models", undefined, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    http.get(`${app.base}/api/health`, { headers: { Host: "untrusted.example" } }, (response) => { response.resume(); resolve(response.statusCode); }).on("error", reject);
  });
  assert.equal(foreignHostStatus, 421);
  for (const path of ["/server.mjs", "/package.json", "/.env", "/test/server.test.mjs", "/examples/agent-release-assurance.md", "/artifacts/private-input/agent-release-assurance.md"]) {
    assert.equal((await app.request(path)).status, 404);
  }
});

test("public assets have correct media types and same-origin security headers", async (t) => {
  const app = await setup(t);
  for (const [path, type] of [["/", "text/html"], ["/app.js", "text/javascript"], ["/core.js", "text/javascript"], ["/presets.js", "text/javascript"], ["/i18n.js", "text/javascript"], ["/examples/proposal.md", "text/plain"], ["/examples/proposal.en.md", "text/plain"], ["/privacy.html", "text/html"], ["/privacy.js", "text/javascript"], ["/styles.css", "text/css"], ["/favicon.svg", "image/svg+xml"]]) {
    const response = await app.request(path);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get("content-type").startsWith(type), path);
    assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.ok((await response.text()).length > 0);
  }
});

test("timeout aborts the upstream operation and returns a recoverable error", async (t) => {
  let aborted = false;
  const app = await setup(t, { timeoutMs: 20, fetchImpl: async (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  }) });
  assert.equal((await app.request("/api/systemone", payload)).status, 504);
  assert.equal(aborted, true);
});

test("cancelling the browser request aborts the upstream request", async (t) => {
  let markStarted;
  let markAborted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const aborted = new Promise(resolve => { markAborted = resolve; });
  const app = await setup(t, { fetchImpl: async (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener("abort", () => { markAborted(); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    markStarted();
  }) });
  const controller = new AbortController();
  const response = fetch(`${app.base}/api/systemone`, { method: "POST", headers: { "Content-Type": "application/json", Origin: app.base }, body: JSON.stringify(payload), signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(response, { name: "AbortError" });
  await Promise.race([aborted, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("Upstream was not cancelled")), 2000); timer.unref(); })]);
});

test("network failures return a safe error without leaking upstream exception details", async (t) => {
  const app = await setup(t, { fetchImpl: async () => { throw new Error(`Network details ${secret}`); } });
  const response = await app.request("/api/systemone", payload);
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes(secret), false);
});

test("upstream responses exceeding the limit are rejected", async (t) => {
  const app = await setup(t, { fetchImpl: async () => new Response("x".repeat(4 * 1024 * 1024 + 1)) });
  const response = await app.request("/api/systemone", payload);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /4 MB/);
});

test("request limits apply to the configured service and recover after the window", async (t) => {
  let now = 0;
  let calls = 0;
  const app = await setup(t, { now: () => now, limits: { requestsPerMinute: 1 }, fetchImpl: async () => { calls++; return modelResponse(); } });
  assert.equal((await app.request("/api/models")).status, 200);
  const limited = await app.request("/api/models");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(calls, 1);
  now = 60_000;
  assert.equal((await app.request("/api/models")).status, 200);
  assert.equal(calls, 2);
});

test("concurrent requests cannot exceed the global service limit", async (t) => {
  let markStarted;
  let release;
  const started = new Promise(resolve => { markStarted = resolve; });
  const app = await setup(t, { limits: { maxConcurrent: 1 }, fetchImpl: async () => new Promise(resolve => { release = () => resolve(modelResponse()); markStarted(); }) });
  const first = app.request("/api/models");
  await started;
  const second = await app.request("/api/models");
  assert.equal(second.status, 429);
  assert.equal(second.headers.get("retry-after"), "2");
  release();
  assert.equal((await first).status, 200);
});

test("public hosting is disabled before accessing any environment credential", () => {
  const publicEnvironment = new Proxy({ APP_MODE: "public" }, { get(target, property) {
    if (property === "TYPESAFE_API_KEY") throw new Error("Credential must not be accessed");
    return target[property];
  } });
  assert.throws(() => runtimeOptions(publicEnvironment), /访问控制与计费尚未完成/);
  assert.throws(() => runtimeOptions({ BIND_ADDRESS: "0.0.0.0" }), /127.0.0.1/);
  assert.throws(() => createApp({ mode: "public" }), /访问控制与计费尚未完成/);
});
