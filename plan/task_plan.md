# Task Plan: Repository Normalization for JS, Browser, and Web Tracks

## Goal
Normalize this repository into a clear three-track workspace covering the Tampermonkey userscript, the packaged Electron browser, and the Vercel web release page, with contributor guidance, version governance, and GitHub release automation.

## Phases
- [x] Phase 1: Inspect current repository state, versions, and release gaps
- [x] Phase 2: Define target structure and product governance
- [x] Phase 3: Implement repository files and workflow automation
- [x] Phase 4: Verify commands, document limits, and deliver summary

## Key Questions
1. Which files are current sources of truth for userscript and browser versions?
2. How should browser release automation map to GitHub Releases?
3. What structure best represents the web/Vercel track before app code exists?

## Decisions Made
- The repo will be managed as one Git repository with three product tracks.
- Browser release automation will target Windows builds first.
- Existing runtime files stay at the repository root for now to avoid breaking the current Electron build.

## Errors Encountered
- Network is restricted in this environment, so GitHub remote sync and server-side Action execution cannot be verified live.
- Sandbox denied writes to `.git/config`, so `git remote add origin https://github.com/oMygpt/jskid.git` could not be completed locally in this session.

## Status
**Completed** - Repository structure, product governance docs, and the Windows release workflow have been added; remaining gap is live remote configuration and GitHub-side execution verification.
