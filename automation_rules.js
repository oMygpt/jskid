const STUDY_CONFIRM_KEYWORDS = [
  '确定',
  '确认',
  '继续学习',
  '开始学习',
  '继续',
  '好的',
  '我已阅读',
  '知道了',
  '同意',
  '阅读',
];

const NAVIGATION_KEYWORDS = [
  '下一节',
  '进入测验',
  '开始练习',
  '去评价',
  '提交',
  '完成',
  '结束',
  '评价',
];

const QUIZ_TEXT_KEYWORDS = [
  '单选题',
  '多选题',
  '判断题',
  '题号',
  '答题',
  '提交试卷',
  '交卷',
  '剩余时间',
  '考试说明',
  '试卷',
  '上一题',
  '下一题',
];

const QUIZ_TITLE_KEYWORDS = ['测验', '练习', '考试', '答题'];
const QUIZ_URL_KEYWORDS = ['quiz', 'exam', 'test', 'exercise', 'paper'];
const COMPLETION_HINT_KEYWORDS = ['学习完成', '完成学习', '已完成'];

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '');
}

function includesAny(text, keywords) {
  const normalized = normalizeText(text);
  return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
}

function hasCompletionHint(text) {
  return includesAny(text, COMPLETION_HINT_KEYWORDS);
}

function detectPageMode({ url = '', title = '', text = '' }) {
  const urlLower = String(url || '').toLowerCase();
  if (QUIZ_URL_KEYWORDS.some((keyword) => urlLower.includes(keyword))) {
    return 'quiz';
  }

  if (includesAny(title, QUIZ_TITLE_KEYWORDS)) {
    return 'quiz';
  }

  if (includesAny(text, QUIZ_TEXT_KEYWORDS)) {
    return 'quiz';
  }

  return 'study';
}

function decideAutoClick({
  text,
  pageMode = 'study',
  anyVideoRunning = false,
  now = Date.now(),
  lastVideoFinishedAt = 0,
  pageText = '',
  navigationGraceMs = 20_000,
}) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return { action: 'skip', reason: 'empty_text' };
  }

  if (pageMode === 'quiz') {
    return { action: 'skip', reason: 'quiz_mode' };
  }

  if (includesAny(normalizedText, STUDY_CONFIRM_KEYWORDS)) {
    return { action: 'confirm', reason: 'confirm' };
  }

  if (!includesAny(normalizedText, NAVIGATION_KEYWORDS)) {
    return { action: 'skip', reason: 'unmatched' };
  }

  if (anyVideoRunning) {
    return { action: 'skip', reason: 'video_running' };
  }

  if (hasCompletionHint(pageText)) {
    return { action: 'navigate', reason: 'ready' };
  }

  if (lastVideoFinishedAt > 0 && now - lastVideoFinishedAt < navigationGraceMs) {
    return { action: 'skip', reason: 'completion_grace_period' };
  }

  return { action: 'navigate', reason: 'ready' };
}

module.exports = {
  decideAutoClick,
  detectPageMode,
  hasCompletionHint,
  normalizeText,
};
