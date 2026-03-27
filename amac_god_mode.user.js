// ==UserScript==
// @name         AMAC 培训系统 - 究极光速挂机助手
// @namespace    http://tampermonkey.net/
// @version      5.3
// @description  [精准打击] 递归扫描自动播放 + 直接操控 AMAC 原生进度上报通路，无需伪造阿里云埋点。
// @author       Claude
// @match        *://peixun.amac.org.cn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c--- AMAC GOD MODE v5.3 [RECURSIVE SCAN + DIRECT PROGRESS] ACTIVATED ---', 'color: #00ff00; font-weight: bold; font-size: 14px;');

    // ============================================================
    // 1. 焦点保护
    // ============================================================
    function protectFocus(win) {
        if (win._focusProtected) return;
        win._focusProtected = true;

        var block = function(e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            return false;
        };
        win.addEventListener('blur', block, true);
        win.addEventListener('mouseleave', block, true);
        win.addEventListener('focusout', block, true);
        win.addEventListener('visibilitychange', block, true);

        try {
            Object.defineProperty(win.document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });
            Object.defineProperty(win.document, 'hidden', { get: function() { return false; }, configurable: true });
        } catch(e) {}

        try {
            if (win.$ || win.jQuery) {
                var jq = win.$ || win.jQuery;
                jq(win).off('blur');
                jq(win.document).off('blur');
            }
        } catch(e) {}
    }

    // ============================================================
    // 2. 弹窗自动处理
    // ============================================================
    function setupPopupHandler() {
        if (!document.body) return;
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(function(node) {
                    if (node.nodeType !== 1) return;
                    node.querySelectorAll('button, a, .layui-layer-btn a, .layui-layer-btn0').forEach(function(btn) {
                        var text = (btn.innerText || '').replace(/\s+/g, '');
                        if (['确定', '确认', '继续', '好的', '评价', '反馈', '提交', '同意'].some(function(k) { return text.indexOf(k) !== -1; })) {
                            btn.click();
                        }
                    });
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ============================================================
    // 3. 第一层：递归扫描 + 视频自动播放/加速
    //    不依赖任何播放器框架，直接操作 <video> 元素
    // ============================================================
    function hackVideo(v) {
        if (!v || v._hacked) return;
        v._hacked = true;
        v.muted = true;
        v.loop = false;

        // 拦截暂停
        var origPause = v.pause;
        v.pause = function() {
            if (v.ended || v._hasFinished) return origPause.apply(this, arguments);
        };

        // 监听结束
        v.addEventListener('ended', function() {
            v._hasFinished = true;
            console.log('%c[GOD] 视频 ended 事件触发，锁定状态', 'color: #ff0000');
        });

        // 主动启动播放
        if (v.paused && !v.ended) {
            v.play().catch(function(){});
        }

        console.log('%c[GOD] 视频已接管: duration=' + Math.floor(v.duration || 0) + 's', 'color: #00ff00');

        // 监控循环
        var monitor = setInterval(function() {
            // 完成判定
            if (v.ended || (v.duration > 0 && v.currentTime / v.duration > 0.999)) {
                v._hasFinished = true;
            }

            if (v._hasFinished) {
                v.playbackRate = 1.0;
                clearInterval(monitor);
                return;
            }

            // 确保播放
            if (v.paused) v.play().catch(function(){});

            // 动态调速
            var remain = v.duration - v.currentTime;
            if (remain < 15) {
                v.playbackRate = 1.0;
            } else {
                v.playbackRate = 16.0;
                if (v.readyState >= 2) {
                    v.currentTime += 5.0;
                }
            }
        }, 1000);
    }

    // 递归扫描所有 document（含嵌套 iframe）
    function scanAndHackVideos(root) {
        try {
            // 焦点保护
            var win = root.defaultView || root.parentWindow;
            if (win) protectFocus(win);

            // 扫描 video
            root.querySelectorAll('video').forEach(hackVideo);

            // 递归 iframe
            root.querySelectorAll('iframe').forEach(function(f) {
                try {
                    var doc = f.contentDocument || f.contentWindow.document;
                    if (doc) scanAndHackVideos(doc);
                } catch(e) {}
            });
        } catch(e) {}
    }

    // 判断是否还有视频在跑（用于自动点击判断）
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
    // 4. 第二层：AMAC 进度 Hook（当 MtsWebAliPlayer 可用时增强）
    //    与第一层独立运行，第一层管播放/加速，第二层管进度上报
    // ============================================================
    var _progressHooked = false;

    function hookAmacProgress() {
        if (_progressHooked) return;

        // 找到含有 MtsWebAliPlayer 的 iframe
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
                if (!mts._pauseHooked) {
                    mts._pauseHooked = true;
                    mts.pausePlayer = function() {};
                }

                // 绕过 canSeekable
                mts.player.canSeekable = function() { return 1; };

                // 已完成的不需要 hook 进度
                if (vInfo.isFinish == 2) {
                    console.log('%c[GOD] AMAC 进度: 已完成，无需 hook', 'color: #999');
                    _progressHooked = true;
                    return;
                }

                // 主动启动 Aliplayer 播放（触发完整事件链）
                try { mts.player.play(); } catch(e) {}

                console.log('%c[GOD] AMAC 进度 Hook: 时长=' + duration + 's, 已学=' + vInfo.studySecond + 's', 'color: #00ff00; font-weight: bold');

                // --- 劫持 postProgress ---
                var fakeStudyTime = vInfo.studySecond || 0;
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

                    console.log('%c[GOD] postProgress(' + type + ') fakeTime=' + Math.floor(fakeStudyTime) + 's / ' + duration + 's', 'color: #66ccff');
                };

                // --- 劫持 videoPlayEnd：不 seek(0) ---
                mts.videoPlayEnd = function() {
                    mts.postProgress('Play End');
                    clearInterval(mts.pTimer);
                    console.log('%c[GOD] videoPlayEnd 拦截（阻止 seek(0)）', 'color: #ff6600');
                };

                // --- 伪造时间递增 + 定期上报 ---
                var REPORT_INTERVAL = 30;
                var lastReportTime = Date.now();

                // 立即上报一次
                mts.postProgress('Interval-start');

                var progressTimer = setInterval(function() {
                    // 递增伪造时间
                    fakeStudyTime += 1;
                    if (fakeStudyTime > duration) fakeStudyTime = duration;

                    // 定期通过 postProgress 上报
                    var now = Date.now();
                    if (now - lastReportTime >= REPORT_INTERVAL * 1000) {
                        lastReportTime = now;
                        mts.postProgress('Interval-progress');
                    }

                    // 完成
                    if (fakeStudyTime >= duration) {
                        clearInterval(progressTimer);
                        mts.postProgress('Play End');

                        // 双保险：直接 playerLogUpdate
                        setTimeout(function() {
                            if (vInfo.isFinish != 2) {
                                try {
                                    parentVideoInfo.studySecond = Math.max(0, duration - 5);
                                    window.playerLogUpdate('2', duration);
                                    console.log('%c[GOD] playerLogUpdate(2, ' + duration + ') 完成标记', 'color: #ff00ff; font-weight: bold');
                                } catch(e) {}
                            }
                        }, 2000);
                    }
                }, 1000);

                // 双保险：直接 playerLogUpdate 定期上报
                var directTimer = setInterval(function() {
                    if (fakeStudyTime >= duration) {
                        clearInterval(directTimer);
                        return;
                    }
                    var safeTime = Math.floor(fakeStudyTime);
                    parentVideoInfo.studySecond = Math.max(0, safeTime - 5);
                    vInfo.studySecond = parentVideoInfo.studySecond;
                    try {
                        window.playerLogUpdate('1', safeTime);
                        console.log('%c[GOD] playerLogUpdate(1, ' + safeTime + ')', 'color: #ffcc00');
                    } catch(e) {}
                    parentVideoInfo.studySecond = safeTime;
                    vInfo.studySecond = safeTime;
                }, 45000);

                _progressHooked = true;
                return;

            } catch(e) {}
        }
    }

    // ============================================================
    // 5. 智能点击（来自 v2.6）
    // ============================================================
    function autoClick() {
        var confirmKeywords = ['确定', '确认', '继续', '好的', '阅读', '同意', '知道了'];
        var jumpKeywords = ['下一节', '进入测验', '开始练习', '去评价', '提交', '完成', '结束', '评价'];

        var running = isAnyVideoRunning(document);

        var elements = document.querySelectorAll('button, a, .btn, .ui-button, [role="button"], .layui-layer-btn0');
        elements.forEach(function(el) {
            var text = (el.innerText || '').replace(/\s+/g, '');
            if (!text || el.offsetParent === null) return;

            // 确认类：直接点
            if (confirmKeywords.some(function(k) { return text.indexOf(k) !== -1; })) {
                var now = Date.now();
                if (!el._lastClicked || now - el._lastClicked > 5000) {
                    el._lastClicked = now;
                    el.click();
                }
                return;
            }

            // 跳转类：视频播完后才点
            if (jumpKeywords.some(function(k) { return text.indexOf(k) !== -1; })) {
                if (running) return;
                if (!el._waiting) {
                    el._waiting = true;
                    console.log('%c[GOD] 视频已完成，15秒后自动跳转: ' + text, 'color: #ff9900');
                    setTimeout(function() {
                        el.click();
                        el._waiting = false;
                        // 页面跳转后重置 progress hook
                        _progressHooked = false;
                    }, 15000);
                }
            }
        });
    }

    // ============================================================
    // 6. 启动
    // ============================================================
    function boot() {
        protectFocus(window);
        setupPopupHandler();

        setInterval(function() {
            // 第一层：递归扫描发现并加速所有 video
            scanAndHackVideos(document);

            // 第二层：AMAC 进度 hook（找到 MtsWebAliPlayer 时生效）
            hookAmacProgress();

            // 智能点击
            autoClick();
        }, 2500);
    }

    if (document.body) {
        boot();
    } else {
        document.addEventListener('DOMContentLoaded', boot);
    }

})();
