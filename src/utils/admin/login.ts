import {
  setMsg,
  unlockPanel,
  getToken,
  saveGitHubDraft,
  verifyPassword,
  loadSecurityConfig,
} from "./core";

export function initLoginHandlers(loadPostList: () => Promise<void>) {
  const loginMsg = document.getElementById("login-msg");
  const loginBtn = document.getElementById("login-btn") as HTMLButtonElement | null;

  if (sessionStorage.getItem("cmchen_admin_ok") === "1") {
    unlockPanel();
  }

  // 安全配置加载完成前禁用登录按钮，避免手快时拿空数据误判「密码错误」
  if (loginBtn) loginBtn.disabled = true;
  loadSecurityConfig().finally(() => {
    if (loginBtn) loginBtn.disabled = false;
  });

  document.getElementById("login-btn")?.addEventListener("click", async () => {
    const pwd = document.getElementById("admin-password")?.value || "";
    const passed = await verifyPassword(pwd);
    if (passed) {
      setMsg(loginMsg, "登录成功");
      unlockPanel();
      // 通知布局层登录成功（AdminLayout 会切换到文章 Tab）
      document.dispatchEvent(new CustomEvent("admin:login-success"));
      loadPostList().catch((error) => {
        setMsg(document.getElementById("post-msg"), String(error), true);
      });
    } else {
      setMsg(loginMsg, "密码错误", true);
    }
  });

  document.getElementById("change-password-btn")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("pwd-msg");
    try {
      const oldPwd = document.getElementById("old-password")?.value || "";
      const newPwd = document.getElementById("new-password")?.value || "";
      const token = getToken();
      const branch = (document.getElementById("gh-branch")?.value || "main").trim();

      if (!token) {
        setMsg(msgEl, "请先填写 GitHub Token", true);
        return;
      }

      const { adminService } = await import("./core");
      await adminService.changePassword({
        oldPassword: oldPwd,
        newPassword: newPwd,
        token,
        branch
      });

      setMsg(msgEl, "密码修改成功，已全站生效（跨设备统一）");
      const oldInput = document.getElementById("old-password");
      const newInput = document.getElementById("new-password");
      if (oldInput) oldInput.value = "";
      if (newInput) newInput.value = "";
    } catch (error) {
      setMsg(msgEl, `修改失败：${error instanceof Error ? error.message : String(error)}`, true);
    }
  });
}
