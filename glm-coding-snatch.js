// GLM Coding Plan 抢购脚本
// ========================
// 目标: open.bigmodel.cn 的 GLM Coding Plan 特惠订阅
// 用法: node glm-coding-snatch.js [--headless]
//
// 前置条件:
//   1. 在 open.bigmodel.cn 完成手机号注册 + 实名认证
//   2. 首次运行会自动打开浏览器，请手动登录 (手机号 + 短信验证码)
//   3. 登录成功后脚本会自动保存 Cookie，后续无需重复登录
//
// 常见问题: https://docs.bigmodel.cn/cn/coding-plan/faq
// 套餐说明: https://docs.bigmodel.cn/cn/coding-plan/overview

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ============================
// 配置区 - 按需修改
// ============================
const CONFIG = {
  plan: 'pro',                  // lite | pro | max
  cycle: 'monthly',             // monthly | quarterly | yearly
  windowCount: 3,               // 同时抢购的窗口数量
  chromePath: '',               // 留空=自动使用 Playwright 内置 Chromium
  enableNotifications: true,
  autoOpenPayment: true,
  pollIntervalMs: 1000,         // 轮询间隔
  timeoutMs: 0,                 // 超时(毫秒)，0=永不
  persistCookies: true,
};

// ============================
// 常量
// ============================
const SITE_URL = 'https://open.bigmodel.cn';
const CODING_PLAN_URL = `${SITE_URL}/glm-coding`;
const COOKIE_FILE = path.join(__dirname, '.glm_cookies.json');
const LOG_FILE = path.join(__dirname, 'glm-snatch.log');
const PLAN_IDS = { lite: 0, pro: 1, max: 2 };
const PLAN_LABELS = { lite: 'Lite', pro: 'Pro', max: 'Max' };
const CYCLE_LABELS = { monthly: '连续包月', quarterly: '连续包季', yearly: '连续包年' };

// ============================
// 日志
// ============================
function log(msg, isError = false) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
  if (isError) console.error(line);
}

// ============================
// 桌面通知 (只通知一次)
// ============================
let notified = false;
async function notify(title, body) {
  log(`[通知] ${title}: ${body}`);
  if (!CONFIG.enableNotifications) return;
  try { process.stdout.write('\x07'); } catch {}
  try {
    const { execSync } = require('child_process');
    execSync(
      `powershell -Command "& {Add-Type -AssemblyName System.Windows.Forms; ` +
      `[System.Windows.Forms.MessageBox]::Show('${body.replace(/'/g, "''")}', ` +
      `'${title.replace(/'/g, "''")}')}"`,
      { timeout: 5000 }
    );
  } catch {}
}

// ============================
// Cookie 管理
// ============================
function loadCookies() {
  if (!CONFIG.persistCookies) return null;
  try {
    if (fs.existsSync(COOKIE_FILE))
      return JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
  } catch (e) { log(`加载 Cookie 失败: ${e.message}`, true); }
  return null;
}

function saveCookies(cookies) {
  if (!CONFIG.persistCookies) return;
  try {
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    log(`Cookie 已保存 (${cookies.length} 条)`);
  } catch (e) { log(`保存 Cookie 失败: ${e.message}`, true); }
}

// ============================
// 浏览器 & Context 管理
// ============================
let browser;

async function initBrowser(headless = false) {
  log(`启动浏览器 (headless: ${headless})...`);
  const launchOpts = { headless, args: ['--no-sandbox'] };
  if (CONFIG.chromePath && fs.existsSync(CONFIG.chromePath))
    launchOpts.executablePath = CONFIG.chromePath;
  browser = await chromium.launch(launchOpts);
}

async function createContext() {
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await ctx.newPage();
  const cookies = loadCookies();
  if (cookies?.length > 0) {
    await ctx.addCookies(cookies);
  }
  return { ctx, page };
}

