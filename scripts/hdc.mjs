import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findHdc } from '../src/hdc-environment.mjs';

const executable = findHdc({ localConfigPath: fileURLToPath(new URL('../.runtime/device-tools.json', import.meta.url)) });
if (!executable) throw new Error('No local HDC installation found. See docs/HDC_WINDOWS_SETUP.md.');
const child = spawn(executable, process.argv.length > 2 ? process.argv.slice(2) : ['-v'], { stdio: 'inherit', shell: false, windowsHide: true });
child.on('error', () => { console.error('HDC could not be started.'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
