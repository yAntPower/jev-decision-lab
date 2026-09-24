import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { validatePayload } from "./dist/core.js";

const API_ROOT = "https://api.typesafe.ai/v1";
const BODY_LIMIT = 1024 * 1024;
const RESPONSE_LIMIT = 4 * 1024 * 1024;
const ASSETS = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/i18n.js", ["i18n.js", "text/javascript; charset=utf-8"]],
  ["/core.js", ["core.js", "text/javascript; charset=utf-8"]],
  ["/presets.js", ["presets.js", "text/javascript; charset=utf-8"]],
  ["/privacy.js", ["privacy.js", "text/javascript; charset=utf-8"]],
  ["/examples/proposal.md", ["examples/proposal.md", "text/plain; charset=utf-8"]],
  ["/examples/proposal.en.md", ["examples/proposal.en.md", "text/plain; charset=utf-8"]],
  ["/privacy.html", ["privacy.html", "text/html; charset=utf-8"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
]);

function json(res, status, data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) {
    throw Object.assign(new Error("请求需使用 application/json。"), { status: 415 });
  }
  if (Number(req.headers["content-length"]) > BODY_LIMIT) {
    req.resume();
    throw Object.assign(new Error("请求超过本工具的 1 MB 限制。"), { status: 413 });
  }
  const parts = [];
  let size = 0;
  for await (const part of req.iterator({ destroyOnReturn: false })) {
    size += part.length;
    if (size > BODY_LIMIT) {
      req.resume();
      throw Object.assign(new Error("请求超过本工具的 1 MB 限制。"), { status: 413 });
    }
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw Object.assign(new Error("请求体不是有效 JSON。"), { status: 400 }); }
}

