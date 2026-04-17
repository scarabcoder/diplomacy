import { eq, sql } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { selectOne } from '@/database/helpers.ts';
import { botBrainStateTable } from '@/database/schema/bot-brain-schema.ts';
import type { PowerEnum } from '@/database/schema/game-schema.ts';
import { createLogger } from '@/lib/logger.ts';
import type {
  BotObservation,
  BotRelationship,
  BotRelationships,
} from './types.ts';

const logger = createLogger('bot-memory');

export type BrainState = typeof botBrainStateTable.$inferSelect;

export async function getOrCreateBrainState(params: {
  playerId: string;
  roomId: string;
  botId: string;
  power: PowerEnum;
}): Promise<BrainState> {
  const log = logger.child({
    bot: params.power.toUpperCase(),
    botId: params.botId,
  });

  log.debug(
    { playerId: params.playerId },
    'Looking up existing brain state...',
  );
  const existing = await selectOne(
    database
      .select()
      .from(botBrainStateTable)
      .where(eq(botBrainStateTable.playerId, params.playerId)),
  );

  if (existing) {
    log.debug({ brainStateId: existing.id }, 'Found existing brain state');
    return existing;
  }

  log.debug('No existing brain state — creating new record...');
  const [created] = await database
    .insert(botBrainStateTable)
    .values({
      playerId: params.playerId,
      roomId: params.roomId,
      botId: params.botId,
      power: params.power,
    })
    .onConflictDoNothing()
    .returning();

  // Race condition: another activation may have created it
  if (!created) {
    log.debug('Insert returned nothing (race condition) — re-fetching...');
    return (await selectOne(
      database
        .select()
        .from(botBrainStateTable)
        .where(eq(botBrainStateTable.playerId, params.playerId)),
    ))!;
  }

  log.info({ brainStateId: created.id }, 'Created new brain state');
  return created;
}

export async function updateStrategicPlan(
  playerId: string,
  plan: string,
): Promise<void> {
  logger.debug(
    { playerId, planLength: plan.length },
    'Persisting strategic plan update',
  );
  await database
    .update(botBrainStateTable)
    .set({ strategicPlan: plan, updatedAt: new Date() })
    .where(eq(botBrainStateTable.playerId, playerId));
  logger.debug({ playerId }, 'Strategic plan persisted');
}

export async function addObservation(
  playerId: string,
  observation: BotObservation,
): Promise<void> {
  logger.debug(
    {
      playerId,
      turn: observation.turn,
      phase: observation.phase,
      noteLength: observation.note.length,
    },
    'Persisting new observation',
  );
  await database
    .update(botBrainStateTable)
    .set({
      observations: sql`${botBrainStateTable.observations} || ${JSON.stringify([observation])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(botBrainStateTable.playerId, playerId));
  logger.debug({ playerId }, 'Observation persisted');
}

export async function setObservations(
  playerId: string,
  observations: BotObservation[],
): Promise<void> {
  logger.debug(
    { playerId, count: observations.length },
    'Replacing observations list',
  );
  await database
    .update(botBrainStateTable)
    .set({
      observations: sql`${JSON.stringify(observations)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(botBrainStateTable.playerId, playerId));
  logger.debug(
    { playerId, count: observations.length },
    'Observations replaced',
  );
}

export async function updateRelationship(
  playerId: string,
  targetPower: PowerEnum,
  assessment: BotRelationship,
): Promise<void> {
  logger.debug(
    {
      playerId,
      targetPower: targetPower.toUpperCase(),
      trust: assessment.trust,
      stance: assessment.stance,
    },
    'Persisting relationship update',
  );
  await database
    .update(botBrainStateTable)
    .set({
      relationships: sql`${botBrainStateTable.relationships} || ${JSON.stringify({ [targetPower]: assessment })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(botBrainStateTable.playerId, playerId));
  logger.debug(
    { playerId, targetPower: targetPower.toUpperCase() },
    'Relationship persisted',
  );
}

export async function getFullBrainState(
  playerId: string,
): Promise<BrainState | undefined> {
  logger.debug({ playerId }, 'Fetching full brain state');
  const state = await selectOne(
    database
      .select()
      .from(botBrainStateTable)
      .where(eq(botBrainStateTable.playerId, playerId)),
  );
  logger.debug({ playerId, found: !!state }, 'Full brain state fetch complete');
  return state;
}

/** Parse the raw JSONB observations column into typed array */
export function parseObservations(raw: unknown): BotObservation[] {
  if (!Array.isArray(raw)) return [];
  return raw as BotObservation[];
}

/** Parse the raw JSONB relationships column into typed record */
export function parseRelationships(raw: unknown): BotRelationships {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as BotRelationships;
}
