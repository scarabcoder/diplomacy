import { createLogger } from '@/lib/logger.ts';

const logger = createLogger('bot-activation');

/**
 * Per-bot activation queue. Ensures a bot never has overlapping AI calls.
 * Keyed by playerId → the promise of the currently-running (or last-queued) activation.
 */
const activationQueues = new Map<string, Promise<void>>();

/**
 * Per-bot debounce timers for message_received triggers.
 * If multiple messages arrive within the debounce window, only the last fires.
 */
const messageDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

const ACTIVATION_TIMEOUT_MS = 120_000; // 2 minutes max per activation
const MESSAGE_DEBOUNCE_MS = 3_000; // 3 second debounce for message triggers
const RETRY_DELAYS_MS = [5_000, 15_000]; // 2 retries after initial attempt

/**
 * Enqueue a bot brain activation. If the bot is already thinking,
 * the new activation waits for the current one to finish first.
 */
export function enqueueActivation(
  playerId: string,
  fn: () => Promise<void>,
  tag?: { bot: string; botId: string },
): Promise<void> {
  const isQueued = activationQueues.has(playerId);
  const previous = activationQueues.get(playerId) ?? Promise.resolve();

  if (isQueued) {
    logger.debug(
      { playerId, ...tag },
      'Queuing activation behind running task',
    );
  } else {
    logger.debug({ playerId, ...tag }, 'Enqueuing activation (queue empty)');
  }

  const next = previous
    .catch(() => {}) // don't let a failed activation block the queue
    .then(() => runWithRetry(playerId, fn, tag));

  activationQueues.set(playerId, next);

  // Clean up when done
  next.finally(() => {
    if (activationQueues.get(playerId) === next) {
      activationQueues.delete(playerId);
      logger.debug({ playerId, ...tag }, 'Activation queue cleared');
    }
  });

  return next;
}

/**
 * Enqueue an activation with a debounce window.
 * Used for message_received triggers so rapid-fire messages
 * don't each trigger a separate AI call.
 */
export function enqueueActivationDebounced(
  playerId: string,
  fn: () => Promise<void>,
  tag?: { bot: string; botId: string },
): void {
  const existing = messageDebounceTimers.get(playerId);
  if (existing) {
    logger.debug(
      { playerId, ...tag, debounceMs: MESSAGE_DEBOUNCE_MS },
      'Resetting debounce timer (new message arrived)',
    );
    clearTimeout(existing);
  } else {
    logger.debug(
      { playerId, ...tag, debounceMs: MESSAGE_DEBOUNCE_MS },
      'Starting debounce timer',
    );
  }

  const timer = setTimeout(() => {
    messageDebounceTimers.delete(playerId);
    logger.debug(
      { playerId, ...tag },
      'Debounce timer fired — enqueuing activation',
    );
    void enqueueActivation(playerId, fn, tag);
  }, MESSAGE_DEBOUNCE_MS);

  messageDebounceTimers.set(playerId, timer);
}

/**
 * Retry wrapper with exponential backoff. Retries the activation
 * up to RETRY_DELAYS_MS.length times before giving up.
 */
async function runWithRetry(
  playerId: string,
  fn: () => Promise<void>,
  tag?: { bot: string; botId: string },
): Promise<void> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await runWithTimeout(playerId, fn, tag);
      return;
    } catch (error) {
      if (attempt < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempt]!;
        logger.warn(
          {
            playerId,
            ...tag,
            attempt: attempt + 1,
            retryInMs: delay,
            err: error,
          },
          'Activation failed — retrying after delay',
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        logger.error(
          { playerId, ...tag, attempts: attempt + 1 },
          'All activation attempts exhausted',
        );
        throw error;
      }
    }
  }
}

/**
 * Run a function with a timeout. If the function takes longer than
 * ACTIVATION_TIMEOUT_MS, the promise rejects (the function itself
 * continues running, but downstream callers are unblocked).
 */
async function runWithTimeout(
  playerId: string,
  fn: () => Promise<void>,
  tag?: { bot: string; botId: string },
): Promise<void> {
  const controller = new AbortController();
  const startTime = Date.now();

  logger.debug(
    { playerId, ...tag, timeoutMs: ACTIVATION_TIMEOUT_MS },
    'Starting activation with timeout',
  );

  const timeoutId = setTimeout(() => {
    const elapsed = Date.now() - startTime;
    logger.warn(
      {
        playerId,
        ...tag,
        elapsedMs: elapsed,
        timeoutMs: ACTIVATION_TIMEOUT_MS,
      },
      'Bot activation timed out — aborting',
    );
    controller.abort();
  }, ACTIVATION_TIMEOUT_MS);

  try {
    await fn();
    const durationMs = Date.now() - startTime;
    logger.debug(
      { playerId, ...tag, durationMs },
      'Activation completed within timeout',
    );
  } catch (error) {
    const durationMs = Date.now() - startTime;
    if (controller.signal.aborted) {
      logger.error(
        { playerId, ...tag, durationMs },
        'Bot activation aborted after timeout',
      );
    } else {
      logger.error(
        { playerId, ...tag, durationMs, err: error },
        'Bot activation failed with error',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
