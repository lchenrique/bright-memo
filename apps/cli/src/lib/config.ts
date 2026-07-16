import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CliConfig } from '../types.js';

const CONFIG_DIR = path.join(os.homedir(), '.bright-memo');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): CliConfig {
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

export function saveConfig(config: CliConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getConfig(key?: string): CliConfig | string {
  const config = loadConfig();
  if (key) {
    return config[key as keyof CliConfig] ?? '';
  }
  return config;
}

export function setConfig(key: string, value: string): void {
  const config = loadConfig();
  (config as Record<string, string>)[key] = value;
  saveConfig(config);
}
