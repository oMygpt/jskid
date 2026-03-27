// ==UserScript==
// @name         AMAC 培训系统 - 究极光速挂机助手
// @namespace    http://tampermonkey.net/
// @version      5.4
// @description  [精准打击] 递归扫描自动播放 + 直接操控 AMAC 原生进度上报通路，无需伪造阿里云埋点。
// @author       Claude
// @match        *://peixun.amac.org.cn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log('--- AMAC GOD MODE v5.4 [RECURSIVE SCAN + DIRECT PROGRESS] ACTIVATED ---');

    // ============================================================
    // 1. 焦点保护 — 立即执行，不等 DOM
    // ============================================================
    function blockEvents(win) {
        var noop = function(e) { e.stopImmediatePropagation(); return false; };
        win.addEventListener('blur', noop, true);
        win.addEventListener('mouseleave', noop, true);
        win.addEventListener('focusout', noop, true);
        win.addEventListener('visibilitychange', noop, true);
        try {
            Object.defineProperty(win.document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
            Object.defineProperty(win.document, 'hidden', { get: function() { return false; }, configurable: true });
        } catch(e) {}
    }

    // 立即对主窗口生效
    blockEvents(window);

    // ============================================================
    // 2. 视频核心注入（第一层：纯 <video> 操作，无框架依赖）
    // ============================================================
    function hackVideo(v) {
        if (!v || v._hacked) return;
        v._hacked = true;
        v.muted = true;
        v.loop = false;

        // 拦截暂停
        v.pause = (function(orig) {
            return function() {
                if (v.ended || v._hasFinished) return orig.apply(this, arguments);
            };
        })(v.pause);

        // 监听结束
        v.addEventListener('ended', function() {
            v._hasFinished = true;
        });

        // 主动播放
        if (v.paused && !v.ended) {
            v.play().catch(function(){});
        }

        console.log('[GOD] 视频已接管: duration=' + Math.floor(v.duration || 0) + 's');

        // 监控循环
        var monitor = setInterval(function() {
            if (v.ended || (v.duration > 0 && v.currentTime / v.duration > 0.999)) {
                v._hasFinished = true;
            }

            if (v._hasFinished) {
                v.playbackRate = 1.0;
                clearInterval(monitor);
                return;
            }

            if (v.paused) v.play().catch(function(){});

            var remain = v.duration - v.currentTime;
            if (remain < 15) {
                if (v.playbackRate !== 1.0) v.playbackRate = 1.0;
            } else {
                if (v.playbackRate !== 16.0) v.playbackRate = 16.0;
                if (v.readyState >= 2) v.currentTime += 5.0;
            }
        }, 1000);
    }

    // ============================================================
    // 3. 递归扫描（与 v2.6 相同模式）
    // ============================================================
    function scan(root) {
        try {
            root.querySelectorAll('video').forEach(hackVideo);
            root.querySelectorAll('iframe').forEach(function(f) {
                try {
                    var doc = f.contentDocument || f.contentWindow.document;
                    if (doc) {
                        // 对 iframe 窗口也屏蔽事件
                        try { blockEvents(f.contentWindow); } catch(e) {}
                        scan(doc);
                    }
                } catch(e) {}
            });
        } catch(e) {}
    }

    function isAnyVideoRunning(root) {
        try {
            var videos = Array.from(root.querySelectorAll('video'));
            if (videos.some(function(v) { return !v.ended && !v._hasFinished; })) return true;
            var iframes = Array.from(root.querySelectorAll('iframe'));
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (doc && isAnyVideoRunning(doc)) return true;
                } catch(e) {}
            }
        } catch(e) {}
        return false;
    }

    // ============================================================
    // 4. 第二层：AMAC 进度 Hook（独立于视频播放）
    // ============================================================
    var _progressHooked = false;

    function hookAmacProgress() {
        if (_progressHooked) return;

        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
            try {
                var iframeWin = iframes[i].contentWindow;
                if (!iframeWin) continue;

                var mts = iframeWin.MtsWebAliPlayer;
                if (!mts || !mts.player) continue;

                var vInfo = mts._vInfo;
                var parentVideoInfo = window.videoInfo;
                if (!vInfo || !parentVideoInfo) continue;

                var duration = vInfo.duration || 0;
                if (duration <= 0) continue;

                // 废掉 pausePlayer
                mts.pausePlayer = function() {};
                mts._pauseHooked = true;

                // 移除 jQuery blur
                try {
                    if (iframeWin.$ || iframeWin.jQuery) {
                        (iframeWin.$ || iframeWin.jQuery)(iframeWin).off('blur');
                    }
                } catch(e) {}

                // 绕过 canSeekable
                mts.player.canSeekable = function() { return 1; };

                // 已完成不需要 hook
                if (vInfo.isFinish == 2) {
                    _progressHooked = true;
                    console.log('[GOD] AMAC: 已完成，跳过 hook');
                    return;
                }

                // 主动启动 Aliplayer（触发 play 事件链）
                try { mts.player.play(); } catch(e) {}

                console.log('[GOD] AMAC Hook: 时长=' + duration + 's, 已学=' + vInfo.studySecond + 's');

                // --- 劫持 postProgress ---
                var fakeStudyTime = parseInt(vInfo.studySecond) || 0;
                var origPostProgress = mts.postProgress.bind(mts);

                mts.postProgress = function(type) {
                    var prev = vInfo.studySecond;
                    vInfo.studySecond = Math.max(0, fakeStudyTime - 5);
                    parentVideoInfo.studySecond = vInfo.studySecond;

                    var origGetTime = mts.player.getCurrentTime;
                    mts.player.getCurrentTime = function() { return fakeStudyTime; };

                    origPostProgress(type);

                    mts.player.getCurrentTime = origGetTime;
                    vInfo.studySecond = Math.max(prev, fakeStudyTime);
                    parentVideoInfo.studySecond = vInfo.studySecond;

                    console.log('[GOD] postProgress(' + type + ') fake=' + Math.floor(fakeStudyTime) + 's/' + duration + 's');
                };

                // --- 劫持 videoPlayEnd：不 seek(0) ---
                mts.videoPlayEnd = function() {
                    mts.postProgress('Play End');
                    clearInterval(mts.pTimer);
                };

                // --- 伪造时间递增 + 上报 ---
                mts.postProgress('Interval-start');

                var progressTimer = setInterval(function() {
                    fakeStudyTime += 1;
                    if (fakeStudyTime > duration) fakeStudyTime = duration;

                    if (fakeStudyTime >= duration) {
                        clearInterval(progressTimer);
                        mts.postProgress('Play End');
                        setTimeout(function() {
                            if (vInfo.isFinish != 2) {
                                try {
                                    parentVideoInfo.studySecond = Math.max(0, duration - 5);
                                    window.playerLogUpdate('2', duration);
                                    console.log('[GOD] playerLogUpdate(2, ' + duration + ') 完成');
                                } catch(e) {}
                            }
                        }, 2000);
                        return;
                    }
                }, 1000);

                // 每 30 秒通过 postProgress 上报
                var reportTimer = setInterval(function() {
                    if (fakeStudyTime >= duration) { clearInterval(reportTimer); return; }
                    mts.postProgress('Interval-progress');
                }, 30000);

                // 每 45 秒直接 playerLogUpdate 双保险
                var directTimer = setInterval(function() {
                    if (fakeStudyTime >= duration) { clearInterval(directTimer); return; }
                    var t = Math.floor(fakeStudyTime);
                    parentVideoInfo.studySecond = Math.max(0, t - 5);
                    vInfo.studySecond = parentVideoInfo.studySecond;
                    try { window.playerLogUpdate('1', t); } catch(e) {}
                    parentVideoInfo.studySecond = t;
                    vInfo.studySecond = t;
                    console.log('[GOD] playerLogUpdate(1, ' + t + ')');
                }, 45000);

                _progressHooked = true;
                return;

            } catch(e) {}
        }
    }

    // ============================================================
    // 5. 智能点击
    // ============================================================
    function autoClick() {
        var confirmKeywords = ['确定', '确认', '继续', '好的', '阅读', '同意', '知道了'];
        var jumpKeywords = ['下一节', '进入测验', '开始练习', '去评价', '提交', '完成', '结束', '评价'];

        var running = isAnyVideoRunning(document);

        var elements = document.querySelectorAll('button, a, .btn, .ui-button, [role="button"], .layui-layer-btn0');
        elements.forEach(function(el) {
            var text = (el.innerText || '').replace(/\s+/g, '');
            if (!text || el.offsetParent === null) return;

            if (confirmKeywords.some(function(k) { return text.indexOf(k) !== -1; })) {
                var now = Date.now();
                if (!el._lastClicked || now - el._lastClicked > 5000) {
                    el._lastClicked = now;
                    el.click();
                }
                return;
            }

            if (jumpKeywords.some(function(k) { return text.indexOf(k) !== -1; })) {
                if (running) return;
                if (!el._waiting) {
                    el._waiting = true;
                    console.log('[GOD] 视频完成，15秒后跳转: ' + text);
                    setTimeout(function() {
                        el.click();
                        el._waiting = false;
                        _progressHooked = false; // 页面跳转后重置
                    }, 15000);
                }
            }
        });
    }

    // ============================================================
    // 6. 启动 — 与 v2.6 完全一致的模式：立即 setInterval，不等 DOM
    // ============================================================
    setInterval(function() {
        scan(document);
        hookAmacProgress();
        autoClick();
    }, 2500);

})();
