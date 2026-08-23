import { app, BrowserWindow, net } from 'electron';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import serveHandler from 'serve-handler';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');

// 优先在线（新文章即时可见），断网回落到打包时内置的离线快照。
// 可用环境变量 DESKTOP_ONLINE_URL 覆盖（如换自定义域名）。
const ONLINE_URL =
  process.env.DESKTOP_ONLINE_URL || 'https://shi-tou1234.github.io/cmchen-blog-starter/';
const PROBE_TIMEOUT_MS = 5000;

// 出网请求只允许 http/https，且拒绝环回/内网/保留地址
function assertSafeHttpUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`仅支持 http/https：${url.protocol}`);
  }
  const h = url.hostname;
  if (
    h === 'localhost' ||
    /^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    throw new Error(`不允许环回/内网地址：${h}`);
  }
  return url;
}

// 只绑回环地址：离线快照完全本地托管，不对外暴露端口
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      serveHandler(req, res, { public: DIST_DIR }).catch(() => {
        res.statusCode = 500;
        res.end('static server error');
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function probeOnline() {
  try {
    const url = assertSafeHttpUrl(ONLINE_URL);
    const res = await net.fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (res.ok) {
      console.log(`[desktop] 在线模式: ${url} (HTTP ${res.status})`);
      return url.toString();
    }
    console.log(`[desktop] 线上响应异常 HTTP ${res.status}，转离线`);
    return null;
  } catch (err) {
    console.log(`[desktop] 线上不可达（${err?.cause?.code || err?.name || err.message}），转离线`);
    return null;
  }
}

async function createWindow() {
  const onlineUrl = await probeOnline();

  let server = null;
  let localUrl = null;
  if (!onlineUrl) {
    if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
      console.error('[desktop] 离线快照缺失（dist/index.html 不存在）：打包前先运行 build:desktop');
      app.exit(1);
      return;
    }
    const started = await startStaticServer();
    server = started.server;
    localUrl = `http://127.0.0.1:${started.port}/`;
    console.log(`[desktop] 离线快照模式: ${localUrl}`);
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'cmchen blog',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('console-message', (event) => {
    const { level, message, sourceId, line } = event;
    if (level >= 2 || /error|failed/i.test(message)) {
      console.log(`[renderer:${level}] ${message} @ ${sourceId}:${line}`);
    }
  });
  win.webContents.on('did-finish-load', () => {
    console.log(`[desktop] 已加载: ${win.webContents.getTitle()} (${win.webContents.getURL()})`);
  });
  // 在线模式下首屏加载失败（如启动后瞬间断网）→ 一次性回落离线快照
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (onlineUrl && !localUrl && isMainFrame && errorCode !== -3) {
      console.log(`[desktop] 在线加载失败（${errorCode} ${errorDescription}），回落离线快照`);
      startStaticServer().then(async ({ server: s, port }) => {
        localUrl = `http://127.0.0.1:${port}/`;
        server = s;
        await win.loadURL(localUrl);
      });
    }
  });

  win.on('closed', () => server?.close());
  await win.loadURL(onlineUrl || localUrl);
}

app.whenReady().then(createWindow).catch((err) => {
  console.error('[desktop] 启动失败:', err);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
