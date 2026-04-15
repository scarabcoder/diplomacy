import { and, eq, ne } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import {
  gamePlayerTable,
  type GamePhaseEnum,
  type PowerEnum,
} from '@/database/schema/game-schema.ts';
import { roomConversationParticipantTable } from '@/database/schema/message-schema.ts';
import { createLogger } from '@/lib/logger.ts';
import { withTypingHeartbeat } from '@/domain/message/realtime.ts';
import { activateBotBrain } from './bot-brain.ts';
import { enqueueActivation, enqueueActivationDebounced } from './bot-activation.ts';
import { submitFallbackOrders } from './bot-fallback.ts';

const logger = createLogger('bot-triggers');

/**
 * Per-thread cooldown for bot-to-bot message triggers.
 * Keyed by `${recipientPlayerId}:${threadId}` → timestamp of last trigger.
 * Prevents infinite reply loops between bots.
 */
const BOT_REPLY_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const botReplyTimestamps = new Map<string, number>();

const SUBMISSION_PHASES: GamePhaseEnum[] = [
  'order_submission',
  'retreat_submission',
  'build_submission',
];

/** Build a log tag for a bot player */
function botTag(power: string, botId: string) {
  return { bot: power.toUpperCase(), botId };
}

/**
 * Query all active bot players in a room.
 */
async function getActiveBotPlayers(roomId: string) {
  logger.debug({ roomId }, 'Querying active bot players...');
  const bots = await database
    .select({
      playerId: gamePlayerTable.id,
      botId: gamePlayerTable.botId,
      power: gamePlayerTable.power,
    })
    .from(gamePlayerTable)
    .where(
      and(
        eq(gamePlayerTable.roomId, roomId),
        eq(gamePlayerTable.isBot, true),
        eq(gamePlayerTable.isSpectator, false),
        eq(gamePlayerTable.status, 'active'),
      ),
    );
  logger.debug(
    { roomId, botCount: bots.length, bots: bots.map((b) => ({ power: b.power, playerId: b.playerId })) },
    'Found active bot players',
  );
  return bots;
}

/**
 * Triggered when a game starts. Each bot examines the board, creates
 * an initial plan, conducts opening diplomacy, and submits first orders.
 */
export function onGameStarted(roomId: string): void {
  logger.info({ roomId }, 'onGameStarted trigger fired');

  void (async () => {
    try {
      const bots = await getActiveBotPlayers(roomId);

      if (bots.length === 0) {
        logger.debug({ roomId }, 'No active bots in room — skipping game_start trigger');
        return;
      }

      logger.info(
        { roomId, botCount: bots.length, powers: bots.map((b) => b.power) },
        'Game started — activating bot brains for initial planning',
      );

      for (const bot of bots) {
        if (!bot.botId || !bot.power) {
          logger.warn({ playerId: bot.playerId }, 'Skipping bot with missing botId or power');
          continue;
        }

        const tag = botTag(bot.power, bot.botId);
        logger.debug({ ...tag, playerId: bot.playerId }, 'Enqueuing game_start activation');

        void enqueueActivation(
          bot.playerId,
          () =>
            activateBotBrain({
              playerId: bot.playerId,
              roomId,
              botId: bot.botId!,
              power: bot.power as PowerEnum,
              trigger: { type: 'game_start' },
            }),
          tag,
        ).catch(async () => {
          logger.warn({ ...tag }, 'game_start activation failed — submitting fallback orders');
          try {
            await submitFallbackOrders({ playerId: bot.playerId, roomId, power: bot.power as PowerEnum });
          } catch (fallbackErr) {
            logger.error({ ...tag, err: fallbackErr }, 'Fallback order submission also failed');
          }
        });
      }
    } catch (error) {
      logger.error({ roomId, err: error }, 'Failed to trigger bot brains on game start');
    }
  })();
}

/**
 * Triggered when a message is sent. Notifies bot participants
 * (except the sender) to respond. Uses debounce to batch rapid messages.
 */
