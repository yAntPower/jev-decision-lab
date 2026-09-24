# Local deployment guide

**[简体中文](deployment.md) · English** · [README](../README.md)

## Prerequisites

Extract the clean source package and install Node.js 22+. No npm dependencies, Docker, database or browser extension are required.

Page users never enter an API key. On first deployment, the deployer configures a valid `TYPESAFE_API_KEY` in the runtime environment. This is service setup, not a visitor sign-in or usage step. No platform credential is bundled with the source.

## Configure and start

If the environment variable is already configured, enter the project directory in that terminal and run:

~~~bash
npm start
~~~

If the variable is initialized only in interactive Bash, use `bash -ic 'exec node server.mjs'`. The application itself does not scan environment files or shell configuration. Do not print credentials to check setup.

For first-time setup, deployers can use a hidden Bash prompt so the credential does not enter command history:

~~~bash
read -rsp "TypeSafe API Key (deployment only): " TYPESAFE_API_KEY
echo
export TYPESAFE_API_KEY
npm start
~~~

PowerShell:

~~~powershell
$deploySecret = Read-Host "TypeSafe API Key (deployment only)" -AsSecureString
$env:TYPESAFE_API_KEY = [System.Net.NetworkCredential]::new("", $deploySecret).Password
Remove-Variable deploySecret
npm start
~~~

These commands configure only the current terminal's environment and do not create configuration files. Restart after changing environment variables.

Open **http://127.0.0.1:8787**. The page checks the service and loads models automatically. Once ready, enter your text and questions. Missing configuration shows a setup status; invalid configuration shows a connection error. Neither opens an API-key prompt.

## Network and data

The browser calls the same-origin local service, which calls `https://api.typesafe.ai/v1`. The server credential is not returned to the page, and the browser needs no stored credential or authentication cookie. The application does not persist inputs, results or call history; users explicitly initiate result downloads. Submitted content and questions are sent to TypeSafe.

The service binds only to `127.0.0.1`, on port 8787 by default. Use `PORT=8788 npm start` on Linux/macOS, or first set `$env:PORT = "8788"` in PowerShell.

For connection problems, check the starting environment, server-side network and TypeSafe account status. Do not paste real keys into issues or logs. Input is limited to 1 MB, with a 60-second upstream timeout. Cancellation cannot guarantee that accepted upstream work is not billed.

Full functionality requires the Node service. Opening the HTML file directly or static hosting cannot replace it.

## Source releases and public hosting

Run `npm run check`, `npm test`, then `npm run package`. Create public repositories from the generated clean directory. Private reports, personal analysis scripts and environment files are not in the release allowlist.

The product no longer supports visitor-provided keys. The planned public service also uses an operator-configured platform key; visitors purchase access credits with USDT without needing their own TypeSafe key.

**Public access control, credit accounts, payment verification and billing are not implemented.** The current release supports local use only and rejects `APP_MODE=public` and non-loopback binding. Do not bypass this through a reverse proxy. There is no public Docker/Caddy deployment configuration. See the [roadmap](roadmap.md).
