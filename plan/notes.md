# Notes: Repository Normalization

## Current Product Tracks
- Userscript track:
  - Runtime file: `amac_god_mode.user.js`
  - Current version source: UserScript header `@version 7.0`
  - Shared rule engine: `automation_rules.js`
- Browser track:
  - Runtime files: `main.js`, `package.json`
  - Current app version source: `package.json` version `1.0.0`
  - Packaging output: `dist/`
- Web track:
  - No deployed code scaffold exists yet in the repository
  - Needs version placeholder, TODO list, and Vercel-oriented management note

## Repository State
- Git branch: `master`
- Remote: `origin -> git@github.com:oMygpt/jskid.git`
- Historical docs are being normalized into `docs/history/` and `docs/specs/`
- Screenshots are being normalized into `assets/screenshots/`

## Release and Governance Notes
- Browser Windows release should be automated through GitHub Actions.
- Userscript, browser, and web should each have:
  - current version
  - management mode
  - feature list
  - TODO list
- Existing memory indicates quiz pages must block auto refresh/navigation, and completion grace period must be preserved.

## Verification Notes
- Local verification can cover `node --test automation_rules.test.js` and workflow YAML existence.
- Local `npm test` passed.
- GitHub push to `origin/master` succeeded.
- Tag `browser-v1.0.0` was pushed successfully.
- GitHub Actions run `23707583796` succeeded for `Release Browser Windows`.
- Release URL: `https://github.com/oMygpt/jskid/releases/tag/browser-v1.0.0`
- Uploaded Windows asset URL: `https://github.com/oMygpt/jskid/releases/download/browser-v1.0.0/AMAC.-Windows.exe`
- Vercel deployment still has not been implemented or verified.
