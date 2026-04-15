import { and, eq } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import {
  gameBuildTable,
  gameOrderTable,
  gamePlayerTable,
  gameRetreatTable,
  gameRoomTable,
  gameTurnTable,
  type PowerEnum,
} from '@/database/schema/game-schema.ts';
import type {
  DislodgedUnit,
  Power,
  SupplyCenterOwnership,
  UnitPositions,
} from '@/domain/game/engine/types.ts';
import { calculateBuildCounts } from '@/domain/game/engine/resolve-builds.ts';
import { createLogger } from '@/lib/logger.ts';
import { activateBotBrain } from './bot-brain.ts';
import { enqueueActivation } from './bot-activation.ts';
import { submitFallbackOrders } from './bot-fallback.ts';

const logger = createLogger('bot-recovery');

let hasRun = false;

/**
 * On server startup, scan for active games with pending bot submissions
 * and re-trigger their activations. Safe to call multiple times — only
 * runs once.
 */
export async function recoverPendingBotSubmissions(): Promise<void> {
  if (hasRun) return;
  hasRun = true;

  logger.info('Checking for games with pending bot submissions...');

  try {
    // Find all rooms currently in a playing state
    const rooms = await database
      .select({
        roomId: gameRoomTable.id,
        currentTurnId: gameRoomTable.currentTurnId,
      })
      .from(gameRoomTable)
      .where(eq(gameRoomTable.status, 'playing'));

    if (rooms.length === 0) {
      logger.info('No active games found');
      return;
    }

    let totalRecovered = 0;

    for (const room of rooms) {
      if (!room.currentTurnId) continue;

      const [turn] = await database
        .select()
        .from(gameTurnTable)
        .where(eq(gameTurnTable.id, room.currentTurnId));

      if (!turn || turn.isComplete) continue;

      const phase = turn.phase;
      if (
        phase !== 'order_submission' &&
        phase !== 'retreat_submission' &&
        phase !== 'build_submission'
      ) {
        continue;
      }

      // Find which powers have already submitted
      const submittedPowers = await getSubmittedPowers(
        turn.id,
        phase,
        turn.unitPositions as UnitPositions,
        turn.supplyCenters as SupplyCenterOwnership,
        (turn.dislodgedUnits as DislodgedUnit[] | null) ?? [],
      );

      // Find active bot players who haven't submitted
      const pendingBots = await database
        .select({
          playerId: gamePlayerTable.id,
          botId: gamePlayerTable.botId,
          power: gamePlayerTable.power,
        })
        .from(gamePlayerTable)
        .where(
          and(
            eq(gamePlayerTable.roomId, room.roomId),
            eq(gamePlayerTable.isBot, true),
            eq(gamePlayerTable.isSpectator, false),
            eq(gamePlayerTable.status, 'active'),
          ),
        );

      const pendingBotPlayers = pendingBots.filter(
        (bot) =>
          bot.power &&
          bot.botId &&
          !submittedPowers.has(bot.power),
      );

      if (pendingBotPlayers.length === 0) continue;

      logger.info(
        {
          roomId: room.roomId,
          phase,
          pendingCount: pendingBotPlayers.length,
          powers: pendingBotPlayers.map((b) => b.power),
        },
        'Recovering pending bot submissions',
      );

      for (const bot of pendingBotPlayers) {
        const tag = { bot: bot.power!.toUpperCase(), botId: bot.botId! };

        void enqueueActivation(
          bot.playerId,
          () =>
            activateBotBrain({
              playerId: bot.playerId,
              roomId: room.roomId,
              botId: bot.botId!,
              power: bot.power as PowerEnum,
              trigger: { type: 'phase_change', phase: phase as any },
            }),
          tag,
        ).catch(async () => {
          logger.warn({ ...tag }, 'Recovery activation failed — submitting fallback orders');
          try {
            await submitFallbackOrders({
              playerId: bot.playerId,
              roomId: room.roomId,
              power: bot.power as PowerEnum,
            });
          } catch (fallbackErr) {
            logger.error({ ...tag, err: fallbackErr }, 'Recovery fallback also failed');
          }
        });

        totalRecovered++;
      }
    }

    if (totalRecovered > 0) {
      logger.info({ totalRecovered }, 'Bot recovery complete — activations enqueued');
    } else {
      logger.info('No pending bot submissions found');
    }
  } catch (error) {
    logger.error({ err: error }, 'Bot recovery scan failed');
  }
}

async function getSubmittedPowers(
  turnId: string,
  phase: string,
  positions: UnitPositions,
  supplyCenters: SupplyCenterOwnership,
  dislodgedUnits: DislodgedUnit[],
): Promise<Set<string>> {
  if (phase === 'order_submission') {
    const rows = await database
      .select({ power: gameOrderTable.power })
      .from(gameOrderTable)
      .where(eq(gameOrderTable.turnId, turnId));
    return new Set(rows.map((r) => r.power));
  }

  if (phase === 'retreat_submission') {
    const rows = await database
      .select({ power: gameRetreatTable.power })
      .from(gameRetreatTable)
      .where(eq(gameRetreatTable.turnId, turnId));
    return new Set(rows.map((r) => r.power));
  }

  if (phase === 'build_submission') {
    const rows = await database
      .select({ power: gameBuildTable.power })
      .from(gameBuildTable)
      .where(eq(gameBuildTable.turnId, turnId));
    return new Set(rows.map((r) => r.power));
  }

  return new Set();
}
