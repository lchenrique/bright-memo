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

const program = new Command();

program.name('bm').description('Bright Memo CLI').version('0.1.0');

versionCommand(program);
configCommand(program);
initCommand(program);
saveCommand(program);
listCommand(program);
searchCommand(program);
statusCommand(program);
syncCommand(program);

program.parse(process.argv);
