import pino from 'pino';

export function createLogger(name: string) {
  return pino({
    name,
    ...(process.env.PRETTY_LOGGING === 'true'
      ? { transport: { target: 'pino-pretty' } }
      : {}),
  });
}
