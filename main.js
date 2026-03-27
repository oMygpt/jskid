const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "AMAC 培训光速挂机浏览器",
    webPreferences: {
      // 核心：在网页加载前，注入我们的 preload.js 脚本
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 直接跳转到 AMAC 首页或登录页
  win.loadURL('https://peixun.amac.org.cn/');

  // 屏蔽视频右键（防止用户乱点）
  win.webContents.on('context-menu', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
