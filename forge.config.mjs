import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { tmpdir } from 'node:os';
import path from 'node:path';

export default {
  outDir: path.join(tmpdir(), 'LaegeKald-forge-output'),
  buildIdentifier: new Date().toISOString().replace(/[:.]/g, '-'),
  packagerConfig: {
    asar: true,
    appBundleId: 'dk.ventevaerelse.laegekald',
    ignore: [/^\/\.git($|\/)/, /^\/node_modules($|\/)/, /^\/out($|\/)/, /^\/dist($|\/)/],
  },
  makers: [
    new MakerSquirrel({
      name: 'LaegeKald',
      authors: 'Ventevaerelsesskaerm',
      description: 'Doctors patient calls and staff alert',
      setupExe: 'LaegeKald-Setup.exe',
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
    }, ['win32']),
  ],
};
