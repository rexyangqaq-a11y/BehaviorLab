import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Resolve only a local executable; configuration never runs a shell command. */
export function findHdc({ explicitPath, env = process.env, platform = process.platform,
  localConfigPath, exists = existsSync } = {}) {
  if (explicitPath) return exists(path.resolve(explicitPath)) ? path.resolve(explicitPath) : null;
  const executable = platform === 'win32' ? 'hdc.exe' : 'hdc';
  const directories = [env.HDC_HOME, ...(env.PATH ?? '').split(platform === 'win32' ? ';' : ':')].filter(Boolean);
  const system = directories.map(directory => path.join(directory.replace(/^"|"$/g, ''), executable)).find(exists);
  if (system) return system;
  if (!localConfigPath) return null;
  try {
    const config = JSON.parse(readFileSync(localConfigPath, 'utf8'));
    const relative = config.hdc?.relative_executable;
    if (config.schema_version !== 1 || typeof relative !== 'string' || path.isAbsolute(relative)) return null;
    const base = path.resolve(path.dirname(localConfigPath)), resolved = path.resolve(base, relative);
    if (!resolved.startsWith(base + path.sep)) return null;
    return exists(resolved) ? resolved : null;
  } catch { return null; }
}

/** Exit code 0 with no output is NOT proof of an empty device list. */
export function parseHdcTargets(stdout, stderr = '') {
  const lines = `${stdout ?? ''}\n${stderr ?? ''}`.split(/[\r\n]+/).map(value => value.trim()).filter(Boolean);
  if (!lines.length || lines.some(line => /\[(?:Fail|Error)\]|\berror:|\bfailed\b/i.test(line))) return { status: 'unverified', targets: [] };
  const empty = lines.some(line => /^\[?Empty\]?$/i.test(line));
  const targets = lines.filter(line => !line.startsWith('[') && !/^Empty$/i.test(line));
  if (targets.some(line => !/^[a-zA-Z0-9_.:\[\]-]+$/.test(line)) || (empty && targets.length)) return { status: 'unverified', targets: [] };
  if (targets.length) return { status: 'targets', targets };
  return { status: empty ? 'empty' : 'unverified', targets: [] };
}
