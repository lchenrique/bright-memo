import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CliConfig } from '../types.js';

const CONFIG_DIR = path.join(os.homedir(), '.bright-memo');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function loadStoredConfig(): CliConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as CliConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

export function resolveConfig(
  stored: CliConfig,
  env: Partial<
    Pick<NodeJS.ProcessEnv, 'BRIGHT_MEMO_API_URL' | 'BRIGHT_MEMO_API_KEY'>
  > = process.env,
): CliConfig {
  const apiUrl = (env.BRIGHT_MEMO_API_URL ?? stored.apiUrl ?? 'http://localhost:3001').replace(
    /\/+$/,
    '',
  );
  return {
    ...stored,
    apiUrl,
    apiKey: env.BRIGHT_MEMO_API_KEY ?? stored.apiKey,
  };
}

export function loadConfig(): CliConfig {
  return resolveConfig(loadStoredConfig());
}

export function saveConfig(config: CliConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600);
}

export function getConfig(key?: string): CliConfig | string {
  const config = loadStoredConfig();
  if (key) {
    return config[key as keyof CliConfig] ?? '';
  }
  return config;
}

export function setConfig(key: string, value: string): void {
  const config = loadStoredConfig();
  (config as Record<string, string>)[key] = value;
  saveConfig(config);
}