export function onMessageReceived(
  roomId: string,
  threadId: string,
  senderPlayerId: string,
): void {
  logger.debug({ roomId, threadId, senderPlayerId }, 'onMessageReceived trigger fired');

  void (async () => {
    try {
      // Find bot participants in this conversation (excluding the sender)
      logger.debug({ threadId, senderPlayerId }, 'Querying bot participants in thread...');
      const participants = await database
        .select({
          playerId: roomConversationParticipantTable.playerId,
        })
        .from(roomConversationParticipantTable)
        .innerJoin(
          gamePlayerTable,
          eq(gamePlayerTable.id, roomConversationParticipantTable.playerId),
        )
        .where(
          and(
            eq(roomConversationParticipantTable.conversationId, threadId),
            ne(roomConversationParticipantTable.playerId, senderPlayerId),
            eq(gamePlayerTable.isBot, true),
            eq(gamePlayerTable.status, 'active'),
          ),
        );

      if (participants.length === 0) {
        logger.debug({ threadId }, 'No bot participants in thread — skipping');
        return;
      }

      // Check if the sender is a bot (for cooldown gating)
      const [sender] = await database
        .select({ isBot: gamePlayerTable.isBot })
        .from(gamePlayerTable)
        .where(eq(gamePlayerTable.id, senderPlayerId));
      const senderIsBot = sender?.isBot ?? false;

      logger.info(
        { roomId, threadId, senderPlayerId, senderIsBot, botParticipantCount: participants.length },
        'Message received — notifying bot participants',
      );

      for (const participant of participants) {
        // Bot-to-bot cooldown: limit reply loops to ~1 exchange per cooldown window
        if (senderIsBot) {
          const cooldownKey = `${participant.playerId}:${threadId}`;
          const lastTriggered = botReplyTimestamps.get(cooldownKey);
          if (lastTriggered && Date.now() - lastTriggered < BOT_REPLY_COOLDOWN_MS) {
            logger.debug(
              { playerId: participant.playerId, threadId, cooldownKey, lastTriggeredAgoMs: Date.now() - lastTriggered },
              'Skipping bot-to-bot trigger — cooldown active',
            );
            continue;
          }
          botReplyTimestamps.set(cooldownKey, Date.now());
        }
        // Load the full player record for botId and power
        const [player] = await database
          .select()
          .from(gamePlayerTable)
          .where(eq(gamePlayerTable.id, participant.playerId));

        if (!player?.botId || !player.power) {
          logger.warn({ playerId: participant.playerId }, 'Skipping participant with missing botId or power');
          continue;
        }

        const tag = botTag(player.power, player.botId);
        logger.debug(
          { ...tag, playerId: player.id, threadId, senderPlayerId },
          'Enqueuing debounced message_received activation',
        );

        enqueueActivationDebounced(
          player.id,
          () =>
            withTypingHeartbeat(roomId, threadId, player.id, () =>
              activateBotBrain({
                playerId: player.id,
                roomId,
                botId: player.botId!,
                power: player.power as PowerEnum,
                trigger: { type: 'message_received', threadId, senderPlayerId },
              }),
            ),
          tag,
        );
      }
    } catch (error) {
      logger.error({ roomId, threadId, err: error }, 'Failed to trigger bot brains on message');
    }
  })();
}

/**
 * Triggered when the game advances to a new phase.
 * Bots analyze the board and submit orders for submission phases.
 */
export function onPhaseChanged(roomId: string, phase: GamePhaseEnum): void {
  logger.debug({ roomId, phase }, 'onPhaseChanged trigger fired');

  if (!SUBMISSION_PHASES.includes(phase)) {
    logger.debug({ roomId, phase }, 'Phase is not a submission phase — skipping');
    return;
  }

  void (async () => {
    try {
      const bots = await getActiveBotPlayers(roomId);

      if (bots.length === 0) {
        logger.debug({ roomId, phase }, 'No active bots in room — skipping phase_change trigger');
        return;
      }

      logger.info(
        { roomId, phase, botCount: bots.length, powers: bots.map((b) => b.power) },
        'Phase changed to submission phase — activating bot brains',
      );

      for (const bot of bots) {
        if (!bot.botId || !bot.power) {
          logger.warn({ playerId: bot.playerId }, 'Skipping bot with missing botId or power');
          continue;
        }

        const tag = botTag(bot.power, bot.botId);
        logger.debug({ ...tag, playerId: bot.playerId, phase }, 'Enqueuing phase_change activation');

        void enqueueActivation(
          bot.playerId,
          () =>
            activateBotBrain({
              playerId: bot.playerId,
              roomId,
              botId: bot.botId!,
              power: bot.power as PowerEnum,
              trigger: { type: 'phase_change', phase },
            }),
          tag,
        ).catch(async () => {
          logger.warn({ ...tag, phase }, 'phase_change activation failed — submitting fallback orders');
          try {
            await submitFallbackOrders({ playerId: bot.playerId, roomId, power: bot.power as PowerEnum });
          } catch (fallbackErr) {
            logger.error({ ...tag, err: fallbackErr }, 'Fallback order submission also failed');
          }
        });
      }
    } catch (error) {
      logger.error({ roomId, phase, err: error }, 'Failed to trigger bot brains on phase change');
    }
  })();
}

/**
 * Triggered by the room owner's "Finalize Phase" button.
 * Forces all bots to submit orders immediately. Returns a promise
 * that resolves when all bots have submitted (or timed out).
 */
export async function onFinalizePhase(roomId: string): Promise<void> {
  logger.info({ roomId }, 'onFinalizePhase trigger fired — forcing all bot submissions');

  const bots = await getActiveBotPlayers(roomId);

  if (bots.length === 0) {
    logger.info({ roomId }, 'No active bots to finalize');
    return;
  }

  logger.info(
    { roomId, botCount: bots.length, powers: bots.map((b) => b.power) },
    'Finalizing phase for bots',
  );

  const startTime = Date.now();
  const promises = bots
    .filter((bot) => bot.botId && bot.power)
    .map((bot) => {
      const tag = botTag(bot.power!, bot.botId!);
      logger.debug({ ...tag, playerId: bot.playerId }, 'Enqueuing finalize_phase activation');

      return enqueueActivation(
        bot.playerId,
        () =>
          activateBotBrain({
            playerId: bot.playerId,
            roomId,
            botId: bot.botId!,
            power: bot.power as PowerEnum,
            trigger: { type: 'finalize_phase' },
          }),
        tag,
      ).catch(async () => {
        logger.warn({ ...tag }, 'finalize_phase activation failed — submitting fallback orders');
        try {
          await submitFallbackOrders({ playerId: bot.playerId, roomId, power: bot.power as PowerEnum });
        } catch (fallbackErr) {
          logger.error({ ...tag, err: fallbackErr }, 'Fallback order submission also failed');
        }
      });
    });

  await Promise.all(promises);
  const durationMs = Date.now() - startTime;
  logger.info({ roomId, durationMs, botCount: bots.length }, 'All bot finalizations complete');
}
