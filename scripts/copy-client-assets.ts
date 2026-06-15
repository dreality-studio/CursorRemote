import { cpSync, existsSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientDest = join(root, 'dist', 'client');
const clientSrc = join(root, 'src', 'client');
const socketDir = join(root, 'node_modules', 'socket.io', 'client-dist');

if (existsSync(clientDest)) {
  rmSync(clientDest, { recursive: true, force: true });
}

cpSync(clientSrc, clientDest, { recursive: true });
cpSync(join(socketDir, 'socket.io.min.js'), join(clientDest, 'vendor-socket.io.min.js'));
cpSync(join(socketDir, 'socket.io.min.js.map'), join(clientDest, 'vendor-socket.io.min.js.map'));
