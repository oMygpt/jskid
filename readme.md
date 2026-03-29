# AMAC 培训助手 (v7.2)

自动完成 AMAC 基金从业人员远程培训系统的视频课程学习。

提供两种使用方式：
- **方式 A**：AMAC 光速浏览器（推荐小白用户）— 双击打开即用，无需任何配置
- **方式 B**：Tampermonkey 脚本 — 适合已有浏览器环境的用户

## 功能

1. **自动识别"继续学习"** — 进入课程页面后自动点击开始
2. **视频分段快播** — 进度 <60% 以 8x 倍速，60~85% 以 4x，85~95% 以 1.5x，最后 5% 恢复原速确保结算
3. **播放速率锁定** — 通过 `Object.defineProperty` 拦截阿里云 MTS 播放器的速率重置，确保加速生效
4. **自动进度上报** — 定期通过 `postProgress` 和 `playerLogUpdate` 同步学习进度到服务器
5. **完成确认监听** — 同时拦截 XHR 和 Fetch 的 `log_update` 响应，检测 `isFinish:2` 确认完成状态
6. **屏蔽焦点检测** — 拦截 blur/visibilitychange 等事件，伪造 `visibilityState`，切换标签页不会暂停
7. **自动导航** — 视频播完后处理确认弹窗，自动进入下一个视频章节（跳过测验和评价）
8. **回退补播** — 完成上报未被服务器确认时，自动回退重播并以 4x 倍速追赶

---

## 方式 A：AMAC 光速浏览器（推荐）

一个内置了自动化脚本的定制浏览器，双击即用。

### 直接使用

从 Release 页面下载对应系统的安装包：

| 系统 | 文件 |
|------|------|
| Windows | `AMAC光速浏览器-Windows.exe` |
| macOS | `AMAC光速浏览器-Mac.dmg` |

下载后双击打开，登录 AMAC 账号即可，脚本已自动内置。

### 从源码构建

需要 Node.js 18+ 环境。

```bash
# 1. 安装依赖
npm install

# 2. 本地运行测试
npm start

# 3. 打包
npm run dist-win    # Windows 版
npm run dist-mac    # macOS 版
```

打包后的文件在 `dist/` 目录中。

---

## 方式 B：Tampermonkey 浏览器脚本

适合已经熟悉浏览器扩展的用户。

### 第一步：安装 Tampermonkey（篡改猴）

Tampermonkey 是一个浏览器扩展，用于运行用户脚本。

