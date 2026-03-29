# Browser Track

## Current Version
- `1.1.0`
- Source of truth: `package.json`

## Management Mode
- Electron app managed with npm and `electron-builder`
- Windows release tag pattern: `browser-v<version>`
- GitHub Actions publishes the Windows executable to GitHub Releases

## Feature List
- Built-in injection of the AMAC userscript
- Controlled permission handling in Electron
- Packaging for Windows and macOS
- Shared automation behavior with the userscript track

## Release Notes
- Browser app version is managed separately from userscript version.
- Tag releases only after `package.json` has been updated and `npm test` passes.
