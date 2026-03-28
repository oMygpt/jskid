// ==UserScript==
// @name         AMAC培训助手
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  AMAC培训助手
// @author       Alone
// @match        *://peixun.amac.org.cn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    console.log('--- AMAC GOD MODE v7.0 ACTIVATED ---');

    // =============================================
    // A. 焦点屏蔽 — 立即执行
    // =============================================
    var _block = function (e) { e.stopImmediatePropagation(); return false; };
    window.addEventListener('blur', _block, true);
    window.addEventListener('mouseleave', _block, true);
    window.addEventListener('focusout', _block, true);
    window.addEventListener('visibilitychange', _block, true);
    try {
        Object.defineProperty(document, 'visibilityState', { get: function () { return 'visible'; }, configurable: true });
        Object.defineProperty(document, 'hidden', { get: function () { return false; }, configurable: true });
    } catch (e) { }

    function blockEvents(win) {
        if (win._blocked) return;
        win._blocked = true;
        win.addEventListener('blur', _block, true);
        win.addEventListener('mouseleave', _block, true);
        win.addEventListener('focusout', _block, true);
        win.addEventListener('visibilitychange', _block, true);
        try {
            Object.defineProperty(win.document, 'visibilityState', { get: function () { return 'visible'; }, configurable: true });
            Object.defineProperty(win.document, 'hidden', { get: function () { return false; }, configurable: true });
        } catch (e) { }
        try {
            var jq = win.$ || win.jQuery;
            if (jq) { jq(win).off('blur'); jq(win.document).off('blur'); }
        } catch (e) { }
    }

    // =============================================
    // B. XHR 监控 — 观察 log_update 响应
    // =============================================
    var _origXHROpen = XMLHttpRequest.prototype.open;
    var _origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this._url = url;
        return _origXHROpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
        if (this._url && this._url.indexOf('log_update') !== -1) {
            this.addEventListener('load', function () {
                console.log('[GOD] log_update 响应: ' + this.responseText);
            });
        }
        return _origXHRSend.apply(this, arguments);
    };

    // =============================================
    // C. AMAC Hook — 最小干预，让播放器自己上报
    // =============================================
    var _amacHooked = false;
    var _amacFinished = false;

    function hookAmacProgress() {
        if (_amacHooked) return;

        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
            try {
                var fw = iframes[i].contentWindow;
                if (!fw) continue;
                var mts = fw.MtsWebAliPlayer;
                if (!mts || !mts.player) continue;
                var vInfo = mts._vInfo;
                if (!vInfo) continue;
                var duration = vInfo.duration || 0;
                if (duration <= 0) continue;

                _amacHooked = true;

                // 已完成的直接标记
                if (vInfo.isFinish == 2) {
                    _amacFinished = true;
                    console.log('[GOD] 已完成，跳过 (isFinish=2)');
                    return;
                }

                // 1. 废掉 pausePlayer（防止切标签暂停）
                mts.pausePlayer = function () { };

                // 2. 解除拖拽限制
                mts.player.canSeekable = function () { return 1; };

                // 3. 劫持 videoPlayEnd：禁止 seek(0) 重播，但保留原有上报
                var origVideoPlayEnd = mts.videoPlayEnd.bind(mts);
                mts.videoPlayEnd = function () {
                    // 调原始的上报逻辑，但拦截 seek(0)
                    var origSeek = mts.player.seek;
                    mts.player.seek = function () { }; // 临时禁用 seek
                    var origPlayerPause = mts.player.pause;
                    mts.player.pause = function () { }; // 临时禁用 pause
                    try {
                        origVideoPlayEnd();
                    } catch (e) { }
                    mts.player.seek = origSeek;
                    mts.player.pause = origPlayerPause;
                    console.log('[GOD] videoPlayEnd 已执行（已拦截 seek/pause）');
                };

                // 4. 启动播放
                try { mts.player.play(); } catch (e) { }

                // 5. 在 iframe 上下文中加速视频
                try {
                    var videoEl = mts.player.tag || fw.document.querySelector('video');
                    if (videoEl) {
                        videoEl.muted = true;
                        var origPause = videoEl.pause;
                        videoEl.pause = function () {
                            if (videoEl.ended || videoEl._done) return origPause.apply(this, arguments);
                        };
                        videoEl.addEventListener('ended', function () { videoEl._done = true; });

                        fw.setInterval(function () {
                            if (videoEl._done || videoEl.ended) return;
                            if (videoEl.paused) try { videoEl.play(); } catch (e) { }
                            var remain = videoEl.duration - videoEl.currentTime;
                            if (remain < 45) {
                                // 最后45秒原速播放 — 让播放器自己的进度上报自然完成
                                videoEl.playbackRate = 1.0;
                            } else {
                                videoEl.playbackRate = 16.0;
                                if (videoEl.readyState >= 2) videoEl.currentTime += 5.0;
                            }
                        }, 1000);

                        console.log('[GOD] 视频加速已启动: dur=' + Math.floor(videoEl.duration || 0) + 's');
                    }
                } catch (e) {
                    console.log('[GOD] 视频加速失败:', e.message);
                }

                // 6. 定期检查完成状态
                var checkTimer = setInterval(function () {
                    if (vInfo.isFinish == 2) {
                        _amacFinished = true;
                        clearInterval(checkTimer);
                        console.log('[GOD] 服务器确认完成! isFinish=2');
                    }
                }, 2000);

                console.log('[GOD] AMAC Hook 完成: study=' + vInfo.studySecond + '/' + duration);
                return;
            } catch (e) { }
        }
    }

    // =============================================
    // D. 递归扫描
    // =============================================
    function scan(root) {
        try {
            var win = root.defaultView;
            if (win) blockEvents(win);
            root.querySelectorAll('iframe').forEach(function (f) {
                try {
                    var doc = null;
                    try { doc = f.contentDocument; } catch (e1) { }
                    if (!doc) try { doc = f.contentWindow.document; } catch (e2) { }
                    if (doc) scan(doc);
                } catch (e) { }
            });
        } catch (e) { }
    }

    // 检查是否有视频在播放
    function isAnyVideoRunning(root) {
        try {
            var videos = Array.from(root.querySelectorAll('video'));
            if (videos.some(function (v) { return !v.ended && !v._done; })) return true;
            var iframes = Array.from(root.querySelectorAll('iframe'));
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (doc && isAnyVideoRunning(doc)) return true;
                } catch (e) { }
            }
        } catch (e) { }
        return false;
    }

    // =============================================
    // E. 智能点击
    // =============================================
    function autoClick() {
        try {
            var confirmKW = ['确定', '确认', '继续学习', '继续', '好的', '我知道了', '知道了', '同意', '可以看，不需要'];
            var navKW = ['下一节', '下一题', '进入测验', '开始练习', '去评价', '提交', '完成', '结束', '评价'];

            var running = isAnyVideoRunning(document);

            document.querySelectorAll('button, a, .btn, [role="button"], .layui-layer-btn0, .layui-layer-btn a').forEach(function (el) {
                var text = (el.innerText || '').replace(/\s+/g, '');
                if (!text || el.offsetParent === null) return;

                if (confirmKW.some(function (k) { return text.indexOf(k) !== -1; })) {
                    var now = Date.now();
                    if (!el._lc || now - el._lc > 5000) {
                        el._lc = now;
                        el.click();
                        console.log('[GOD] 点击: ' + text);
                    }
                    return;
                }

                if (navKW.some(function (k) { return text.indexOf(k) !== -1; })) {
                    if (running) return;
                    // 有视频的页面：必须等服务器确认完成
                    if (_amacHooked && !_amacFinished) return;
                    if (!el._w) {
                        el._w = true;
                        console.log('[GOD] 准备跳转: ' + text);
                        setTimeout(function () {
                            el.click();
                            el._w = false;
                            _amacHooked = false;
                            _amacFinished = false;
                        }, 5000);
                    }
                }
            });
        } catch (e) { }
    }

    // =============================================
    // F. 主循环
    // =============================================
    setInterval(function () {
        scan(document);
        hookAmacProgress();
        autoClick();
    }, 2500);

})();
