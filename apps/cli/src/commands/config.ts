import type { Command } from 'commander';
import { getConfig, setConfig } from '../lib/config.js';

export function configCommand(program: Command) {
  const cmd = program.command('config').description('manage CLI configuration');

  cmd
    .command('get [key]')
    .description('get config value(s)')
    .action((key?: string) => {
      const val = getConfig(key);
      if (key) {
        console.log(val);
      } else {
        for (const [k, v] of Object.entries(val)) {
          console.log(`${k}=${v}`);
        }
      }
    });

  cmd
    .command('set <key> <value>')
    .description('set a config value')
    .action((key: string, value: string) => {
      setConfig(key, value);
      console.log(`Config updated: ${key}=${value}`);
    });
}