| 浏览器 | 安装地址 |
|--------|---------|
| Chrome | [Chrome 应用商店](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Edge | [Edge 附加组件](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
| Firefox | [Firefox 附加组件](https://addons.mozilla.org/firefox/addon/tampermonkey/) |

安装完成后，浏览器右上角会出现 Tampermonkey 图标。

### 第二步：导入脚本

1. 点击浏览器右上角的 **Tampermonkey 图标**
2. 选择 **"管理面板"**（Dashboard）
3. 点击 **"+"** 按钮新建脚本
4. **全选**编辑器中的默认模板代码，**删除**
5. 打开本项目中的 `amac_god_mode.user.js`，**复制全部内容**
6. **粘贴**到 Tampermonkey 编辑器中
7. 按 **Ctrl+S**（Mac: Cmd+S）保存

### 第三步：验证安装

1. 回到 **"已安装脚本"** 页面
2. 确认脚本名称为 **"AMAC培训助手"**，版本 **7.2**
3. 确认左侧开关为 **绿色**（已启用）
4. 站点列显示 `*://peixun.amac.org.cn/*`

---

## 使用方法

1. 打开 `https://peixun.amac.org.cn`，登录账号
2. 进入课程学习页面
3. 脚本自动运行，无需任何操作
4. 一个视频播完后会自动处理弹窗并跳转下一节

### 查看运行日志

按 **F12** 打开开发者工具 > **Console** 标签，可以看到：

```
--- AMAC GOD MODE v7.2 ACTIVATED ---
[GOD] 新视频会话: https://v.ataschool.cn/...m3u8|1286
[GOD] postProgress(Interval-progress)          ← 定期上报
[GOD] playerLogUpdate(1, 320)                  ← 进度同步（秒数快速增长=加速生效）
[GOD] log_update 响应: {"status":"1",...}       ← 服务器确认
[GOD] 视频进入完成等待: playback_end            ← 视频播完
[GOD] 触发完成上报序列: near_end attempt=1      ← 完成上报
[GOD] 服务器确认完成: xhr_response              ← 服务器确认 isFinish=2
[GOD] 切换到下一个视频小节: 第二节...            ← 自动导航
```

---

## 常见问题

### 脚本没有生效

- 光速浏览器：重启应用
- Tampermonkey：确认图标上有数字角标、脚本已启用（绿色开关），然后刷新页面
- 尝试 **重启浏览器**

### 视频没有加速

- 检查控制台是否有 `[GOD] 新视频会话:` 日志
- 检查 `playerLogUpdate` 中的秒数是否快速增长（每 20 秒应增长 100+）
- 如果秒数增长缓慢（~20），查看是否有 `playbackRate 锁定失败` 日志
- 如果没有视频会话日志，等几秒让视频 iframe 加载完成（每 2.5 秒自动重试）

### 播放完成但进度未记录

- 检查控制台是否有 `[GOD] 服务器确认完成:` 日志
- 查看 `[GOD] log_update 响应:` 中是否包含 `isFinish:2`
- 如未确认，脚本会自动触发回退补播（最多 2 次）
- 确保网络连接正常

### 切换标签页后视频暂停

- 正常情况下脚本已拦截暂停事件，不会暂停
- 如果仍暂停，建议保持标签页在前台运行

---

## 注意事项

- 一次只在 **一个标签页** 播放视频，多开可能导致数据冲突
- 视频最后 5% 为原速结算区，不要手动拖动进度条
- 测验/考试页面不会自动提交，需手动答题
- 如遇评价弹窗，脚本会自动跳过

---

## 项目结构

| 文件 | 说明 |
|------|------|
| `amac_god_mode.user.js` | 核心脚本（Tampermonkey + Electron 共用） |
| `main.js` | Electron 主进程，负责创建窗口和注入脚本 |
| `preload.js` | Electron 预加载脚本 |
| `package.json` | 项目配置和构建脚本 |
| `automation_rules.js` | 自动点击规则引擎 |
| `automation_rules.test.js` | 规则引擎单元测试 |

---

## 更新日志

### v7.2 (2026-03-29)

- **修复** `playbackRate` 被阿里云 MTS 播放器重置的问题，通过 `Object.defineProperty` 锁定速率
- **修复** `clickGenericNextButton` 中 `anyVideoRunning` 被硬编码为 `false` 导致可能在视频播放中触发导航
- **修复** `markVideoFinished` 在服务器已确认完成后仍覆盖 `waitingForCompletion` 的状态矛盾
- **修复** `collectCourseSections` 通配选择器 `li, a, button` 导致的性能问题，改用定向 class 选择器
- **修复** `isVisible` 无法正确检测 `position: fixed/sticky` 元素
- **修复** `syncStudySecond` 在 `parentVI` 与 `vInfo` 为同一对象时的重复写入
- **新增** `fetch` API 拦截，与 XHR 拦截并行监听 `log_update` 响应
- **新增** `isAnyVideoRunning` 递归深度限制（最大 5 层），防止栈溢出
- **优化** 消除 `resetSessionState` 与 `clearCompletionState` 的代码重复
- **调整** 回退补播速率从 1.25x 提升至 4x

### v7.1

- 随机化反作弊数据值
- 分段倍速策略（8x/4x/1.5x/1x）
- 完善章节导航和弹窗处理
