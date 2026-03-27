const { decideAutoClick, detectPageMode } = require('./automation_rules');

const NAVIGATION_GRACE_MS = 20_000;

// 这是在网页加载前直接注入内核的脚本
window.addEventListener('DOMContentLoaded', () => {
    console.log('%c AMAC-AUTO: 脚本已在内核激活 ', 'background: #222; color: #bada55');

    const markVideoFinished = (v) => {
        if (!v._finishedAt) v._finishedAt = Date.now();
        v._hasFinished = true;
        if (v._warpDrive) {
            clearInterval(v._warpDrive);
            v._warpDrive = null;
        }
    };

    const collectVideoState = (root) => {
        const state = {
            anyVideoRunning: false,
            lastVideoFinishedAt: 0,
        };

        const visit = (doc) => {
            Array.from(doc.querySelectorAll('video')).forEach((video) => {
                const duration = Number(video.duration) || 0;
                const progress = duration > 0 ? video.currentTime / duration : 0;

                if (video.ended || progress > 0.999) {
                    markVideoFinished(video);
                }

                if (!video.ended && !video._hasFinished) {
                    state.anyVideoRunning = true;
                }

                if (video._finishedAt) {
                    state.lastVideoFinishedAt = Math.max(state.lastVideoFinishedAt, video._finishedAt);
                }
            });

            Array.from(doc.querySelectorAll('iframe')).forEach((frame) => {
                try {
                    if (frame.contentDocument) visit(frame.contentDocument);
                } catch (e) {}
            });
        };

        visit(root);
        return state;
    };

    // 1. 屏蔽所有导致暂停的系统检测
    const noop = (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        return false;
    };
    window.addEventListener('blur', noop, true);
    window.addEventListener('mouseleave', noop, true);
    document.addEventListener('visibilitychange', noop, true);

    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });

    // 2. 核心视频逻辑 (前快后慢)
    const hackVideo = (v) => {
        if (v._hacked) return;
        v._hacked = true;
        v.muted = true; // 强制静音

        // 屏蔽暂停指令
        const originalPause = v.pause;
        v.pause = function() {
            if (v.ended) return originalPause.apply(this, arguments);
        };

        const checkSpeed = () => {
            const duration = Number(v.duration) || 0;
            const progress = duration > 0 ? v.currentTime / duration : 0;
            if (v.ended || progress > 0.999) {
                markVideoFinished(v);
                return;
            }

            const remainTime = v.duration - v.currentTime;

            // 末段切回 1x，给平台完成上报留出时间。
            if (remainTime < 45 || progress > 0.93) {
                v.playbackRate = 1.0;
                if (v._warpDrive) {
                    clearInterval(v._warpDrive);
                    v._warpDrive = null;
                }
            } else {
                v.playbackRate = 16.0;
                if (!v._warpDrive) {
                    v._warpDrive = setInterval(() => {
                        if (!v.paused && !v.ended && v.readyState >= 3) {
                            v.currentTime += 1.2;
                        }
                    }, 500);
                }
            }
        };

        setInterval(() => {
            if (v.paused && !v.ended) v.play().catch(() => {});
            checkSpeed();
        }, 1000);
    };

    // 3. 自动点击逻辑
    const autoClick = () => {
        const elements = Array.from(document.querySelectorAll('button, a, div, span, .btn, .ui-button'));
        const pageText = document.body ? document.body.innerText : '';
        const pageMode = detectPageMode({
            url: window.location.href,
            title: document.title,
            text: pageText,
        });
        if (pageMode === 'quiz') return;

        const { anyVideoRunning, lastVideoFinishedAt } = collectVideoState(document);

        elements.forEach(el => {
            const text = (el.innerText || '').trim();
            if (!text || el.offsetParent === null) return;

            const decision = decideAutoClick({
                text,
                pageMode,
                anyVideoRunning,
                now: Date.now(),
                lastVideoFinishedAt,
                pageText,
                navigationGraceMs: NAVIGATION_GRACE_MS,
            });

            if (decision.action === 'confirm') {
                const now = Date.now();
                if (!el._lastClicked || now - el._lastClicked > 5000) {
                    el._lastClicked = now;
                    el.click();
                }
                return;
            }

            if (decision.action === 'navigate') {
                if (el._waiting) return;
                el._waiting = true;
                const delay = text.includes('下一节') ? 8000 : 3000;
                setTimeout(() => {
                    el.click();
                    el._waiting = false;
                }, delay);
            }
        });
    };

    // 循环扫描
    setInterval(() => {
        document.querySelectorAll('video').forEach(hackVideo);
        document.querySelectorAll('iframe').forEach(f => {
            try { f.contentDocument.querySelectorAll('video').forEach(hackVideo); } catch(e) {}
        });
        autoClick();
    }, 2000);
});