async function ensureLoggedIn(page) {
  log('导航到 GLM Coding Plan 页面...');
  try {
    await page.goto(CODING_PLAN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    log(`页面加载耗时较长，继续执行...`);
  }

  // 关闭弹窗
  for (const text of ['我知道了', '暂不订阅', '取消']) {
    try { await page.locator(`button:has-text("${text}")`).first().click({ timeout: 2000 }); } catch {}
  }

  // 检测登录状态
  let needsLogin = false;
  try { needsLogin = await page.locator('button:has-text("登录 / 注册")').first().isVisible({ timeout: 3000 }); } catch {}

  if (needsLogin) {
    log('=== 需要登录 ===');
    log('请在浏览器窗口中完成登录 (手机号 + 短信验证码)');
    log('登录完成后，回到终端按 Enter 继续...');
    await new Promise((resolve) => process.stdin.once('data', () => resolve()));
    await page.waitForTimeout(2000);
    saveCookies(await page.context().cookies());
    log('登录检测完成');

    // 登录成功后，把 cookie 同步给其他窗口
    const cookies = await page.context().cookies();
    const contexts = browser.contexts();
    for (const ctx of contexts) {
      try { await ctx.addCookies(cookies); } catch {}
    }
  } else {
    log('检测到已登录状态');
  }
}

// ============================
// 获取所有套餐按钮及其状态
// ============================
async function getPlanButtons(page) {
  try { await page.locator('text=个人套餐').first().click({ timeout: 2000 }); } catch {}
  await page.waitForTimeout(500);

  const allBtns = page.locator('button');
  const count = await allBtns.count();
  const result = [];

  for (let i = 0; i < count; i++) {
    const btn = allBtns.nth(i);
    let text = '', disabled = true;
    try { text = (await btn.innerText()).trim(); } catch { continue; }
    if (!text) continue;
    if (!text.includes('特惠订阅') && !text.includes('暂时售罄') && !text.includes('前往认证')) continue;
    try { disabled = await btn.isDisabled(); } catch { disabled = true; }
    result.push({ text, disabled, locator: btn });
  }
  return result;
}

// ============================
// 单窗口抢购循环
// ============================
async function snatchInWindow(page, label, signal) {
  const planKey = CONFIG.plan;
  const planIndex = PLAN_IDS[planKey];
  const planLabel = PLAN_LABELS[planKey];
  const cycleLabel = CYCLE_LABELS[CONFIG.cycle];
  const startTime = Date.now();
  let attempts = 0;

  log(`[${label}] 开始抢购 ${planKey.toUpperCase()} (${cycleLabel})`);

  while (!signal.aborted) {
    attempts++;
    const elapsed = Date.now() - startTime;

    if (CONFIG.timeoutMs > 0 && elapsed > CONFIG.timeoutMs) {
      log(`[${label}] 超时退出`);
      break;
    }

    try {
      log(`[${label}][${attempts}] 加载页面...`);
      try {
        await page.goto(CODING_PLAN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);
      } catch (e) {
        try {
          const ctx = page.context();
          await page.close().catch(() => {});
          page = await ctx.newPage();
          await page.goto(CODING_PLAN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);
        } catch (e2) {
          log(`[${label}] 页面重建失败: ${e2.message}`);
          await sleep(CONFIG.pollIntervalMs);
          continue;
        }
      }

      // 关闭弹窗
      for (const text of ['我知道了', '暂不订阅', '取消']) {
        try { await page.locator(`button:has-text("${text}")`).first().click({ timeout: 1000 }); } catch {}
      }

      await page.waitForTimeout(500);
      const planBtns = await getPlanButtons(page);

      if (planBtns.length <= planIndex) {
        log(`[${label}] 未能定位到套餐按钮 (找到 ${planBtns.length} 个)`);
        await sleep(CONFIG.pollIntervalMs);
        continue;
      }

      const target = planBtns[planIndex];
      log(`[${label}] ${planLabel}: "${target.text}" (disabled: ${target.disabled})`);

      if (target.text.includes('特惠订阅') && !target.disabled) {
        log('');
        log(`[${label}] ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★`);
        log(`[${label}] ★  发现可用订阅! 开始抢购!`);
        log(`[${label}] ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★`);

        await notify('GLM Coding Plan 抢购',
          `发现 ${planKey.toUpperCase()} (${cycleLabel}) 可用，正在抢购...`);

        await target.locator.click();
        await page.waitForTimeout(3000);

        // 选择付费周期
        if (cycleLabel !== '连续包月') {
          try {
            const cycleSel = page.locator(`text="${cycleLabel}"`);
            if ((await cycleSel.count()) > 0) {
              await cycleSel.first().click();
              await page.waitForTimeout(1000);
              log(`[${label}] 已选择付费周期: ${cycleLabel}`);
            }
          } catch (e) {
            log(`[${label}] 选择付费周期需手动操作: ${e.message}`);
          }
        }

        log(`[${label}] 已打开订阅页，请在浏览器中完成支付`);

        if (!notified) {
          notified = true;
          await notify('🎉 抢购成功!',
            `GLM Coding Plan ${planKey.toUpperCase()} (${cycleLabel}) 已打开，请完成支付!`);
        }

        if (CONFIG.autoOpenPayment) {
          try {
            const payBtn = page.locator('button:has-text("支付")');
            const confirmBtn = page.locator('button:has-text("确认")');
            const submitBtn = page.locator('button:has-text("提交")');
            const orderBtn = payBtn.or(confirmBtn).or(submitBtn);
            if ((await orderBtn.count()) > 0) {
              await orderBtn.first().click();
              log(`[${label}] 已自动点击支付/确认`);
              await page.waitForTimeout(3000);
            }
          } catch {}
        }

        log(`[${label}] 抢购流程完成`);
        // 通知其他窗口停止
        process.nextTick(() => { try { signal.abort(); } catch {} });
        return true;
      }
    } catch (e) {
      log(`[${label}] 出错: ${e.message}`, true);
    }

    await sleep(CONFIG.pollIntervalMs);
  }

  log(`[${label}] 已停止`);
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================
// 主入口
// ============================
async function main() {
  const headless = process.argv.includes('--headless');
  log('GLM Coding Plan 抢购脚本 v1.1 (多窗口)');
  log('========================================');
  try {
    await initBrowser(headless);

    // 创建 N 个独立窗口
    const windows = [];
    for (let i = 0; i < CONFIG.windowCount; i++) {
      windows.push(await createContext());
    }
    log(`已创建 ${CONFIG.windowCount} 个抢购窗口`);

    // 第一个窗口负责登录
    await ensureLoggedIn(windows[0].page);

    // 并行启动所有窗口的抢购
    const ac = new AbortController();

    const results = await Promise.all(
      windows.map((w, i) =>
        snatchInWindow(w.page, `窗口${i + 1}`, ac.signal)
      )
    );

    if (results.some(r => r === true)) {
      log('✅ 抢购成功!');
    } else {
      log('所有窗口已停止');
    }
  } catch (e) {
    log(`致命错误: ${e.message}`, true);
    console.error(e);
  } finally {
    if (browser) await browser.close().catch(() => {});
    log('浏览器已关闭');
    log('脚本结束');
    process.exit(0);
  }
}

main();
