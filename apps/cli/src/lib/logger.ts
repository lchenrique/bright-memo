import pino from 'pino';

export function createLogger(level = 'info') {
  const isTTY = process.stdout.isTTY;

  if (isTTY) {
    return pino({
      level,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      },
    });
  }

  return pino({ level });
}
