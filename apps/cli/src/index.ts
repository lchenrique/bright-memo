#!/usr/bin/env node
import { Command } from 'commander';
import { versionCommand } from './commands/version.js';
import { configCommand } from './commands/config.js';
import { initCommand } from './commands/init.js';
import { saveCommand } from './commands/save.js';
import { listCommand } from './commands/list.js';
import { searchCommand } from './commands/search.js';
import { statusCommand } from './commands/status.js';
import { syncCommand } from './commands/sync.js';
import { installCommand } from './commands/install.js';
import { skillCommand } from './commands/skill.js';
import { ApiError, CliError, statusToExitCode } from './lib/errors.js';
import { printJson } from './lib/output.js';

const program = new Command();

program.name('bm').description('Bright Memo CLI').version('0.2.1');

versionCommand(program);
configCommand(program);
initCommand(program);
saveCommand(program);
listCommand(program);
searchCommand(program);
statusCommand(program);
syncCommand(program);
installCommand(program);
skillCommand(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  const json = process.argv.includes('--json');
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof ApiError ? error.code : undefined;
  if (json) printJson({ error: { code: code ?? 'CLI_ERROR', message } });
  else console.error(`Error: ${message}`);

  if (error instanceof ApiError) process.exitCode = statusToExitCode(error.statusCode);
  else if (error instanceof CliError) process.exitCode = error.exitCode;
  else process.exitCode = 1;
});
