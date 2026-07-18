import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';

import { CliError } from '../lib/errors.js';
import { printJson } from '../lib/output.js';

export type SkillClient = 'opencode' | 'codex' | 'claude';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL_SOURCE = join(PACKAGE_ROOT, 'skill', 'bright-memory');

export function skillTargetRoot(client: SkillClient, homeDir = os.homedir()): string {
  if (client === 'opencode') return path.join(homeDir, '.config', 'opencode', 'skills');
  if (client === 'codex') return path.join(homeDir, '.agents', 'skills');
  return path.join(homeDir, '.claude', 'skills');
}

function detectedClients(homeDir = os.homedir()): SkillClient[] {
  const detected: SkillClient[] = [];
  if (existsSync(path.join(homeDir, '.config', 'opencode'))) detected.push('opencode');
  if (existsSync(path.join(homeDir, '.codex'))) detected.push('codex');
  if (existsSync(path.join(homeDir, '.claude'))) detected.push('claude');
  return detected;
}

export async function installBrightMemorySkill(options: {
  client: SkillClient;
  targetRoot?: string;
  homeDir?: string;
}): Promise<{ client: SkillClient; path: string }> {
  const targetRoot =
    options.targetRoot ?? skillTargetRoot(options.client, options.homeDir ?? os.homedir());
  const destination = path.join(targetRoot, 'bright-memory');
  await mkdir(targetRoot, { recursive: true });
  await cp(SKILL_SOURCE, destination, { recursive: true, force: true });
  return { client: options.client, path: destination };
}

export function skillCommand(program: Command): void {
  const skill = program.command('skill').description('manage Bright Memory agent skill');
  skill
    .command('install')
    .description('install operational skill for a coding agent')
    .option('--client <client>', 'auto, opencode, codex, or claude', 'auto')
    .option('--target-dir <path>', 'explicit parent directory for installed bright-memory skill')
    .option('--json', 'output one JSON value')
    .action(async (options: { client: string; targetDir?: string; json?: boolean }) => {
      const allowed = ['auto', 'opencode', 'codex', 'claude'];
      if (!allowed.includes(options.client)) {
        throw new CliError(`Invalid client "${options.client}". Use ${allowed.join(', ')}.`);
      }

      let clients: SkillClient[];
      if (options.client === 'auto') {
        clients = detectedClients();
        if (clients.length === 0) {
          throw new CliError(
            'No supported client detected. Pass --client and optionally --target-dir.',
          );
        }
        if (options.targetDir && clients.length !== 1) {
          throw new CliError(
            '--target-dir with --client auto requires exactly one detected client.',
          );
        }
      } else {
        clients = [options.client as SkillClient];
      }

      const installed = await Promise.all(
        clients.map((client) =>
          installBrightMemorySkill({ client, targetRoot: options.targetDir }),
        ),
      );
      if (options.json) printJson({ installed });
      else installed.forEach((entry) => console.log(`${entry.client}: ${entry.path}`));
    });
}
