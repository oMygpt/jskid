const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 读取注入脚本（v7.2 GOD MODE）
const SCRIPT_PATH = path.join(__dirname, 'amac_god_mode.user.js');
let injectScript = '';
try {
  // 去掉 UserScript 头部注释，只保留 IIFE
  const raw = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const start = raw.indexOf('(function');
  injectScript = start >= 0 ? raw.slice(start) : raw;
} catch (e) {
  console.error('读取注入脚本失败:', e.message);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'AMAC 培训光速浏览器 v1.1',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  // 每个页面（含 iframe）加载完成后注入 GOD MODE 脚本
  win.webContents.on('did-finish-load', () => {
    if (injectScript) {
      win.webContents.executeJavaScript(injectScript).catch(() => { });
      console.log('[MAIN] GOD MODE v7.2 已注入到主页面');
    }
  });

  // iframe 内容加载完成也注入（确保 iframe 内的视频被接管）
  win.webContents.on('did-frame-finish-load', (event, isMainFrame) => {
    if (!isMainFrame && injectScript) {
      win.webContents.executeJavaScript(injectScript).catch(() => { });
    }
  });

  // 屏蔽视频右键
  win.webContents.on('context-menu', (e) => e.preventDefault());

  // 直接打开 AMAC 培训系统
  win.loadURL('https://peixun.amac.org.cn/');
}

// 自动拒绝麦克风、摄像头等权限请求
app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const denied = ['media', 'microphone', 'camera', 'geolocation', 'notifications'];
    callback(!denied.includes(permission));
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
