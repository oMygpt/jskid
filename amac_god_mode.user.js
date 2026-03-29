// ==UserScript==
// @name         AMAC培训助手
// @namespace    http://tampermonkey.net/
// @version      7.2
// @description  AMAC培训助手
// @author       A
// @match        *://peixun.amac.org.cn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  console.log('--- AMAC GOD MODE v7.2 ACTIVATED ---');

  var CONFIRM_KEYWORDS = ['确定', '确认', '继续学习', '开始学习', '继续', '好的', '我知道了', '知道了', '同意', '阅读', '我已阅读'];
  var NAVIGATION_KEYWORDS = ['下一节', '下一章节', '下一个'];
  var QUIZ_TEXT_KEYWORDS = ['单选题', '多选题', '判断题', '题号', '答题', '提交试卷', '交卷', '剩余时间', '考试说明', '试卷', '上一题', '下一题'];
  var QUIZ_TITLE_KEYWORDS = ['测验', '练习', '考试', '答题'];
  var QUIZ_URL_KEYWORDS = ['quiz', 'exam', 'test', 'exercise', 'paper'];
  var COMPLETION_HINT_KEYWORDS = ['学习完成', '完成学习', '已完成'];
  var VIDEO_SECTION_KEYWORDS = ['视频', '学习', '播放', '课程'];
  var EVALUATION_SECTION_KEYWORDS = ['评价', '评估', '问卷'];
  var LOCKED_SECTION_KEYWORDS = ['未开放', '锁定', '不可学习', '敬请期待'];
  var SECTION_HINT_PATTERN = /第.{0,8}[章节课]|视频|学习|播放|测验|练习|考试|评价/;
  var ACTIVE_CLASS_PATTERN = /(active|current|selected|playing|cur|focus)/i;
  var COMPLETED_CLASS_PATTERN = /(finish|done|complete|over|passed)/i;
  var LOCKED_CLASS_PATTERN = /(disabled|lock|forbid|ban|gray)/i;

  var NAVIGATION_GRACE_MS = 20 * 1000;
  var COMPLETION_TIMEOUT_MS = 35 * 1000;
  var PROGRESS_REPORT_INTERVAL_MS = 15 * 1000;
  var DIRECT_PROGRESS_INTERVAL_MS = 20 * 1000;
  var COMPLETION_RETRY_DELAY_MS = 1500;
  var COMPLETION_RETRY_CONFIRM_MS = 4500;
  var MAX_FALLBACK_ATTEMPTS = 2;
  var SECTION_CLICK_COOLDOWN_MS = 8000;
  var BUTTON_CLICK_COOLDOWN_MS = 5000;
  var MAIN_LOOP_MS = 2500;

  var runtimeState = {
    currentSessionKey: '',
    serverConfirmedAt: 0,
    lastVideoFinishedAt: 0,
    lastProgressSentAt: 0,
    lastDirectProgressAt: 0,
    lastCompletionAttemptAt: 0,
    completionAttempts: 0,
    fallbackAttempts: 0,
    fallbackReplay: false,
    waitingForCompletion: false,
    lastSectionClickAt: 0,
    lastGenericNavAt: 0,
  };

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, '');
  }

  function includesAny(text, keywords) {
    var normalized = normalizeText(text);
    return keywords.some(function (keyword) {
      return normalized.indexOf(normalizeText(keyword)) !== -1;
    });
  }

  function hasCompletionHint(text) {
    return includesAny(text, COMPLETION_HINT_KEYWORDS);
  }

  function detectPageMode(url, title, text) {
    var lowerUrl = String(url || '').toLowerCase();
    if (QUIZ_URL_KEYWORDS.some(function (keyword) { return lowerUrl.indexOf(keyword) !== -1; })) {
      return 'quiz';
    }
    if (includesAny(title, QUIZ_TITLE_KEYWORDS) || includesAny(text, QUIZ_TEXT_KEYWORDS)) {
      return 'quiz';
    }
    return 'study';
  }

  function detectSectionKind(text) {
    if (includesAny(text, QUIZ_TEXT_KEYWORDS) || includesAny(text, QUIZ_TITLE_KEYWORDS)) {
      return 'quiz';
    }
    if (includesAny(text, EVALUATION_SECTION_KEYWORDS)) {
      return 'evaluation';
    }
    if (includesAny(text, VIDEO_SECTION_KEYWORDS)) {
      return 'video';
    }
    return 'unknown';
  }

  function shouldSkipSection(section) {
    if (!section) return true;
    if (section.locked || includesAny(section.text, LOCKED_SECTION_KEYWORDS)) {
      return true;
    }
    return section.kind === 'quiz' || section.kind === 'evaluation';
  }

  function chooseNextPlayableSection(sections, currentIndex) {
    if (currentIndex < 0) return null;
    for (var index = currentIndex + 1; index < sections.length; index += 1) {
      var section = sections[index];
      if (!section || section.completed || shouldSkipSection(section)) continue;
      if (section.kind === 'video') return section;
    }
    return null;
  }

  function shouldTriggerRewindFallback(anyVideoRunning, now) {
    if (anyVideoRunning) return false;
    if (runtimeState.serverConfirmedAt > 0 || runtimeState.lastVideoFinishedAt <= 0) return false;
    if (runtimeState.fallbackAttempts >= MAX_FALLBACK_ATTEMPTS) return false;
    return now - runtimeState.lastVideoFinishedAt >= COMPLETION_TIMEOUT_MS;
  }

  function isReadyToAdvance(pageText, anyVideoRunning, now) {
    if (anyVideoRunning) return false;
    if (runtimeState.serverConfirmedAt > 0) return true;
    if (!hasCompletionHint(pageText)) return false;
    if (runtimeState.lastVideoFinishedAt > 0 && now - runtimeState.lastVideoFinishedAt < NAVIGATION_GRACE_MS) {
      return false;
    }
    return true;
  }

  function resetSessionState(sessionKey) {
    runtimeState.currentSessionKey = sessionKey || '';
    runtimeState.serverConfirmedAt = 0;
    runtimeState.lastVideoFinishedAt = 0;
    runtimeState.lastProgressSentAt = 0;
    runtimeState.lastDirectProgressAt = 0;
    runtimeState.lastCompletionAttemptAt = 0;
    runtimeState.completionAttempts = 0;
    runtimeState.fallbackAttempts = 0;
    runtimeState.fallbackReplay = false;
    runtimeState.waitingForCompletion = false;
  }

  function clearCompletionState() {
    resetSessionState('');
  }

  function markServerConfirmed(reason) {
    if (!runtimeState.serverConfirmedAt) {
      runtimeState.serverConfirmedAt = Date.now();
      runtimeState.waitingForCompletion = false;
      runtimeState.fallbackReplay = false;
      console.log('[GOD] 服务器确认完成: ' + reason);
    }
  }

  function markVideoFinished(videoEl, reason) {
    if (!videoEl || videoEl._godFinished) return;
    videoEl._godFinished = true;
    runtimeState.lastVideoFinishedAt = Date.now();
    if (!runtimeState.serverConfirmedAt) {
      runtimeState.waitingForCompletion = true;
    }
    console.log('[GOD] 视频进入完成等待: ' + reason);
  }

  function getSessionKey(vInfo, videoEl) {
    var parts = [
      vInfo && (vInfo.courseId || vInfo.coursewareId || vInfo.lessonId || vInfo.id || vInfo.resourceId),
      videoEl && (videoEl.currentSrc || videoEl.src),
      vInfo && vInfo.duration,
    ].filter(Boolean);
    return parts.join('|');
  }

  function syncStudySecond(session, second) {
    var safeSecond = Math.max(0, Math.min(session.duration, Math.floor(second || 0)));
    try { session.vInfo.studySecond = safeSecond; } catch (e) { }
    try {
      if (session.parentVI && session.parentVI !== session.vInfo) {
        session.parentVI.studySecond = safeSecond;
      }
    } catch (e2) { }
    return safeSecond;
  }

  function getRealTime(session) {
    var realTime = 0;
    try {
      if (session.videoEl) realTime = session.videoEl.currentTime || 0;
    } catch (e) { }
    if (!realTime) {
      try {
        if (session.mts && session.mts.player && typeof session.mts.player.getCurrentTime === 'function') {
          realTime = session.mts.player.getCurrentTime() || 0;
        }
      } catch (e2) { }
    }
    return Math.max(realTime, Number(session.vInfo.studySecond) || 0);
  }

  function resolvePlayerLogUpdate(session) {
    var candidates = [
      window.playerLogUpdate,
      session.frameWindow && session.frameWindow.playerLogUpdate,
      session.frameWindow && session.frameWindow.parent && session.frameWindow.parent.playerLogUpdate,
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      if (typeof candidates[i] === 'function') return candidates[i];
    }
    return null;
  }

  function safePostProgress(session, type) {
    if (!session.mts || typeof session.mts.postProgress !== 'function') return false;
    try {
      session.mts.postProgress(type);
      console.log('[GOD] postProgress(' + type + ')');
      return true;
    } catch (e) {
      console.log('[GOD] postProgress(' + type + ') 失败: ' + e.message);
      return false;
    }
  }

  function safePlayerLogUpdate(session, kind, second) {
    var playerLogUpdate = resolvePlayerLogUpdate(session);
    if (!playerLogUpdate) return false;
    try {
      playerLogUpdate(String(kind), Math.floor(second || 0));
      console.log('[GOD] playerLogUpdate(' + kind + ', ' + Math.floor(second || 0) + ')');
      return true;
    } catch (e) {
      console.log('[GOD] playerLogUpdate(' + kind + ') 失败: ' + e.message);
      return false;
    }
  }

  function ensureVideoPatch(videoEl) {
    if (!videoEl || videoEl._godPatched) return;
    videoEl._godPatched = true;
    videoEl.muted = true;
    var originalPause = videoEl.pause;
    videoEl.pause = function () {
      if (videoEl.ended || videoEl._godFinished) {
        return originalPause.apply(this, arguments);
      }
      return undefined;
    };
    videoEl.addEventListener('ended', function () {
      markVideoFinished(videoEl, 'ended_event');
    });
    try {
      var nativeDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
      if (nativeDesc && nativeDesc.set) {
        Object.defineProperty(videoEl, 'playbackRate', {
          get: function () { return nativeDesc.get.call(videoEl); },
          set: function (val) {
            var rate = (videoEl._godDesiredRate !== undefined) ? videoEl._godDesiredRate : val;
            nativeDesc.set.call(videoEl, rate);
          },
          configurable: true
        });
      }
    } catch (e) {
      console.log('[GOD] playbackRate 锁定失败: ' + e.message);
    }
  }

  function ensurePlayerPatch(session) {
    if (!session.mts || session.mts._godWrapped) return;
    session.mts._godWrapped = true;
    session.mts.pausePlayer = function () { };
    if (session.mts.player && typeof session.mts.player.canSeekable === 'function') {
      session.mts.player.canSeekable = function () { return 1; };
    }
    if (typeof session.mts.videoPlayEnd === 'function') {
      var originalVideoPlayEnd = session.mts.videoPlayEnd.bind(session.mts);
      session.mts.videoPlayEnd = function () {
        var originalSeek = session.mts.player && session.mts.player.seek;
        var originalPlayerPause = session.mts.player && session.mts.player.pause;
        if (session.mts.player) {
          session.mts.player.seek = function () { };
          session.mts.player.pause = function () { };
        }
        try {
          originalVideoPlayEnd();
        } catch (e) { }
        if (session.mts.player) {
          session.mts.player.seek = originalSeek;
          session.mts.player.pause = originalPlayerPause;
        }
        console.log('[GOD] videoPlayEnd 已执行（已拦截 seek/pause）');
      };
    }
  }

  function applyPlaybackPlan(session) {
    if (!session.videoEl || session.videoEl.ended) return;
    var duration = Number(session.videoEl.duration) || session.duration;
    var progress = duration > 0 ? session.videoEl.currentTime / duration : 0;
    if (session.videoEl.paused) {
      try { session.videoEl.play(); } catch (e) { }
    }
    var desiredRate;
    if (runtimeState.fallbackReplay) {
      desiredRate = progress > 0.85 ? 1.0 : 4.0;
    } else if (progress < 0.6) {
      desiredRate = 8.0;
    } else if (progress < 0.85) {
      desiredRate = 4.0;
    } else if (progress < 0.95) {
      desiredRate = 1.5;
    } else {
      desiredRate = 1.0;
    }
    session.videoEl._godDesiredRate = desiredRate;
    session.videoEl.playbackRate = desiredRate;
  }

  function maybeSendProgress(session, now) {
    var realTime = getRealTime(session);
    var safeSecond = syncStudySecond(session, realTime);
    if (now - runtimeState.lastProgressSentAt >= PROGRESS_REPORT_INTERVAL_MS) {
      safePostProgress(session, 'Interval-progress');
      runtimeState.lastProgressSentAt = now;
    }
    if (now - runtimeState.lastDirectProgressAt >= DIRECT_PROGRESS_INTERVAL_MS) {
      safePlayerLogUpdate(session, '1', safeSecond);
      runtimeState.lastDirectProgressAt = now;
    }
  }

  function attemptCompletion(session, reason) {
    var now = Date.now();
    if (runtimeState.serverConfirmedAt > 0) return;
    if (now - runtimeState.lastCompletionAttemptAt < BUTTON_CLICK_COOLDOWN_MS) return;
    runtimeState.lastCompletionAttemptAt = now;
    runtimeState.completionAttempts += 1;
    runtimeState.waitingForCompletion = true;

    var finalSecond = Math.max(1, Math.floor(session.duration || getRealTime(session)));
    syncStudySecond(session, Math.max(0, finalSecond - 5));
    safePostProgress(session, 'Play End');
    safePlayerLogUpdate(session, '1', Math.max(0, finalSecond - 5));
    console.log('[GOD] 触发完成上报序列: ' + reason + ' attempt=' + runtimeState.completionAttempts);

    var sessionKey = runtimeState.currentSessionKey;
    setTimeout(function () {
      if (runtimeState.currentSessionKey !== sessionKey || runtimeState.serverConfirmedAt > 0) return;
      syncStudySecond(session, finalSecond);
      safePlayerLogUpdate(session, '2', finalSecond);
    }, COMPLETION_RETRY_DELAY_MS);

    setTimeout(function () {
      if (runtimeState.currentSessionKey !== sessionKey || runtimeState.serverConfirmedAt > 0) return;
      syncStudySecond(session, finalSecond);
      safePlayerLogUpdate(session, '2', finalSecond);
    }, COMPLETION_RETRY_CONFIRM_MS);
  }

  function getFallbackSeekTarget(duration) {
    var baseTarget = Math.floor(duration / 6);
    if (baseTarget < 30) baseTarget = Math.max(0, Math.floor(duration / 10));
    if (baseTarget > duration - 90) baseTarget = Math.max(0, duration - 90);
    return Math.max(0, baseTarget);
  }

  function triggerRewindFallback(session) {
    if (!session.videoEl || runtimeState.serverConfirmedAt > 0) return false;
    runtimeState.fallbackAttempts += 1;
    runtimeState.fallbackReplay = true;
    runtimeState.waitingForCompletion = false;
    runtimeState.lastVideoFinishedAt = 0;
    session.videoEl._godFinished = false;
    var target = getFallbackSeekTarget(session.duration);
    syncStudySecond(session, target);
    try {
      if (session.mts && session.mts.player && typeof session.mts.player.seek === 'function') {
        session.mts.player.seek(target);
      } else {
        session.videoEl.currentTime = target;
      }
    } catch (e) {
      try { session.videoEl.currentTime = target; } catch (e2) { }
    }
    try { session.videoEl.play(); } catch (e3) { }
    console.log('[GOD] completion 未确认，回退补播: target=' + target + 's attempt=' + runtimeState.fallbackAttempts);
    return true;
  }

  function buildActiveSession() {
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i += 1) {
      try {
        var frameWindow = iframes[i].contentWindow;
        if (!frameWindow) continue;
        var mts = frameWindow.MtsWebAliPlayer;
        if (!mts || !mts.player || !mts._vInfo) continue;
        var vInfo = mts._vInfo;
        var duration = Number(vInfo.duration) || 0;
        if (duration <= 0) continue;
        var videoEl = mts.player.tag || frameWindow.document.querySelector('video');
        if (!videoEl) continue;
        return {
          frameWindow: frameWindow,
          mts: mts,
          vInfo: vInfo,
          parentVI: window.videoInfo || (frameWindow.parent && frameWindow.parent.videoInfo) || null,
          videoEl: videoEl,
          duration: duration,
          sessionKey: getSessionKey(vInfo, videoEl),
        };
      } catch (e) { }
    }
    return null;
  }

  function syncActiveSession() {
    var session = buildActiveSession();
    if (!session) return null;
    if (runtimeState.currentSessionKey !== session.sessionKey) {
      resetSessionState(session.sessionKey);
      console.log('[GOD] 新视频会话: ' + session.sessionKey);
    }

    ensurePlayerPatch(session);
    ensureVideoPatch(session.videoEl);
    try { session.mts.player.play(); } catch (e) { }

    if (Number(session.vInfo.isFinish) === 2) {
      markServerConfirmed('vInfo.isFinish=2');
      markVideoFinished(session.videoEl, 'confirmed_state');
      return session;
    }

    applyPlaybackPlan(session);
    maybeSendProgress(session, Date.now());

    var realTime = getRealTime(session);
    if (realTime >= session.duration - 1 || session.videoEl.ended) {
      markVideoFinished(session.videoEl, 'playback_end');
      attemptCompletion(session, 'near_end');
    }
    return session;
  }

  function isAnyVideoRunning(root, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 5) return false;
    try {
      var videos = Array.from(root.querySelectorAll('video'));
      if (videos.some(function (videoEl) {
        if (videoEl.ended || videoEl._godFinished) return false;
        var duration = Number(videoEl.duration) || 0;
        var progress = duration > 0 ? videoEl.currentTime / duration : 0;
        return progress < 0.999;
      })) {
        return true;
      }
      var iframes = Array.from(root.querySelectorAll('iframe'));
      for (var i = 0; i < iframes.length; i += 1) {
        try {
          var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
          if (doc && isAnyVideoRunning(doc, depth + 1)) return true;
        } catch (e) { }
      }
    } catch (e) { }
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent !== null) return true;
    try {
      var style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        var rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }
    } catch (e) { }
    return false;
  }

  function isClickable(el) {
    if (!el) return false;
    var tagName = (el.tagName || '').toLowerCase();
    if (tagName === 'a' || tagName === 'button') return true;
    if (el.getAttribute('role') === 'button') return true;
    return typeof el.onclick === 'function';
  }

  function getClickableTarget(el) {
    if (!el) return null;
    if (isClickable(el)) return el;
    return el.querySelector('a, button, [role="button"]') || el;
  }

  function collectCourseSections() {
    var selector = [
      '[class*="catalog"] li', '[class*="catalog"] a', '[class*="catalog"] button',
      '[class*="chapter"] li', '[class*="chapter"] a', '[class*="chapter"] button',
      '[class*="section"] li', '[class*="section"] a', '[class*="section"] button',
      '[class*="course"] li', '[class*="course"] a', '[class*="course"] button',
      '[class*="menu"] li', '[class*="menu"] a', '[class*="menu"] button',
      '[class*="nav"] li', '[class*="nav"] a', '[class*="nav"] button',
      '[class*="sidebar"] li', '[class*="sidebar"] a', '[class*="sidebar"] button',
      '[class*="list"] li', '[class*="list"] a', '[class*="list"] button',
    ].join(',');
    var seenTexts = {};
    var sections = [];

    document.querySelectorAll(selector).forEach(function (el) {
      if (!isVisible(el)) return;
      var text = normalizeText(el.innerText || el.textContent || '');
      if (!text || text.length < 2 || text.length > 80) return;
      if (!SECTION_HINT_PATTERN.test(text)) return;
      if (seenTexts[text]) return;
      var clickable = getClickableTarget(el);
      if (!clickable || !isVisible(clickable)) return;
      var classText = [el.className, clickable.className, el.getAttribute('aria-current'), clickable.getAttribute('aria-current')].join(' ');
      var kind = detectSectionKind(text);
      sections.push({
        el: clickable,
        text: text,
        kind: kind,
        active: ACTIVE_CLASS_PATTERN.test(classText) || el.getAttribute('aria-current') === 'page',
        completed: COMPLETED_CLASS_PATTERN.test(classText) || text.indexOf('已完成') !== -1,
        locked: LOCKED_CLASS_PATTERN.test(classText) || clickable.getAttribute('aria-disabled') === 'true',
      });
      seenTexts[text] = true;
    });

    return sections;
  }

  function clickNextPlayableSection() {
    var now = Date.now();
    if (now - runtimeState.lastSectionClickAt < SECTION_CLICK_COOLDOWN_MS) return false;
    var sections = collectCourseSections();
    var currentIndex = sections.findIndex(function (section) { return section.active; });
    var nextSection = chooseNextPlayableSection(sections, currentIndex);
    if (!nextSection || !nextSection.el) return false;
    nextSection.el.click();
    runtimeState.lastSectionClickAt = now;
    clearCompletionState();
    console.log('[GOD] 切换到下一个视频小节: ' + nextSection.text);
    return true;
  }

  function clickConfirmButtons() {
    document.querySelectorAll('button, a, .btn, [role="button"], .layui-layer-btn0, .layui-layer-btn a').forEach(function (el) {
      var text = normalizeText(el.innerText || '');
      if (!text || !isVisible(el)) return;
      if (!includesAny(text, CONFIRM_KEYWORDS)) return;
      var now = Date.now();
      if (!el._godLastClicked || now - el._godLastClicked > BUTTON_CLICK_COOLDOWN_MS) {
        el._godLastClicked = now;
        el.click();
        console.log('[GOD] 点击确认: ' + text);
      }
    });
  }

  function clickGenericNextButton(pageText, anyVideoRunning) {
    var now = Date.now();
    if (now - runtimeState.lastGenericNavAt < SECTION_CLICK_COOLDOWN_MS) return false;
    var buttons = Array.from(document.querySelectorAll('button, a, .btn, [role="button"], .layui-layer-btn0, .layui-layer-btn a'));
    for (var i = 0; i < buttons.length; i += 1) {
      var el = buttons[i];
      var text = normalizeText(el.innerText || '');
      if (!text || !isVisible(el)) continue;
      if (includesAny(text, QUIZ_TITLE_KEYWORDS) || includesAny(text, EVALUATION_SECTION_KEYWORDS)) continue;
      if (!NAVIGATION_KEYWORDS.some(function (keyword) { return text.indexOf(normalizeText(keyword)) !== -1; })) continue;
      if (!isReadyToAdvance(pageText, anyVideoRunning, now)) continue;
      runtimeState.lastGenericNavAt = now;
      el.click();
      clearCompletionState();
      console.log('[GOD] 点击通用下一节按钮: ' + text);
      return true;
    }
    return false;
  }

  function blockEvents(win) {
    if (!win || win._godBlocked) return;
    win._godBlocked = true;
    var block = function (event) {
      event.stopImmediatePropagation();
      return false;
    };
    win.addEventListener('blur', block, true);
    win.addEventListener('mouseleave', block, true);
    win.addEventListener('focusout', block, true);
    win.addEventListener('visibilitychange', block, true);
    try {
      Object.defineProperty(win.document, 'visibilityState', { get: function () { return 'visible'; }, configurable: true });
      Object.defineProperty(win.document, 'hidden', { get: function () { return false; }, configurable: true });
    } catch (e) { }
    try {
      var jq = win.$ || win.jQuery;
      if (jq) {
        jq(win).off('blur');
        jq(win.document).off('blur');
      }
    } catch (e2) { }
  }

  function scan(root) {
    try {
      if (root && root.defaultView) blockEvents(root.defaultView);
      Array.from(root.querySelectorAll('iframe')).forEach(function (frame) {
        try {
          var doc = frame.contentDocument || frame.contentWindow.document;
          if (doc) scan(doc);
        } catch (e) { }
      });
    } catch (e2) { }
  }

  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._godUrl = url;
    return originalXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this._godUrl && this._godUrl.indexOf('log_update') !== -1) {
      this.addEventListener('load', function () {
        var responseText = String(this.responseText || '');
        console.log('[GOD] log_update 响应: ' + responseText);
        if (responseText.indexOf('"isFinish":2') !== -1 || responseText.indexOf('"isFinish":"2"') !== -1) {
          markServerConfirmed('xhr_response');
        }
      });
    }
    return originalXHRSend.apply(this, arguments);
  };

  if (typeof window.fetch === 'function') {
    var originalFetch = window.fetch;
    window.fetch = function () {
      var fetchUrl = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url) || '';
      if (fetchUrl.indexOf('log_update') !== -1) {
        return originalFetch.apply(this, arguments).then(function (response) {
          try {
            var cloned = response.clone();
            cloned.text().then(function (text) {
              console.log('[GOD] fetch log_update 响应: ' + text);
              if (text.indexOf('"isFinish":2') !== -1 || text.indexOf('"isFinish":"2"') !== -1) {
                markServerConfirmed('fetch_response');
              }
            });
          } catch (e) { }
          return response;
        });
      }
      return originalFetch.apply(this, arguments);
    };
  }

  blockEvents(window);
  setInterval(function () {
    scan(document);
    var session = syncActiveSession();
    var pageText = document.body ? document.body.innerText : '';
    clickConfirmButtons();

    if (detectPageMode(window.location.href, document.title, pageText) === 'quiz') {
      return;
    }

    var anyVideoRunning = isAnyVideoRunning(document);
    if (session && shouldTriggerRewindFallback(anyVideoRunning, Date.now())) {
      triggerRewindFallback(session);
      return;
    }
    if (!isReadyToAdvance(pageText, anyVideoRunning, Date.now())) return;
    if (clickNextPlayableSection()) return;
    clickGenericNextButton(pageText, anyVideoRunning);
  }, MAIN_LOOP_MS);
})();
