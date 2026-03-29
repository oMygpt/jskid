# Repository Guidelines

## Project Structure & Module Organization
This repository has three product tracks managed in one Git repo: the Tampermonkey userscript, the Electron browser, and the Vercel web release page.

- Runtime sources stay at the repository root: `amac_god_mode.user.js`, `main.js`, `automation_rules.js`, `automation_rules.test.js`, `package.json`.
- Product governance lives under `products/` with one folder each for `userscript`, `browser`, and `web`.
- Planning files go in `plan/`; historical notes go in `docs/history/`; screenshots go in `assets/screenshots/`.
- GitHub automation belongs in `.github/workflows/`.

Keep reusable logic in testable modules such as `automation_rules.js`. Avoid pushing more stateful logic into the userscript unless it must run in-page.

## Build, Test, and Development Commands
- `npm install`: install Electron and build dependencies.
- `npm test`: run the `node:test` suite.
- `npm start`: run the local Electron app against the live AMAC site.
- `npm run pack`: create an unpacked build in `dist/`.
- `npm run dist`: build distributables for the current platform.
- `npm run dist-win` / `npm run dist-mac`: build platform-specific release artifacts.
- `git tag browser-v1.0.0 && git push origin browser-v1.0.0`: trigger the Windows browser release workflow.

Use Node.js 18+ as documented in `readme.md`.

## Coding Style & Naming Conventions
Use CommonJS modules, 2-space indentation, semicolons, and descriptive `camelCase` names. Prefer `UPPER_SNAKE_CASE` for keyword lists and constants, following `automation_rules.js`. Keep decision helpers pure where possible.

Versioning is track-specific:
- userscript: source of truth is the `@version` field in `amac_god_mode.user.js`
- browser: source of truth is `package.json`
- web: source of truth is `products/version-registry.json` until a dedicated web app is created

## Testing Guidelines
Tests use the built-in `node:test` runner with `node:assert/strict`. Name new tests `*.test.js` and keep them close to the module they validate. Add coverage for quiz detection, completion grace periods, and no-refresh behavior on quiz pages before changing automation flow.

## Commit & Pull Request Guidelines
Recent history mixes versioned subjects and Conventional Commit style. Standardize on Conventional Commits, for example: `feat(browser): add Windows release workflow` or `fix(userscript): preserve quiz guard`.

Pull requests should include:
- a short problem statement and the behavior change,
- the exact verification command(s) run,
- screenshots or log snippets when UI flow or injected behavior changes,
- notes on which product track was changed: userscript, browser, or web.

## Security & Configuration Tips
Do not hardcode credentials, cookies, or AMAC account data. Keep automation limited to `https://peixun.amac.org.cn/`. Review Electron permission handling in `main.js` and do not add quiz-page auto-submit, auto-refresh, or auto-navigation behavior without tests.
