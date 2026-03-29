# Notes: AMAC Completion Stability Investigation

## Sources Reviewed
- `amac_god_mode.user.js`
- `automation_rules.js`
- `automation_rules.test.js`
- `preload.js`
- `docs/history/6.3.md`
- `readme.md`
- memory summary for `amac-auto-browser-quiz-completion-guards`

## Current Behavior in `v7.0`
- The userscript observes `log_update` XHR responses but does not actively trigger completion APIs.
- Navigation is blocked until `_amacFinished` becomes `true`, which currently depends on `vInfo.isFinish == 2`.
- Video acceleration is still aggressive: early segment runs at `16.0x` with periodic `currentTime += 5.0`, then the last 45 seconds fall back to `1.0x`.
- Auto-click is page-global and button-text driven. It has no concept of `current section`, `next playable section`, or `quiz item in course outline`.

## Regression vs Historical `6.3`
- `docs/history/6.3.md` shows an explicit completion sequence:
  - patched `mts.postProgress(...)`
  - periodic keepalive reporting
  - direct `window.playerLogUpdate('1', t)` during playback
  - direct `window.playerLogUpdate('2', duration)` near completion
- `readme.md` still documents this stronger handshake path, but current `v7.0` no longer implements it.
- This means the documentation still promises a stronger completion mechanism than the code now provides.

## Main Hypotheses
1. Completion misses are primarily caused by handshake regression.
   - Current code waits for server confirmation but no longer forces a completion report when natural reporting is skipped or delayed.
2. Playback remains too aggressive before the tail section.
   - `16.0x` plus manual `currentTime` jumps may reduce the chance that the platform records enough intermediate progress.
3. Course traversal is under-modeled.
   - The script can click generic `下一节`, but it cannot inspect the course outline and deliberately skip `测验` items or dead-end UI states.

## Design Implications
- Reintroduce an explicit `completion handshake` layer, but gate it carefully to avoid over-calling completion APIs.
- Add a `confirmation timeout -> fallback rewind` branch:
  - if video ended but `isFinish != 2` after a bounded wait, rewind to an earlier stable point and replay at slower speed.
- Add `section discovery` based on DOM text and active-state detection:
  - find current section
  - locate next unfinished playable video item
  - skip entries whose text looks like quiz/exam/test

## Validation Targets for Implementation
- Shared tests for navigation policy:
  - quiz pages stay blocked
  - confirmation timeout triggers fallback instead of blind next-step navigation
  - next playable section selection skips quiz items
- Runtime logs:
  - `postProgress`
  - `playerLogUpdate(1)`
  - `playerLogUpdate(2)`
  - fallback rewind triggered / succeeded / exhausted
  - chosen next section title

## Implementation Status
- `automation_rules.js` now exposes `detectSectionKind`, `chooseNextPlayableSection`, and `shouldTriggerRewindFallback`.
- `automation_rules.test.js` covers quiz/evaluation section classification, section skipping, and rewind timeout behavior.
- `amac_god_mode.user.js` now:
  - restores direct completion reporting with guarded `playerLogUpdate`
  - slows down the playback profile and removes continuous `currentTime` jumping
  - rewinds and replays slowly when completion confirmation times out
  - prefers next unfinished video sections over quiz/evaluation sections
