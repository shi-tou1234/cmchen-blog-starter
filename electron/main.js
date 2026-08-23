import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import serveHandler from 'serve-handler';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');

// 只绑回环地址：站点完全离线本地托管，不对外暴露端口
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

async function createWindow() {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    console.error('[desktop] dist/index.html 不存在：先运行 pnpm run build:desktop');
    app.exit(1);
    return;
  }
  const { server, port } = await startStaticServer();
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
    console.log(`[desktop] 已加载: ${win.webContents.getTitle()} (http://127.0.0.1:${port}/)`);
  });
  win.on('closed', () => server.close());
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow).catch((err) => {
  console.error('[desktop] 启动失败:', err);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
