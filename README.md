# GLM Coding Plan 抢购脚本

用于自动抢购智谱开放平台 [open.bigmodel.cn](https://open.bigmodel.cn/glm-coding) 的 **GLM Coding Plan** 编程套餐。

## 套餐信息

| 套餐 | 月付 | 季付(9折) | 年付(8折) |
|------|------|-----------|-----------|
| **Lite** 轻量版 | ¥49/月 | ¥44.1/月 | - |
| **Pro** 专业版(🔥) | ¥149/月 | ¥134.1/月 | - |
| **Max** 旗舰版 | ¥469/月 | ¥422.1/月 | - |

> 注意：购买前需在 open.bigmodel.cn 完成 **实名认证**。

## 前置准备

1. **安装 Node.js** (>= 18)
   - 从 https://nodejs.org 下载安装

2. **安装 Playwright 和 Chromium 浏览器**

```bash
npm init -y
npm install playwright
npx playwright install chromium
```

或者直接使用项目中的 `install-deps.bat` 一键安装。

3. **登录 open.bigmodel.cn 并完成实名认证**
   - 注册账号
   - 完成实名认证（个人套餐需要）

## 使用方法

### 1. 配置抢购参数

打开 `glm-coding-snatch.js`，修改 `CONFIG` 区块：

```js
const CONFIG = {
  plan: 'pro',              // 目标: lite | pro | max
  cycle: 'monthly',         // 周期: monthly | quarterly | yearly
  pollIntervalMs: 3000,     // 轮询间隔(毫秒)
  timeoutMs: 0,             // 超时(0=永不)
};
```

### 2. 运行脚本

```bash
node glm-coding-snatch.js
```

### 3. 登录

脚本会弹出浏览器窗口。如果未登录，请在浏览器中手动登录（手机号+短信验证码）。
登录后回到终端按 **Enter** 继续。

### 4. 自动抢购

脚本将开始以 3 秒为间隔轮询：
- 当"特惠订阅"按钮变为可用状态时，自动点击
- 自动选择目标付费周期
- 弹出 Windows 桌面通知
- 尝试自动完成支付确认

### 命令行参数

| 参数 | 说明 |
|------|------|
| `--headless` | 无头模式运行（不显示浏览器窗口） |

## Cookie 持久化

首次登录后，脚本会自动保存 Cookie 到 `.glm_cookies.json`。
后续运行无需重复登录。

## 文件说明

| 文件 | 说明 |
|------|------|
| `glm-coding-snatch.js` | 主脚本 |
| `.glm_cookies.json` | 登录 Cookie（自动生成） |
| `glm-snatch.log` | 运行日志（自动生成） |

## 安全提示

- Cookie 文件包含了您的登录凭证，请勿分享给他人
- 本脚本仅操作 open.bigmodel.cn 官方页面
- 所有支付操作均在官方页面完成，脚本不会获取您的支付信息
