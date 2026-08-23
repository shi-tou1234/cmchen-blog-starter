// 精简打包：把桌面壳抽成独立小应用再交给 electron-builder，
// 避免把 astro/sharp/typst 等构建工具当运行时依赖打进 exe。
// 用法：先 pnpm run build:desktop（产出根路径 dist/），再 node electron/package-desktop.mjs
import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const staging = path.join(root, 'release', 'desktop-app');
const electronVersion = '43.4.1';
// 打包目标：命令行第一个参数 win/mac/linux，缺省 win 保持原有行为
const target = process.argv[2] || 'win';
// 版本号：CI 从 tag 剥 v 透传，本地默认
const appVersion = process.env.DESKTOP_VERSION || '0.0.1';

// 前提核验：dist 必须是桌面形态（根路径引用），网页形态直接停
const indexHtml = path.join(root, 'dist', 'index.html');
if (!existsSync(indexHtml)) {
  console.error('[desktop] dist/index.html 不存在：先运行 pnpm run build:desktop');
  process.exit(1);
}
if (readFileSync(indexHtml, 'utf8').includes('="/cmchen-blog-starter/')) {
  console.error('[desktop] dist 是网页版形态（/cmchen-blog-starter/ 前缀）：先运行 pnpm run build:desktop 再打包');
  process.exit(1);
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(path.join(staging, 'electron'), { recursive: true });
mkdirSync(path.join(staging, 'build'), { recursive: true });
cpSync(path.join(root, 'electron', 'main.js'), path.join(staging, 'electron', 'main.js'));
cpSync(path.join(root, 'dist'), path.join(staging, 'dist'), { recursive: true });
// 应用图标（≥256 的正方形 png，electron-builder 自动转 ico；无图标则用默认）
const iconSrc = path.join(root, 'electron', 'icon.png');
const hasIcon = existsSync(iconSrc);
if (hasIcon) cpSync(iconSrc, path.join(staging, 'build', 'icon.png'));

const stagingPkg = {
  name: 'cmchen-blog-desktop',
  version: appVersion,
  description: 'cmchen blog 桌面阅读器',
  author: 'cmchen',
  main: 'electron/main.js',
  dependencies: { 'serve-handler': '^6.1.7' },
  build: {
    appId: 'com.cmchen.blog.desktop',
    productName: 'cmchen-blog-desktop',
    electronVersion,
    directories: { output: '..' },
    files: ['electron/**', 'dist/**'],
    win: {
      target: ['nsis', 'portable'],
      ...(hasIcon ? { icon: 'build/icon.png' } : {}),
    },
    mac: {
      // Intel 与 Apple 芯片各出一个 dmg
      target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
      ...(hasIcon ? { icon: 'build/icon.png' } : {}),
    },
    linux: {
      target: ['AppImage'],
      category: 'Utility',
    },
  },
};
writeFileSync(path.join(staging, 'package.json'), JSON.stringify(stagingPkg, null, 2));

// 本机直连 GitHub releases 会 TLS 失败，固定走镜像
const mirrorEnv = {
  ...process.env,
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/',
};
const shell = process.platform === 'win32';

const run = (label, cmd, args) => {
  console.log(`[desktop] ${label}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell, env: mirrorEnv });
  if (r.status !== 0) {
    console.error(`[desktop] ${label} 失败（exit ${r.status}）`);
    process.exit(r.status ?? 1);
  }
};

// 用 npm 装隔离的 staging 依赖：npm 不认 pnpm 工作区，不会像 pnpm --dir 那样
// 把根项目当目标执行 --prod 剪枝（实测曾误删根 node_modules 的 380 个包）
run('安装 staging 运行时依赖', 'npm', ['install', '--prefix', staging, '--omit=dev', '--no-audit', '--no-fund']);
run('electron-builder 打包', 'pnpm', ['exec', 'electron-builder', `--${target}`, '--projectDir', staging]);

// 清理构建中间产物，release/ 只留最终 exe（下次构建自动重新生成，不算丢失）
const releaseDir = path.join(root, 'release');
for (const junk of ['win-unpacked', 'desktop-app', '.icon-ico', 'builder-debug.yml']) {
  rmSync(path.join(releaseDir, junk), { recursive: true, force: true });
}
for (const f of readdirSync(releaseDir)) {
  if (f.endsWith('.blockmap')) rmSync(path.join(releaseDir, f), { force: true });
}
console.log('[desktop] 打包完成：release/ 下的 exe 为精简版，中间产物已清理');
