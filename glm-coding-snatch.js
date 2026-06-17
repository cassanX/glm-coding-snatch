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
  // === 目标套餐 ===
  // 'lite' | 'pro' | 'max'
  plan: 'pro',

  // === 付费周期 ===
  // 'monthly' | 'quarterly' | 'yearly'
  cycle: 'monthly',

  // === Chrome 路径 (自动检测) ===
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',

  // === 桌面通知 ===
  enableNotifications: true,

  // === 抢到后是否自动打开付款页 ===
  autoOpenPayment: true,

  // === 轮询间隔 (毫秒) ===
  pollIntervalMs: 3000,

  // === 超时时间 (毫秒)，0 = 永不超时 ===
  timeoutMs: 0,

  // === 登录状态是否持久化(Cookie) ===
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

const CYCLE_LABELS = {
  monthly: '连续包月',
  quarterly: '连续包季',
  yearly: '连续包年',
};

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
// 桌面通知
// ============================
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
    if (fs.existsSync(COOKIE_FILE)) {
      return JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    }
  } catch (e) {
    log(`加载 Cookie 失败: ${e.message}`, true);
  }
  return null;
}

function saveCookies(cookies) {
  if (!CONFIG.persistCookies) return;
  try {
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    log(`Cookie 已保存 (${cookies.length} 条)`);
  } catch (e) {
    log(`保存 Cookie 失败: ${e.message}`, true);
  }
}

// ============================
// 浏览器 & 页面管理
// ============================
let browser, page;

async function initBrowser(headless = false) {
  log(`启动浏览器 (headless: ${headless})...`);
  browser = await chromium.launch({
    headless,
    executablePath: CONFIG.chromePath,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  page = await ctx.newPage();
  const savedCookies = loadCookies();
  if (savedCookies && savedCookies.length > 0) {
    await ctx.addCookies(savedCookies);
    log('已加载已保存的登录状态');
  }
  return { browser, page, ctx };
}

async function ensureLoggedIn() {
  log('导航到 GLM Coding Plan 页面...');
  await page.goto(CODING_PLAN_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const loginBtn = page.locator('button:has-text("登录 / 注册")');
  const consoleLink = page.locator('a[href*="/console"]');

  if ((await consoleLink.count()) > 0) {
    log('检测到已登录状态');
    return true;
  }

  if ((await loginBtn.count()) > 0) {
    log('=== 需要登录 ===');
    log('请在浏览器窗口中完成登录 (手机号 + 短信验证码)');
    log('登录完成后，回到终端按 Enter 继续...');
    await new Promise((resolve) => process.stdin.once('data', () => resolve()));
    await page.waitForTimeout(2000);
    const cookies = await page.context().cookies();
    saveCookies(cookies);
    log('登录检测完成');
    return true;
  }

  log('登录状态不确定，请在浏览器中确认登录后按 Enter...');
  await new Promise((resolve) => process.stdin.once('data', () => resolve()));
  const cookies = await page.context().cookies();
  saveCookies(cookies);
  return true;
}

// ============================
// 抢购核心逻辑
// ============================
async function startSnatching() {
  const planKey = CONFIG.plan;
  const planIndex = PLAN_IDS[planKey];
  const cycleLabel = CYCLE_LABELS[CONFIG.cycle];
  const startTime = Date.now();

  if (planIndex === undefined) {
    log(`错误: 未知套餐 "${planKey}"，可选: lite, pro, max`, true);
    return;
  }

  log('');
  log('========================================');
  log(`开始抢购 GLM Coding Plan`);
  log(`目标套餐: ${planKey.toUpperCase()} (${cycleLabel})`);
  log(`轮询间隔: ${CONFIG.pollIntervalMs}ms`);
  log(`超时: ${CONFIG.timeoutMs === 0 ? '永不' : CONFIG.timeoutMs + 'ms'}`);
  log('========================================');
  log('');

  let attempts = 0;

  while (true) {
    attempts++;
    const elapsed = Date.now() - startTime;

    if (CONFIG.timeoutMs > 0 && elapsed > CONFIG.timeoutMs) {
      log(`超时: 已持续 ${Math.round(elapsed / 1000)} 秒，停止抢购`);
      break;
    }

    try {
      log(`[第 ${attempts} 次检查] 刷新页面...`);
      await page.goto(CODING_PLAN_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const subscribeBtns = page.locator('button:has-text("特惠订阅")');
      const btnCount = await subscribeBtns.count();

      if (btnCount === 0) {
        log('  未找到"特惠订阅"按钮，可能页面未完全加载');
        await sleep(CONFIG.pollIntervalMs);
        continue;
      }

      log(`  找到 ${btnCount} 个特惠订阅按钮`);
      const targetBtn = subscribeBtns.nth(planIndex);
      const isDisabled = await targetBtn.isDisabled().catch(() => true);
      const isVisible = await targetBtn.isVisible().catch(() => false);

      log(`  目标套餐 (${planKey.toUpperCase()}): visible=${isVisible}, disabled=${isDisabled}`);

      if (isVisible && !isDisabled) {
        log('');
        log('★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★');
        log('★  发现可用订阅! 开始抢购!');
        log('★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★');

        await notify('GLM Coding Plan 抢购',
          `发现 ${planKey.toUpperCase()} (${cycleLabel}) 可用，正在抢购...`);

        await targetBtn.click();
        await page.waitForTimeout(3000);

        if (CONFIG.cycle !== 'monthly') {
          try {
            const cycleSel = page.locator(`text="${cycleLabel}"`);
            if ((await cycleSel.count()) > 0) {
              await cycleSel.first().click();
              await page.waitForTimeout(1000);
              log(`  已选择付费周期: ${cycleLabel}`);
            }
          } catch (e) {
            log(`  选择付费周期需手动操作: ${e.message}`);
          }
        }

        log('  已打开订阅页，请在浏览器中完成支付');

        await notify('🎉 抢购成功!',
          `GLM Coding Plan ${planKey.toUpperCase()} (${cycleLabel}) 已打开，请完成支付!`);

        if (CONFIG.autoOpenPayment) {
          try {
            const payBtn = page.locator('button:has-text("支付")');
            const confirmBtn = page.locator('button:has-text("确认")');
            const submitBtn = page.locator('button:has-text("提交")');
            const orderBtn = payBtn.or(confirmBtn).or(submitBtn);
            if ((await orderBtn.count()) > 0) {
              await orderBtn.first().click();
              log('  已自动点击支付/确认');
              await page.waitForTimeout(3000);
            }
          } catch {}
        }

        log('抢购流程完成，请检查浏览器支付状态');
        return;
      } else {
        const reason = isDisabled ? '按钮不可用(已抢完/未到时间)' : '按钮不可见';
        log(`  目标套餐暂不可用: ${reason}`);
      }
    } catch (e) {
      log(`  检查出错: ${e.message}`, true);
    }

    log(`  等待 ${CONFIG.pollIntervalMs / 1000} 秒后重试...`);
    await sleep(CONFIG.pollIntervalMs);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================
// 主入口
// ============================
async function main() {
  const headless = process.argv.includes('--headless');
  log('GLM Coding Plan 抢购脚本 v1.0');
  log('=============================');
  try {
    await initBrowser(headless);
    await ensureLoggedIn();
    await startSnatching();
  } catch (e) {
    log(`致命错误: ${e.message}`, true);
    console.error(e);
  } finally {
    if (browser) await browser.close();
    log('浏览器已关闭');
    log('脚本结束');
    process.exit(0);
  }
}

main();
