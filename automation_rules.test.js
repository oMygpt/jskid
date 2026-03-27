const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decideAutoClick,
  detectPageMode,
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
