import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import path from 'node:path';

// Vite runs in this process via its JS API; Electron is the only child process.
let server;
try {
  server = await createServer();
} catch (error) {
  console.error('Vite-Dev-Server konnte nicht erstellt werden:', error.message);
  process.exit(1);
}
try {
  await server.listen();
} catch (error) {
  console.error('Vite-Dev-Server konnte nicht gestartet werden:', error.message);
  await server.close();
  process.exit(1);
}

const url = server.resolvedUrls.local[0];

const electronBin = path.join(import.meta.dirname, '..', 'node_modules', '.bin', 'electron');
const electron = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

let closing = false;

// Never rejects, so dropping the returned promise at a call site is safe.
async function shutdown(exitCode) {
  if (closing) return;
  closing = true;
  try {
    await server.close();
  } catch (error) {
    console.error('Error while closing Vite dev server:', error);
  }
  process.exit(exitCode);
}

electron.on('error', (error) => {
  console.error('Failed to start Electron:', error);
  shutdown(1);
});

electron.on('exit', (code, signal) => {
  shutdown(signal ? 1 : code ?? 0);
});

function terminateElectron() {
  electron.kill();
  // Fallback in case Electron never emits 'exit'; force-kill it first so it can't be orphaned.
  setTimeout(() => {
    electron.kill('SIGKILL');
    shutdown(1);
  }, 5000).unref();
}

process.on('SIGINT', terminateElectron);
process.on('SIGTERM', terminateElectron);
