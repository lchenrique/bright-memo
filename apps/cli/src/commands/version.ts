import { createRequire } from 'node:module';
import type { Command } from 'commander';

const require = createRequire(import.meta.url);

export function versionCommand(program: Command) {
  program
    .command('version')
    .description('show CLI version')
    .action(() => {
      const pkg = require('../../package.json');
      console.log(pkg.version);
    });
}
