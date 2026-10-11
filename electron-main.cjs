const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const isSquirrelEvent = process.platform === 'win32' && process.argv.some((arg) => arg.startsWith('--squirrel-'));

const siteRoot = path.resolve(__dirname);
const localPort = 4178;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function startLocalSite() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${localPort}`).pathname);
      } catch {
        response.writeHead(400).end('Bad request');
        return;
      }
      if (pathname === '/') pathname = '/app.html';

      const filePath = path.resolve(siteRoot, `.${pathname}`);
      if (!filePath.startsWith(siteRoot + path.sep)) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      fs.stat(filePath, (statError, stat) => {
        if (statError || !stat.isFile()) {
          response.writeHead(404).end('Not found');
          return;
        }
        response.writeHead(200, {
          'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(filePath).pipe(response);
      });
    });

    server.once('error', reject);
    server.listen(localPort, '127.0.0.1', () => resolve(server));
  });
}

async function createWindow() {
  const localServer = await startLocalSite();
  const window = new BrowserWindow({
    width: 1180,
    height: 850,
    minWidth: 780,
    minHeight: 620,
    title: 'LaegeKald · Personalets indkaldningsapp',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.on('closed', () => localServer.close());
  await window.loadURL(`http://127.0.0.1:${localPort}/app.html`);
}

if (isSquirrelEvent) {
  app.quit();
} else {
  app.setAppUserModelId('com.squirrel.LaegeKald.LaegeKald');
  app.whenReady().then(createWindow).catch((error) => {
    dialog.showErrorBox('LaegeKald kunne ikke starte', error.message);
    app.quit();
  });

  app.on('window-all-closed', () => app.quit());
}