export function runtimeOptions(environment = process.env) {
  const mode = environment.APP_MODE || "local";
  if (mode !== "local") throw new Error("公开服务的访问控制与计费尚未完成；当前版本仅支持本机运行。");
  const port = Number(environment.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须是 1–65535 的整数。");
  const bindAddress = environment.BIND_ADDRESS || "127.0.0.1";
  if (bindAddress !== "127.0.0.1") throw new Error("当前版本只能监听 127.0.0.1，不能对外开放。");
  return { mode, port, bindAddress, environmentKey: environment.TYPESAFE_API_KEY };
}

export function createApp({ fetchImpl = globalThis.fetch, timeoutMs = 60_000, now = Date.now, environmentKey = "", mode = "local", limits = {} } = {}) {
  if (mode !== "local") throw new Error("公开服务的访问控制与计费尚未完成；当前版本仅支持本机运行。");
  const policy = {
    requestsPerMinute: 600,
    maxConcurrent: 24,
    ...limits,
  };
  if (Object.values(policy).some(value => !Number.isSafeInteger(value) || value < 1)) throw new Error("服务限制必须为正整数。");
  const requestWindow = { start: now(), count: 0 };
  const allControllers = new Set();
  function consume(window, limit) {
    if (now() - window.start >= 60_000) { window.start = now(); window.count = 0; }
    if (window.count >= limit) throw Object.assign(new Error("本站请求频率达到限制，请稍后重试。"), { status: 429, retryAfter: Math.max(1, Math.ceil((window.start + 60_000 - now()) / 1000)) });
    window.count++;
  }
  // Only the service runtime consumes the deployer's credential.
  const key = typeof environmentKey === "string" ? environmentKey.trim() : "";
  const hasEnvironmentKey = key.length > 0;
  let environmentVerified = false;
  const redact = (value) => key && typeof value === "string" ? value.replaceAll(key, "[REDACTED]") : value;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    // Content-free readiness for a private reverse proxy/container health check.
    if (req.method === "GET" && req.url === "/healthz") return json(res, 200, { ok: true });
    const port = server.address()?.port;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origins = hosts.map(host => `http://${host}`);
    if (!hosts.includes(req.headers.host)) return json(res, 421, { error: "请通过本机地址访问此服务。" });
    if ((req.headers.origin && !origins.includes(req.headers.origin)) || req.headers["sec-fetch-site"] === "cross-site") {
      return json(res, 403, { error: "服务不接受来自其他网站或缺少来源的修改请求。" });
    }
    let path;
    try { path = new URL(req.url, `http://${req.headers.host}`).pathname; }
    catch { return json(res, 400, { error: "请求地址无效。" }); }

    async function upstream(endpoint, payload) {
      if (allControllers.size >= policy.maxConcurrent) {
        throw Object.assign(new Error("正在处理的请求过多，请稍后重试。"), { status: 429, retryAfter: 2 });
      }
      consume(requestWindow, policy.requestsPerMinute);
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      const onClose = () => { if (!res.writableEnded) controller.abort(); };
      const onAborted = () => controller.abort();
      res.once("close", onClose);
      req.once("aborted", onAborted);
      allControllers.add(controller);
      try {
        const response = await fetchImpl(`${API_ROOT}/${endpoint}`, {
          method: payload === undefined ? "GET" : "POST",
          headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(payload === undefined ? {} : { "Content-Type": "application/json" }) },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
          signal: controller.signal,
          redirect: "error",
        });
        if (Number(response.headers.get("content-length")) > RESPONSE_LIMIT) throw Object.assign(new Error("TypeSafe 响应超过本站的 4 MB 限制。"), { status: 502 });
        const parts = [];
        let size = 0;
        if (response.body) {
          for await (const part of response.body) {
            size += part.length;
            if (size > RESPONSE_LIMIT) throw Object.assign(new Error("TypeSafe 响应超过本站的 4 MB 限制。"), { status: 502 });
            parts.push(part);
          }
        }
        const rawText = Buffer.concat(parts).toString("utf8");
        const text = redact(rawText);
        return { status: response.status, text, headers: response.headers };
      } catch (error) {
        const cancelled = controller.signal.aborted || req.aborted;
        controller.abort();
        if (res.destroyed) return null;
        if (error.status) throw error;
        throw Object.assign(new Error(timedOut ? "TypeSafe 请求超时，请稍后重试。" : cancelled ? "请求已取消。" : "无法连接 TypeSafe AI。请稍后重试或联系站点维护者。"), { status: timedOut ? 504 : cancelled ? 499 : 502 });
      } finally {
        clearTimeout(timer);
        req.off("aborted", onAborted);
        res.off("close", onClose);
        allControllers.delete(controller);
      }
    }

    function forward(result) {
      if (!result || res.destroyed || res.writableEnded) return;
      for (const header of ["retry-after", "x-request-id", "x-typesafe-request-id"]) {
        const value = result.headers.get(header);
        if (value) res.setHeader(header, redact(value));
      }
      const isJSON = result.headers.get("content-type")?.includes("json");
      res.writeHead(result.status, { "Content-Type": isJSON ? "application/json; charset=utf-8" : "text/plain; charset=utf-8" });
      res.end(result.text);
    }

    try {
      if (path.startsWith("/api/") && (req.headers.authorization || req.headers["x-api-key"])) {
        req.resume();
        return json(res, 400, { error: "页面无需提交凭证，此服务只使用部署者配置。", code: "CLIENT_CREDENTIALS_NOT_ACCEPTED" });
      }
      if (req.method === "GET" && path === "/api/health") {
        return json(res, 200, { ok: true, mode, authenticated: environmentVerified, environmentKeyAvailable: hasEnvironmentKey, credentialSource: hasEnvironmentKey ? "environment" : null });
      }
      if ((path === "/api/models" && req.method === "GET") || (path === "/api/systemone" && req.method === "POST")) {
        if (!hasEnvironmentKey) {
          req.resume();
          return json(res, 503, { error: "模型服务尚未配置，请联系部署者完成配置。", code: "SERVICE_NOT_CONFIGURED" });
        }
        if (path === "/api/models") {
          const result = await upstream("models");
          if (!result) return;
          let models;
          try { models = JSON.parse(result.text).models; } catch { /* validated below */ }
          environmentVerified = result.status >= 200 && result.status < 300 && Array.isArray(models) && models.every(model => model && typeof model.name === "string");
          if (result.status >= 200 && result.status < 300 && !environmentVerified) return json(res, 502, { error: "TypeSafe 返回的模型列表格式异常。" });
          return forward(result);
        }
        const payload = await readBody(req);
        try {
          validatePayload(payload);
          if (Object.keys(payload).some(name => !["model", "state", "questions"].includes(name))) throw new Error("请求仅接受 model、state、questions 字段，不接受客户端凭证。");
        } catch (error) { return json(res, 422, { error: error.message }); }
        const result = await upstream("systemone", { model: payload.model, state: payload.state, questions: payload.questions });
        if (result?.status === 401 || result?.status === 403) environmentVerified = false;
        return forward(result);
      }
      if ((req.method === "GET" || req.method === "HEAD") && ASSETS.has(path)) {
        const [file, contentType] = ASSETS.get(path);
        const content = await readFile(new URL(`./dist/${file}`, import.meta.url));
        res.writeHead(200, { "Content-Type": contentType });
        return res.end(req.method === "HEAD" ? undefined : content);
      }
      req.resume();
      return json(res, 404, { error: "未找到此资源。" });
    } catch (error) {
      if (error.retryAfter && !res.headersSent) res.setHeader("Retry-After", String(error.retryAfter));
      return json(res, error.status || 500, { error: error.status ? error.message : "服务发生错误，请稍后重试。" });
    }
  });
  server.requestTimeout = 75_000;
  server.on("close", () => {
    allControllers.forEach((controller) => controller.abort());
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = runtimeOptions();
    const server = createApp(options);
    server.on("error", (error) => {
      console.error(error.code === "EADDRINUSE" ? `端口 ${options.port} 已被占用，请设置其他 PORT。` : `启动失败：${error.code || "unknown"}`);
      process.exitCode = 1;
    });
    server.listen(options.port, options.bindAddress, () => console.log(`Jev Decision Lab started (${options.mode})\n${`http://127.0.0.1:${options.port}`}\nThe model credential is configured by the deployer; the page never accepts API keys.`));
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { server.closeAllConnections(); server.close(); });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
