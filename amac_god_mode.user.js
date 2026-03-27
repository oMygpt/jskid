// ==UserScript==
// @name         AMAC 培训系统 - 究极光速挂机助手
// @namespace    http://tampermonkey.net/
// @version      5.2
// @description  [精准打击] 直接操控 AMAC 原生进度上报通路 (playerLogUpdate)，绕过 canSeekable 拖拽限制，无需伪造阿里云埋点。
// @author       Claude
// @match        *://peixun.amac.org.cn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c--- AMAC GOD MODE v5.2 [DIRECT PROGRESS HACK] ACTIVATED ---', 'color: #00ff00; font-weight: bold; font-size: 14px;');

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
    // 3. 发现视频：扫描主页面 + 所有 iframe 中的 video 元素
    //    返回 { video, mts, iframeWin } 或 null
    // ============================================================
    function findVideo() {
        // 扫描所有 iframe（不限定 src）
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
            try {
                var iframeWin = iframes[i].contentWindow;
                var iframeDoc = iframes[i].contentDocument;
                if (!iframeWin || !iframeDoc) continue;

                var mts = iframeWin.MtsWebAliPlayer;
                if (mts && mts.player) {
                    var video = iframeDoc.querySelector('video');
                    if (video) return { video: video, mts: mts, iframeWin: iframeWin };
                }

                // 也检测没有 MtsWebAliPlayer 但有 video 的 iframe
                var v = iframeDoc.querySelector('video');
                if (v && v.duration > 0) return { video: v, mts: null, iframeWin: iframeWin };
            } catch(e) {}
        }

        // 主页面直接嵌入的 video
        var mainVideo = document.querySelector('video');
        if (mainVideo && mainVideo.duration > 0) {
            return { video: mainVideo, mts: null, iframeWin: null };
        }

        return null;
    }

    // ============================================================
    // 4. 核心：自动播放 + 视频加速 + 直接操控进度上报
    // ============================================================
    function hackVideoAndProgress() {
        var found = findVideo();
        if (!found) return false;

        var video = found.video;
        var mts = found.mts;
        var iframeWin = found.iframeWin;

        if (video._godMode) return false;
        video._godMode = true;

        var parentVideoInfo = window.videoInfo;
        var vInfo = mts ? mts._vInfo : null;

        // 无 Aliplayer 的普通 video：简单加速
        if (!mts || !vInfo || !parentVideoInfo) {
            console.log('%c[GOD] 发现普通视频，简单加速', 'color: #00ff00');
            video.muted = true;
            video.playbackRate = 16.0;
            video.play().catch(function(){});
            return true;
        }

        var duration = vInfo.duration || video.duration || 0;
        if (duration <= 0) return false;

        console.log('%c[GOD] 接管视频: 时长=' + duration + 's, 已学=' + vInfo.studySecond + 's, isFinish=' + vInfo.isFinish, 'color: #00ff00; font-weight: bold');

        // --- 4a. 绕过 canSeekable 拖拽限制 ---
        mts.player.canSeekable = function() { return 1; };

        // --- 4b. 屏蔽 iframe 内的 blur → pausePlayer ---
        if (iframeWin) protectFocus(iframeWin);

        // 直接废掉 pausePlayer，防止任何途径触发暂停
        mts.pausePlayer = function() {};
        mts._pauseHooked = true;

        // --- 4c. 已完成的视频：跳过 ---
        if (vInfo.isFinish == 2) {
            console.log('%c[GOD] 该视频已完成，跳过', 'color: #999');
            return true;
        }

        // --- 4d. 劫持 postProgress：让原生上报使用伪造时间 ---
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

        // --- 4e. 劫持 videoPlayEnd：上报完成但不 seek(0) ---
        mts.videoPlayEnd = function() {
            mts.postProgress('Play End');
            clearInterval(mts.pTimer);
            console.log('%c[GOD] videoPlayEnd 已拦截（阻止 seek(0)）', 'color: #ff6600');
        };

        // --- 4f. 视频静音 + 屏蔽原生暂停 ---
        video.muted = true;
        video.loop = false;

        var realPause = HTMLMediaElement.prototype.pause.bind(video);
        video.pause = function() {
            if (video.ended || video._godDead) return realPause();
        };

        // --- 4g. 主动启动播放 ---
        //   通过 Aliplayer 接口启动，触发完整的 play 事件链
        //   (listennerProgress / _isPlay 状态更新等)
        console.log('%c[GOD] 主动启动播放...', 'color: #00ff00');
        try {
            mts.player.play();
        } catch(e) {
            video.play().catch(function(){});
        }

        // --- 4h. 主循环：加速视频 + 递增伪造时间 + 上报进度 ---
        var SPEED = 16.0;
        var JUMP = 5.0;
        var REPORT_INTERVAL = 30;
        var lastReportTime = Date.now();

        var monitor = setInterval(function() {
            if (video._godDead) {
                clearInterval(monitor);
                return;
            }

            // 确保播放：通过 Aliplayer 接口恢复，而非直接 video.play()
            if (video.paused && !video.ended) {
                try { mts.player.play(); } catch(e) {
                    video.play().catch(function(){});
                }
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

            if (remain < 15) {
                video.playbackRate = 1.0;
            } else {
                video.playbackRate = SPEED;
                if (video.readyState >= 2) {
                    video.currentTime += JUMP;
                }
            }

            fakeStudyTime += 1;
            if (fakeStudyTime > duration) fakeStudyTime = duration;

            var now = Date.now();
            if (now - lastReportTime >= REPORT_INTERVAL * 1000) {
                lastReportTime = now;
                mts.postProgress('Interval-progress');
            }
        }, 1000);

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
    // 5. 启动引擎（持续扫描，自动识别新视频）
    // ============================================================
    function boot() {
        protectFocus(window);
        setupPopupHandler();

        // 追踪上一次处理的 video 元素引用，检测新视频出现
        var lastVideoRef = null;
        var lastIframeSrc = '';

        setInterval(function() {
            protectFocus(window);

            // 持续扫描所有 iframe 的焦点保护 + pausePlayer hook
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var fw = iframes[i].contentWindow;
                    if (!fw) continue;
                    protectFocus(fw);

                    var mts = fw.MtsWebAliPlayer;
                    if (mts && !mts._pauseHooked) {
                        mts._pauseHooked = true;
                        mts.pausePlayer = function() {};
                    }
                } catch(e) {}
            }

            // 检测视频变化：iframe src 变化 或 video 元素更换
            var found = findVideo();
            if (found) {
                var currentVideo = found.video;
                var currentIframeSrc = found.iframeWin ? (found.iframeWin.location.href || '') : '';

                // video 元素变了（新页面/新章节），重置让 hack 重新生效
                if (currentVideo !== lastVideoRef || currentIframeSrc !== lastIframeSrc) {
                    if (currentVideo._godMode && currentVideo !== lastVideoRef) {
                        currentVideo._godMode = false;
                    }
                    lastVideoRef = currentVideo;
                    lastIframeSrc = currentIframeSrc;
                }
            }

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
