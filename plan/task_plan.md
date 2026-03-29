# Task Plan: AMAC Userscript Completion Stability

## Goal
Diagnose why `amac_god_mode.user.js` has a non-trivial completion miss rate and produce a concrete design for improving completion confirmation, slower tail playback, and section-level auto-advance without breaking quiz guards.

## Phases
- [x] Phase 1: Inspect current userscript, shared rule engine, and historical versions
- [x] Phase 2: Identify symptom, cause hypotheses, and contract drift
- [x] Phase 3: Produce prioritized design options and rollout plan
- [x] Phase 4: Implement userscript and shared-rule changes
- [ ] Phase 5: Run live smoke verification on a real AMAC course page

## Key Questions
1. Why did the current `v7.0` userscript regress relative to the historical completion flow?
2. What is the safest recovery path when the server does not confirm completion after video end?
3. How should the script move to the next playable video section while still treating quiz pages as no-auto-navigation zones?

## Decisions Made
- Treat this as a `completion handshake + page state machine` problem, not only a playback speed problem.
- Keep `quiz mode` as a hard guardrail: no auto refresh, no auto submit, no auto navigation inside quiz pages.
- Recommend restoring explicit completion signaling before adding more aggressive fallback navigation.
- Treat rewind replay as a fallback path after confirmation timeout, not as the primary completion strategy.

## Errors Encountered
- No runtime errors were reproduced in this turn because the task is limited to static code review and design.
- Existing `plan/task_plan.md` was from an older repository-normalization task and has been replaced with the current investigation plan.

## Status
**Currently in Phase 5** - Shared-rule tests and userscript syntax checks are complete. Live AMAC smoke verification is still pending.
