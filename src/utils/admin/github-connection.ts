import {
  setMsg,
  getToken,
  syncApiBase,
  saveGitHubDraft,
} from "./core";
import {
  GITHUB_API_DEFAULT,
  ADMIN_GH_API_URL_KEY,
} from "./constants";

export function initGitHubConnectionHandlers() {
  document.getElementById("gh-token")?.addEventListener("change", saveGitHubDraft);
  document.getElementById("gh-branch")?.addEventListener("change", saveGitHubDraft);
  // 切换"记住 Token"时立即迁移存储位置
  document.getElementById("gh-remember-token")?.addEventListener("change", saveGitHubDraft);

  document.getElementById("gh-api-endpoint")?.addEventListener("change", (e) => {
    const customWrap = document.getElementById("custom-api-url-wrap");
    if ((e.target as HTMLSelectElement).value === "custom") {
      customWrap?.classList.remove("hidden");
    } else {
      customWrap?.classList.add("hidden");
    }
    syncApiBase();
  });
  document.getElementById("gh-api-custom-url")?.addEventListener("change", syncApiBase);

  // 自动检测可用端点
  document.getElementById("auto-detect-btn")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("connection-msg");
    const token = getToken();
    if (!token) {
      setMsg(msgEl, "请先填写 GitHub Token", true);
      return;
    }
    setMsg(msgEl, "正在检测可用端点...");

    const candidates = ["https://api.github.com"];
    const customUrl = (document.getElementById("gh-api-custom-url")?.value || "").trim().replace(/\/+$/, "");
    if (customUrl && !candidates.includes(customUrl)) {
      candidates.push(customUrl);
    }

    const { adminService } = await import("./core");

    for (const endpoint of candidates) {
      try {
        const testRes = await fetch(`${endpoint}/zen`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000),
        });
        if (testRes.ok) {
          adminService.setApiBase(endpoint);
          localStorage.setItem(ADMIN_GH_API_URL_KEY, endpoint);
          const selectEl = document.getElementById("gh-api-endpoint");
          const customWrap = document.getElementById("custom-api-url-wrap");
          let found = false;
          if (selectEl) {
            for (const opt of selectEl.options) {
              if (opt.value === endpoint) {
                selectEl.value = endpoint;
                found = true;
                break;
              }
            }
            if (!found) {
              selectEl.value = "custom";
              const customInput = document.getElementById("gh-api-custom-url");
              if (customInput) customInput.value = endpoint;
              customWrap?.classList.remove("hidden");
            } else {
              customWrap?.classList.add("hidden");
            }
          }
          setMsg(msgEl, `检测成功！使用端点：${endpoint}`);
          return;
        }
      } catch {
        continue;
      }
    }

    setMsg(msgEl, "所有端点均不可达。请配置自定义代理 URL（如 Cloudflare Worker）后重试。", true);
  });

  document.getElementById("test-connection-btn")?.addEventListener("click", async () => {
    const msgEl = document.getElementById("connection-msg");
    const token = getToken();
    if (!token) {
      setMsg(msgEl, "请先填写 GitHub Token", true);
      return;
    }
    syncApiBase();
    const { adminService } = await import("./core");
    setMsg(msgEl, `测试连接中...（${adminService.getApiBase()}）`);
    saveGitHubDraft();
    const result = await adminService.testConnection(token);
    setMsg(msgEl, result.message, !result.ok);
  });
}
