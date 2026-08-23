import {
  setMsg,
  unlockPanel,
  getToken,
  saveGitHubDraft,
  verifyPassword,
  loadSecurityConfig,
  adminService,
  setSessionProof,
  clearSessionProof,
  hasValidSession,
  hasPasswordConfigured,
} from "./core";
import { deriveSessionProof } from "@/utils/admin-service";
import { LOGIN_ATTEMPTS_KEY } from "./constants";

// ---- 登录失败限速（SEC-3）----
// 纯客户端限速：可被清除存储绕过，目的是抬高自动化撞库的成本；
// 真正的权限边界仍是 GitHub Token。5 次失败后锁定，锁定时长随失败次数指数增长（1~16 分钟封顶）。

const MAX_FAILS_BEFORE_LOCK = 5;
const LOCK_BASE_MS = 60_000;
const LOCK_MAX_MS = 16 * 60_000;

type AttemptState = { fails: number; lockedUntil: number };

function readAttemptState(): AttemptState {
  try {
    const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
    if (!raw) return { fails: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    if (typeof parsed?.fails === "number" && typeof parsed?.lockedUntil === "number") {
      return { fails: parsed.fails, lockedUntil: parsed.lockedUntil };
    }
  } catch { /* 数据损坏视作无记录 */ }
  return { fails: 0, lockedUntil: 0 };
}

function writeAttemptState(state: AttemptState) {
  try {
    localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(state));
  } catch { /* 隐私模式下静默降级：限速不可用但不影响登录本身 */ }
}

function lockDurationMs(fails: number): number {
  const exp = Math.min(Math.max(fails - MAX_FAILS_BEFORE_LOCK, 0), 4);
  return Math.min(LOCK_BASE_MS * 2 ** exp, LOCK_MAX_MS);
}

function formatWait(ms: number): string {
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec} 秒`;
  return `${Math.ceil(sec / 60)} 分钟`;
}

export function initLoginHandlers(loadPostList: () => Promise<void>) {
  const loginMsg = document.getElementById("login-msg");
  const loginBtn = document.getElementById("login-btn") as HTMLButtonElement | null;
  const passwordInput = document.getElementById("admin-password") as HTMLInputElement | null;

  // 会话凭据格式合法才自动解锁面板（SEC-2：固定值 "1" 不再被认可）
  if (hasValidSession()) {
    unlockPanel();
  }

  // 安全配置加载完成前禁用登录按钮，避免手快时拿空数据误判「密码错误」
  if (loginBtn) loginBtn.disabled = true;
  loadSecurityConfig().finally(() => {
    if (loginBtn) loginBtn.disabled = false;
    document.dispatchEvent(
      new CustomEvent("admin:security-ready", {
        detail: { hasPassword: hasPasswordConfigured() },
      }),
    );
    // 未设置密码时无需登录，直接进入后台，进入后可在「安全」页设置密码
    if (!hasPasswordConfigured()) {
      setMsg(loginMsg, "当前未设置后台密码，已直接进入后台，可在「安全」页设置密码。");
      unlockPanel();
      document.dispatchEvent(new CustomEvent("admin:login-success"));
      loadPostList().catch((error) => {
        setMsg(document.getElementById("post-msg"), String(error), true);
      });
      return;
    }
    // 旧配置迭代次数偏低（SEC-1）：提示改一次密码即可升级到 600k 迭代
    if (adminService.isSecurityOutdated()) {
      setMsg(loginMsg, "安全提示：当前密码哈希强度偏低，建议尽快在「安全设置」中修改一次密码完成升级（不影响本次登录）");
    }
  });

  document.getElementById("login-btn")?.addEventListener("click", async () => {
    const pwd = passwordInput?.value || "";

    const state = readAttemptState();
    if (state.lockedUntil > Date.now()) {
      setMsg(loginMsg, `尝试次数过多，请 ${formatWait(state.lockedUntil - Date.now())} 后再试`, true);
      return;
    }
    if (!pwd) {
      setMsg(loginMsg, "请输入密码", true);
      return;
    }

    const passed = await verifyPassword(pwd);
    if (passed) {
      writeAttemptState({ fails: 0, lockedUntil: 0 });
      // 会话凭据由密码派生，盐与公开哈希独立，无法凭空伪造（SEC-2）
      const params = adminService.getSecurityParams();
      if (params) {
        try {
          setSessionProof(await deriveSessionProof(pwd, params.salt, params.iterations));
        } catch {
          // 派生失败时退化为无凭据会话：面板仍可用，但刷新后需重新登录
          clearSessionProof();
        }
      }
      setMsg(loginMsg, "登录成功");
      unlockPanel();
      // 通知布局层登录成功（AdminLayout 会切换到文章 Tab）
      document.dispatchEvent(new CustomEvent("admin:login-success"));
      loadPostList().catch((error) => {
        setMsg(document.getElementById("post-msg"), String(error), true);
      });
    } else {
      const next: AttemptState = { fails: state.fails + 1, lockedUntil: 0 };
      if (next.fails >= MAX_FAILS_BEFORE_LOCK) {
        next.lockedUntil = Date.now() + lockDurationMs(next.fails);
        writeAttemptState(next);
        setMsg(loginMsg, `密码错误次数过多，已锁定 ${formatWait(next.lockedUntil - Date.now())}`, true);
      } else {
        writeAttemptState(next);
        setMsg(loginMsg, `密码错误（剩余 ${MAX_FAILS_BEFORE_LOCK - next.fails} 次机会）`, true);
      }
    }
  });

  document.getElementById("change-password-btn")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("pwd-msg");
    try {
      const oldPwd = (document.getElementById("old-password") as HTMLInputElement | null)?.value || "";
      const newPwd = (document.getElementById("new-password") as HTMLInputElement | null)?.value || "";
      const token = getToken();
      const branch = ((document.getElementById("gh-branch") as HTMLInputElement | null)?.value || "main").trim();

      if (!token) {
        setMsg(msgEl, "请先填写 GitHub Token", true);
        return;
      }

      await adminService.changePassword({
        oldPassword: oldPwd,
        newPassword: newPwd,
        token,
        branch
      });

      setMsg(msgEl, "密码修改成功，已全站生效（跨设备统一）");
      const oldInput = document.getElementById("old-password") as HTMLInputElement | null;
      const newInput = document.getElementById("new-password") as HTMLInputElement | null;
      if (oldInput) oldInput.value = "";
      if (newInput) newInput.value = "";
    } catch (error) {
      setMsg(msgEl, `修改失败：${error instanceof Error ? error.message : String(error)}`, true);
    }
  });
}
