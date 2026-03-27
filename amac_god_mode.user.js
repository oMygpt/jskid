// ==UserScript==
// @name         AMAC 培训系统 - 究极光速挂机助手
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  [精准打击] 直接操控 AMAC 原生进度上报通路 (playerLogUpdate)，绕过 canSeekable 拖拽限制，无需伪造阿里云埋点。
// @author       Claude
// @match        *://peixun.amac.org.cn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c--- AMAC GOD MODE v5.1 [DIRECT PROGRESS HACK] ACTIVATED ---', 'color: #00ff00; font-weight: bold; font-size: 14px;');

    // ============================================================
    // 1. 焦点保护：屏蔽 blur/visibilitychange 防止暂停
    //    同时覆盖主窗口和 iframe 窗口
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

        // 劫持 jQuery blur 绑定：iframe 内 $(window).on('blur') -> pausePlayer
        // 通过移除 jQuery 事件来彻底屏蔽
        try {
            if (win.$ || win.jQuery) {
                var jq = win.$ || win.jQuery;
                jq(win).off('blur');
                jq(win.document).off('blur');
                console.log('%c[GOD] jQuery blur 事件已移除 (' + (win === window ? '主窗口' : 'iframe') + ')', 'color: #00ccff');
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
    // 3. 核心：视频加速 + 直接操控进度上报
    // ============================================================
    function hackVideoAndProgress() {
        var iframe = document.querySelector('iframe[src*="player"]');
        if (!iframe) return false;

        var iframeWin, iframeDoc;
        try {
            iframeWin = iframe.contentWindow;
            iframeDoc = iframe.contentDocument;
        } catch(e) { return false; }

        if (!iframeWin || !iframeDoc) return false;

        var mts = iframeWin.MtsWebAliPlayer;
        if (!mts || !mts.player) return false;

        var video = iframeDoc.querySelector('video');
        if (!video || video._godMode) return false;
        video._godMode = true;

        var vInfo = mts._vInfo;
        var parentVideoInfo = window.videoInfo;
        if (!vInfo || !parentVideoInfo) return false;

        var duration = vInfo.duration || video.duration || 0;
        if (duration <= 0) return false;

        console.log('%c[GOD] 接管视频: 时长=' + duration + 's, 已学=' + vInfo.studySecond + 's, isFinish=' + vInfo.isFinish, 'color: #00ff00');

        // --- 3a. 绕过 canSeekable 拖拽限制 ---
        mts.player.canSeekable = function() { return 1; };
        console.log('%c[GOD] canSeekable 已解除', 'color: #00ccff');

        // --- 3b. 屏蔽 iframe 内的 blur → pausePlayer ---
        protectFocus(iframeWin);

        // 直接废掉 pausePlayer，防止任何途径触发暂停
        mts.pausePlayer = function() {
            console.log('%c[GOD] pausePlayer 已拦截', 'color: #ff6600');
        };

        // --- 3c. 已完成的视频：跳过，不做任何操作 ---
        if (vInfo.isFinish == 2) {
            console.log('%c[GOD] 该视频已完成，跳过', 'color: #999');
            return true;
        }

        // --- 3d. 劫持 postProgress：让原生上报使用我们伪造的时间 ---
        var fakeStudyTime = vInfo.studySecond || 0;  // 从上次学到的位置继续
        var origPostProgress = mts.postProgress.bind(mts);

        mts.postProgress = function(type) {
            // 更新 vInfo.studySecond 绕过 "无需发送" 的判断
            var prev = vInfo.studySecond;
            vInfo.studySecond = Math.max(0, fakeStudyTime - 5);
            parentVideoInfo.studySecond = vInfo.studySecond;

            // 临时篡改 player.getCurrentTime 返回伪造时间
            var origGetTime = mts.player.getCurrentTime;
            mts.player.getCurrentTime = function() { return fakeStudyTime; };

            origPostProgress(type);

            // 还原
            mts.player.getCurrentTime = origGetTime;
            vInfo.studySecond = Math.max(prev, fakeStudyTime);
            parentVideoInfo.studySecond = vInfo.studySecond;

            console.log('%c[GOD] postProgress(' + type + ') fakeTime=' + Math.floor(fakeStudyTime) + 's / ' + duration + 's', 'color: #66ccff');
        };

        // --- 3e. 劫持 videoPlayEnd：上报完成但不 seek(0)，不从头播放 ---
        mts.videoPlayEnd = function() {
            mts.postProgress('Play End');
            clearInterval(mts.pTimer);
            // 不执行 this.player.seek(0) 和 this.player.pause()
            console.log('%c[GOD] videoPlayEnd 已拦截（阻止 seek(0)）', 'color: #ff6600');
        };

        // --- 3f. 视频静音 + 超高速播放 ---
        video.muted = true;
        video.loop = false;

        // 屏蔽原生暂停（防止 blur/visibilitychange 残留回调触发暂停）
        var realPause = HTMLMediaElement.prototype.pause.bind(video);
        video.pause = function() {
            if (video.ended || video._godDead) return realPause();
        };

        // --- 3g. 主循环：加速视频 + 递增伪造时间 + 上报进度 ---
        var SPEED = 16.0;
        var JUMP = 5.0;
        var REPORT_INTERVAL = 30;
        var lastReportTime = Date.now();

        // 从 studySecond 位置开始播放（而不是从头）
        if (vInfo.studySecond > 0 && video.currentTime < vInfo.studySecond - 10) {
            try { mts.player.seek(vInfo.studySecond); } catch(e) {}
        }

        var monitor = setInterval(function() {
            if (video._godDead) {
                clearInterval(monitor);
                return;
            }

            // 确保播放
            if (video.paused && !video.ended) {
                video.play().catch(function(){});
            }

            // 检查视频是否播完
            if (video.ended || (video.duration > 0 && video.currentTime / video.duration > 0.999)) {
                video._godDead = true;
                fakeStudyTime = duration;
                vInfo.studySecond = duration;
                parentVideoInfo.studySecond = duration;
                console.log('%c[GOD] 视频播放完毕，触发最终上报', 'color: #ff0000; font-weight: bold');
                mts.postProgress('Play End');
                clearInterval(monitor);
                return;
            }

            var remain = video.duration - video.currentTime;

            // 最后15秒切回1x，让原生 ended 事件自然触发
            if (remain < 15) {
                video.playbackRate = 1.0;
            } else {
                video.playbackRate = SPEED;
                if (video.readyState >= 2) {
                    video.currentTime += JUMP;
                }
            }

            // 递增伪造学习时间
            fakeStudyTime += 1;
            if (fakeStudyTime > duration) fakeStudyTime = duration;

            // 定期上报
            var now = Date.now();
            if (now - lastReportTime >= REPORT_INTERVAL * 1000) {
                lastReportTime = now;
                mts.postProgress('Interval-progress');
            }
        }, 1000);

        // 立即上报一次
        mts.postProgress('Interval-start');

        // 双保险：直接调用 playerLogUpdate
        var directReport = setInterval(function() {
            if (video._godDead || fakeStudyTime >= duration) {
                clearInterval(directReport);
                if (fakeStudyTime >= duration && vInfo.isFinish != 2) {
                    try {
                        window.playerLogUpdate('2', duration);
                        console.log('%c[GOD] 直接调用 playerLogUpdate(2, ' + duration + ') 标记完成', 'color: #ff00ff; font-weight: bold');
                    } catch(e) {}
                }
                return;
            }

            var safeTime = Math.floor(fakeStudyTime);
            parentVideoInfo.studySecond = Math.max(0, safeTime - 5);
            vInfo.studySecond = parentVideoInfo.studySecond;
            try {
                window.playerLogUpdate('1', safeTime);
                console.log('%c[GOD] 直接上报 playerLogUpdate(1, ' + safeTime + ')', 'color: #ffcc00');
            } catch(e) {}
            parentVideoInfo.studySecond = safeTime;
            vInfo.studySecond = safeTime;
        }, 45000);

        return true;
    }

    // ============================================================
    // 4. 启动引擎（持续扫描，自动识别新视频）
    // ============================================================
    function boot() {
        protectFocus(window);
        setupPopupHandler();

        // 记录当前已处理的 iframe src，用于检测页面切换
        var lastIframeSrc = '';

        setInterval(function() {
            protectFocus(window);

            // 持续扫描 iframe 焦点保护
            try {
                var iframe = document.querySelector('iframe[src*="player"]');
                if (iframe && iframe.contentWindow) {
                    protectFocus(iframe.contentWindow);

                    // 持续废掉 pausePlayer（iframe 重载后需要重新 hook）
                    var mts = iframe.contentWindow.MtsWebAliPlayer;
                    if (mts && !mts._pauseHooked) {
                        mts._pauseHooked = true;
                        mts.pausePlayer = function() {};
                    }

                    // 检测 iframe src 变化（页面切换到新视频）
                    var currentSrc = iframe.src || '';
                    if (currentSrc !== lastIframeSrc) {
                        lastIframeSrc = currentSrc;
                        // iframe 变了，重置 _godMode 标记让 hack 重新生效
                        try {
                            var v = iframe.contentDocument.querySelector('video');
                            if (v) v._godMode = false;
                        } catch(e) {}
                    }
                }
            } catch(e) {}

            // 尝试接管视频
            hackVideoAndProgress();
        }, 2000);
    }

    if (document.body) {
        boot();
    } else {
        document.addEventListener('DOMContentLoaded', boot);
    }

})();
