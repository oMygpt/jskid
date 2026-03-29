/**
 * preload.js — Electron preload for AMAC 光速浏览器 v1.1
 *
 * 职责：在 Electron 渲染进程层面预先屏蔽焦点检测。
 * 核心视频加速、进度上报、章节导航等全部由 amac_god_mode.user.js (GOD MODE v7.2) 处理，
 * 通过 main.js 的 executeJavaScript 注入，不在此文件中重复实现。
 */

// 在 DOM 加载前尽早屏蔽焦点检测事件
window.addEventListener('DOMContentLoaded', () => {
  console.log('%c AMAC-AUTO: preload 焦点屏蔽已激活 ', 'background: #222; color: #bada55');

  // 屏蔽导致暂停的系统检测事件
  const block = (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    return false;
  };
  window.addEventListener('blur', block, true);
  window.addEventListener('mouseleave', block, true);
  window.addEventListener('focusout', block, true);
  document.addEventListener('visibilitychange', block, true);

  // 伪造可见性状态
  try {
    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true,
    });
  } catch (e) { }
});
