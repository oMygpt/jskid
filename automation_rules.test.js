const test = require('node:test');
const assert = require('node:assert/strict');

const {
  chooseNextPlayableSection,
  decideAutoClick,
  detectPageMode,
  detectSectionKind,
  shouldTriggerRewindFallback,
} = require('./automation_rules');

test('detectPageMode marks quiz pages from question text', () => {
  const pageMode = detectPageMode({
    url: 'https://peixun.amac.org.cn/study/exam',
    title: '课程测验',
    text: '单选题 1/10 判断题 提交试卷',
  });

  assert.equal(pageMode, 'quiz');
});

test('decideAutoClick blocks all automation during quiz mode', () => {
  const decision = decideAutoClick({
    text: '提交',
    pageMode: 'quiz',
    anyVideoRunning: false,
    now: 20_000,
    lastVideoFinishedAt: 10_000,
    pageText: '单选题 提交试卷',
  });

  assert.deepEqual(decision, {
    action: 'skip',
    reason: 'quiz_mode',
  });
});

test('decideAutoClick blocks navigation during completion grace period', () => {
  const decision = decideAutoClick({
    text: '下一节',
    pageMode: 'study',
    anyVideoRunning: false,
    now: 25_000,
    lastVideoFinishedAt: 15_000,
    pageText: '视频播放结束，等待系统记录',
    navigationGraceMs: 15_000,
  });

  assert.deepEqual(decision, {
    action: 'skip',
    reason: 'completion_grace_period',
  });
});

test('decideAutoClick allows navigation after grace period ends', () => {
  const decision = decideAutoClick({
    text: '下一节',
    pageMode: 'study',
    anyVideoRunning: false,
    now: 40_001,
    lastVideoFinishedAt: 15_000,
    pageText: '视频播放结束，等待系统记录',
    navigationGraceMs: 15_000,
  });

  assert.deepEqual(decision, {
    action: 'navigate',
    reason: 'ready',
  });
});

test('detectSectionKind marks quiz and evaluation sections as skippable kinds', () => {
  assert.equal(detectSectionKind('章节测验：基金销售适当性'), 'quiz');
  assert.equal(detectSectionKind('课后评价'), 'evaluation');
  assert.equal(detectSectionKind('第一节 视频学习'), 'video');
});

test('chooseNextPlayableSection skips quiz items and returns next unfinished video', () => {
  const section = chooseNextPlayableSection([
    { text: '第一节 视频学习', completed: true },
    { text: '章节测验', completed: false },
    { text: '第二节 视频学习', completed: false },
    { text: '课后评价', completed: false },
  ], 0);

  assert.deepEqual(section, {
    index: 2,
    text: '第二节 视频学习',
    kind: 'video',
  });
});

test('shouldTriggerRewindFallback returns true after confirmation timeout', () => {
  const shouldRewind = shouldTriggerRewindFallback({
    anyVideoRunning: false,
    lastVideoFinishedAt: 10_000,
    now: 50_500,
    serverConfirmedAt: 0,
    fallbackAttempts: 0,
    completionTimeoutMs: 30_000,
    maxFallbackAttempts: 2,
  });

  assert.equal(shouldRewind, true);
});

test('shouldTriggerRewindFallback stops after max fallback attempts', () => {
  const shouldRewind = shouldTriggerRewindFallback({
    anyVideoRunning: false,
    lastVideoFinishedAt: 10_000,
    now: 50_500,
    serverConfirmedAt: 0,
    fallbackAttempts: 2,
    completionTimeoutMs: 30_000,
    maxFallbackAttempts: 2,
  });

  assert.equal(shouldRewind, false);
});
