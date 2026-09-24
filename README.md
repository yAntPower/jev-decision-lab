# Jev Decision Lab

An unofficial open-source Jev playground. Paste plain text, configure Choice / Noul / Score with forms, make real requests and inspect probabilities, scores, timing, token usage and raw responses. Run one question, one combined request, or three concurrent requests.

**Page users never enter an API key. The service uses a credential configured by the deployer on the server.** The current working release is HTML/CSS/JavaScript plus a dependency-free local Node.js service.

## Start

Install Node.js 22 or later. The deployer configures `TYPESAFE_API_KEY` in the starting environment, then runs this from the project directory:

~~~bash
npm start
~~~

No `npm install` or build is needed. Open **http://127.0.0.1:8787**; the page checks the service automatically. Press Ctrl+C to stop. If the environment variable is already configured, no further key entry or copying is needed. See the [deployment guide](docs/deployment.en.md) for first-time setup.

If the variable is initialized only in interactive Bash, start from that configured terminal or use:

~~~bash
bash -ic 'exec node server.mjs'
~~~

The application does not scan environment files or shell configuration, print keys, or send server credentials to the browser. Restart after environment changes. An unconfigured service shows a setup status and disables execution; there is no manual key entry on the page.

For another port, use `PORT=8788 npm start` on Linux/macOS, or first set `$env:PORT = "8788"` in PowerShell.

## Use

1. Wait for the service-ready status.
2. Paste text or Markdown; JSON input is not required.
3. Edit questions, options and score levels. Advanced JSON editing is optional.
4. Run one question type, or all three in combined/concurrent mode.
5. Inspect, copy or download results.

**Language: English · [简体中文](README.zh-CN.md)**

Use the top-right control to switch between English and Simplified Chinese. All fixed interface text, 12 judgment templates and the fictional proposal sample have both language versions. The templates cover project validation, support and bug triage, model and tool routing, an agent's next step, RAG passage selection, citation support, candidate-value selection, release changes, input guarding and documentation changes. Switching languages translates untouched sample fields while preserving edited content, questions and criteria. Choice / Noul / Score have separate judgments in each template; see the [template guide](docs/templates.md).

Model judgments are not independent fact-checking, release approval or real-world success probabilities. Private proposals, real assessment records and personal analysis scripts are excluded from source releases.

## Two usage scenarios

| Scenario | Does the visitor enter a key? | Who configures the service credential? | Status |
| --- | --- | --- | --- |
| Download and run locally | No key entry on the page | The deployer, through `TYPESAFE_API_KEY` | Implemented |
| Use the operator's public site | No personal key required | The operator configures a platform key | Access control and USDT billing pending |

Bring-your-own-key (BYOK) has been removed, including the input form, connect/disconnect controls and backend key-session endpoints. Self-hosting still requires the deployer to have a working TypeSafe credential. The open-source code includes no shared key or free API credits.

The request path is **browser → local Node service → official TypeSafe API**. The browser uses the same origin as the local service, avoiding reliance on upstream browser CORS support. Full functionality requires Node; opening the HTML file directly or static hosting alone is insufficient.

The current service binds only to `127.0.0.1` and rejects public mode and non-loopback binding. The planned public service uses a platform key and USDT-funded access credits. **Deposits, payments, balances and billing are not implemented.** Do not expose the current service directly to the public Internet. See [data handling](dist/privacy.html).

## Check and release

~~~bash
npm run check
npm test
npm run package
~~~

Tests use fake credentials and mocked APIs without reading real environment keys. They cover calls without visitor credentials, removal of old key endpoints, all three question types, concurrency, partial failures, errors, timeouts, cancellation, private file isolation and release packaging.

`npm run package` creates a clean source directory with SHA-256 hashes. Only explicitly allowlisted public files are copied; environment files and private reports are not read. Create public repositories from that generated directory, not the entire working directory.

Code is [MIT licensed](LICENSE). See [Contributing](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), and [Security](SECURITY.md). This project is not affiliated with TypeSafe AI. TypeSafe services, models and trademarks are not covered by this license. `private: true` only prevents accidental npm publication.

[English deployment guide](docs/deployment.en.md) · [中文部署指南](docs/deployment.md) · [Bilingual template guide](docs/templates.md) · [Guide notes (Chinese)](docs/typesafe-guide.md) · [Product scope (Chinese)](docs/roadmap.md)
