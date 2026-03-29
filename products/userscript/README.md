# Userscript Track

## Current Version
- `7.0`
- Source of truth: `amac_god_mode.user.js` header `@version`

## Management Mode
- Manual semver
- Distributed as a standalone Tampermonkey script
- Shares rule logic with `automation_rules.js`

## Feature List
- Auto-start on study pages
- Video acceleration with end-of-video settling window
- Progress reporting compatibility
- Focus-loss blocking
- Quiz-page protection through shared rules

## Release Notes
- Keep userscript version independent from Electron app version.
- When behavior changes affect quiz detection or navigation, update tests first.
