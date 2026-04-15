import { ORPCError } from '@orpc/client';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  createBotCredentialSecret,
  createBotCredentialToken,
  hashBotCredentialSecret,
} from '@/domain/bot/auth.ts';
import {
  requireRoomMembershipForActor,
  requireRpcActor,
} from '@/domain/player-actor.ts';
import { authed } from '@/rpc/base.ts';
import { database } from '@/database/database.ts';
import {
  botPlayerCredentialTable,
  botTable,
  gameRoomTable,
  gamePlayerTable,
  gameTurnTable,
} from '@/database/schema/game-schema.ts';
import { selectOne } from '@/database/helpers.ts';
import {
  STARTING_POSITIONS,
  INITIAL_SUPPLY_CENTERS,
} from '@/domain/game/engine/map-data.ts';
import { POWERS } from '@/domain/game/engine/types.ts';
import {
  createRoomSchema,
  joinRoomSchema,
  getRoomSchema,
  watchRoomPageStateSchema,
  selectPowerSchema,
  deselectPowerSchema,
  setReadySchema,
  startGameSchema,
  fillBotsSchema,
  finalizePhaseSchema,
  listMyRoomsSchema,
} from './schema.ts';
import { getRoomDataSnapshot } from './live-state.ts';
import { publishRoomEvent, watchRoomPageStateStream } from './realtime.ts';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function formatBotName(power: (typeof POWERS)[number]) {
  return `Bot (${power.charAt(0).toUpperCase() + power.slice(1)})`;
}

async function getRoomMembership(roomId: string, userId: string) {
  return selectOne(
    database
      .select()
      .from(gamePlayerTable)
      .where(
        and(
          eq(gamePlayerTable.roomId, roomId),
          eq(gamePlayerTable.userId, userId),
        ),
      ),
  );
}

function assertRoomCreator(
  membership: typeof gamePlayerTable.$inferSelect | null | undefined,
  action: string,
) {
  if (!membership || membership.role !== 'creator') {
    throw new ORPCError('FORBIDDEN', {
      message: `Only the room creator can ${action}`,
    });
  }
}

// --- Create Room ---
export const createRoom = authed
  .input(createRoomSchema)
  .handler(async ({ input, context: { userSession } }) => {
    const code = generateRoomCode();

    const [room] = await database
      .insert(gameRoomTable)
      .values({
        code,
        name: input.name,
        status: 'lobby',
        createdBy: userSession.user.id,
      })
      .returning();

    // Add creator as first player
    await database.insert(gamePlayerTable).values({
      roomId: room!.id,
      userId: userSession.user.id,
      role: 'creator',
      isSpectator: false,
      isReady: false,
      status: 'active',
    });

    return room!;
  });

// --- Join Room ---
export const joinRoom = authed
  .input(joinRoomSchema)
  .handler(async ({ input, context: { userSession } }) => {
    const room = await selectOne(
      database
        .select()
        .from(gameRoomTable)
        .where(eq(gameRoomTable.code, input.code.toUpperCase())),
    );

    if (!room) {
      throw new ORPCError('NOT_FOUND', { message: 'Room not found' });
    }

    // Check if already in room
    const existingPlayer = await selectOne(
      database
        .select()
        .from(gamePlayerTable)
        .where(
          and(
            eq(gamePlayerTable.roomId, room.id),
            eq(gamePlayerTable.userId, userSession.user.id),
          ),
        ),
    );

    if (existingPlayer) {
      return { room, player: existingPlayer };
    }

    // Count current non-spectator players
    const [playerCount] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(gamePlayerTable)
      .where(
        and(
          eq(gamePlayerTable.roomId, room.id),
          eq(gamePlayerTable.isSpectator, false),
        ),
      );

    const isSpectator =
      room.status !== 'lobby' || (playerCount?.count ?? 0) >= 7;

    const [player] = await database
      .insert(gamePlayerTable)
      .values({
        roomId: room.id,
        userId: userSession.user.id,
        isSpectator,
        isReady: false,
        status: 'active',
      })
      .returning();

    publishRoomEvent(room.id, 'join_room');
    return { room, player: player! };
  });

// --- Get Room ---
export const getRoom = authed
  .input(getRoomSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    await requireRoomMembershipForActor(input.roomId, actor);

    return getRoomDataSnapshot(input.roomId);
  });

// --- Watch Room Page State ---
export const watchRoomPageState = authed
  .input(watchRoomPageStateSchema)
  .handler(async ({ input, context: { request, userSession } }) => {
    const membership = await getRoomMembership(input.roomId, userSession.user.id);

    if (!membership) {
      throw new ORPCError('FORBIDDEN', {
        message: 'You are not a member of this room',
      });
    }

    return watchRoomPageStateStream({
      roomId: input.roomId,
      playerId: membership.id,
      signal: request?.signal,
    });
  });

// --- Select Power ---
export const selectPower = authed
  .input(selectPowerSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const player = await requireRoomMembershipForActor(
      input.roomId,
      actor,
      'You are not a player in this room',
    );

    if (!player || player.isSpectator) {
      throw new ORPCError('FORBIDDEN', {
        message: 'You are not a player in this room',
      });
    }

    // Check room is in lobby
    const room = await selectOne(
      database
        .select()
        .from(gameRoomTable)
        .where(eq(gameRoomTable.id, input.roomId)),
    );
    if (!room || room.status !== 'lobby') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Room is not in lobby state',
      });
    }

    // Check power is not already taken by someone else
    const existingClaim = await selectOne(
      database
        .select()
        .from(gamePlayerTable)
        .where(
          and(
            eq(gamePlayerTable.roomId, input.roomId),
            eq(gamePlayerTable.power, input.power),
          ),
        ),
    );

    if (existingClaim && existingClaim.id !== player.id) {
      throw new ORPCError('CONFLICT', {
        message: `${input.power} is already taken`,
      });
    }

    const [updated] = await database
      .update(gamePlayerTable)
      .set({ power: input.power, isReady: false })
      .where(eq(gamePlayerTable.id, player.id))
      .returning();

    publishRoomEvent(input.roomId, 'select_power');
    return updated!;
  });

// --- Deselect Power ---
export const deselectPower = authed
  .input(deselectPowerSchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const player = await requireRoomMembershipForActor(
      input.roomId,
      actor,
      'Player not found',
    );

    if (!player) {
      throw new ORPCError('NOT_FOUND', { message: 'Player not found' });
    }

    const [updated] = await database
      .update(gamePlayerTable)
      .set({ power: null, isReady: false })
      .where(eq(gamePlayerTable.id, player.id))
      .returning();

    publishRoomEvent(input.roomId, 'deselect_power');
    return updated!;
  });

// --- Set Ready ---
export const setReady = authed
  .input(setReadySchema)
  .handler(async ({ input, context }) => {
    const actor = requireRpcActor(context);
    const player = await requireRoomMembershipForActor(
      input.roomId,
      actor,
      'You are not a player in this room',
    );

    if (!player || player.isSpectator) {
      throw new ORPCError('FORBIDDEN', {
        message: 'You are not a player in this room',
      });
    }

    if (input.ready && !player.power) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'You must select a power before readying up',
      });
    }

    const [updated] = await database
      .update(gamePlayerTable)
      .set({ isReady: input.ready })
      .where(eq(gamePlayerTable.id, player.id))
      .returning();

    publishRoomEvent(input.roomId, 'set_ready');
    return updated!;
  });

// --- Start Game ---
export const startGame = authed
  .input(startGameSchema)
  .handler(async ({ input, context: { userSession } }) => {
    const room = await selectOne(
      database
        .select()
        .from(gameRoomTable)
        .where(eq(gameRoomTable.id, input.roomId)),
    );

    if (!room) {
      throw new ORPCError('NOT_FOUND', { message: 'Room not found' });
    }

    const membership = await getRoomMembership(
      input.roomId,
      userSession.user.id,
    );
    assertRoomCreator(membership, 'start the game');

    if (room.status !== 'lobby') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Game has already started',
      });
    }

    // Check all 7 powers are claimed and all players are ready
    const players = await database
      .select()
      .from(gamePlayerTable)
      .where(
        and(
          eq(gamePlayerTable.roomId, room.id),
          eq(gamePlayerTable.isSpectator, false),
        ),
      );

    const activePlayers = players.filter((p) => p.power !== null);
    if (activePlayers.length !== 7) {
      throw new ORPCError('BAD_REQUEST', {
        message: `Need 7 players with powers selected, have ${activePlayers.length}`,
      });
    }

    const allReady = activePlayers.every((p) => p.isReady);
    if (!allReady) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'All players must be ready',
      });
    }

    // Create first turn: Spring 1901, order_submission phase
    const [turn] = await database
      .insert(gameTurnTable)
      .values({
        roomId: room.id,
        turnNumber: 1,
        year: 1901,
        season: 'spring',
        phase: 'order_submission',
        unitPositions: STARTING_POSITIONS,
        supplyCenters: INITIAL_SUPPLY_CENTERS,
      })
      .returning();

    // Update room status and current turn
    await database
      .update(gameRoomTable)
      .set({
        status: 'playing',
        currentTurnId: turn!.id,
        updatedAt: new Date(),
      })
      .where(eq(gameRoomTable.id, room.id));

    // Set initial supply center counts for players
    for (const player of activePlayers) {
      const count = player.power === 'russia' ? 4 : 3;
      await database
        .update(gamePlayerTable)
        .set({ supplyCenterCount: count })
        .where(eq(gamePlayerTable.id, player.id));
    }

    publishRoomEvent(input.roomId, 'start_game');

    // Activate AI bots after game starts
    const { onGameStarted } = await import('@/domain/bot/brain/bot-triggers.ts');
    onGameStarted(input.roomId);

    return { room: { ...room, status: 'playing' as const }, turn: turn! };
  });

// --- Fill Bots ---
export const fillBots = authed
  .input(fillBotsSchema)
  .handler(async ({ input, context: { userSession } }) => {
    const room = await selectOne(
      database
        .select()
        .from(gameRoomTable)
        .where(eq(gameRoomTable.id, input.roomId)),
    );

    if (!room) {
      throw new ORPCError('NOT_FOUND', { message: 'Room not found' });
    }

    const membership = await getRoomMembership(
      input.roomId,
      userSession.user.id,
    );
    assertRoomCreator(membership, 'add bots');

    if (room.status !== 'lobby') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Can only add bots in the lobby',
      });
    }

    const players = await database
      .select()
      .from(gamePlayerTable)
      .where(
        and(
          eq(gamePlayerTable.roomId, room.id),
          eq(gamePlayerTable.isSpectator, false),
        ),
      );

    const openSeats = Math.max(0, 7 - players.length);
    const takenPowers = new Set(players.map((p) => p.power).filter(Boolean));
    const availablePowers = POWERS.filter((p) => !takenPowers.has(p)).slice(
      0,
      openSeats,
    );

    if (availablePowers.length === 0) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          openSeats === 0
            ? 'The lobby already has 7 players'
            : 'All remaining powers are already taken',
      });
    }

    const createdBots: Array<{
      botId: string;
      playerId: string;
      roomId: string;
      power: (typeof POWERS)[number];
      displayName: string;
      token: string;
    }> = [];

    for (const power of availablePowers) {
      const [bot] = await database
        .insert(botTable)
        .values({
          name: formatBotName(power),
        })
        .returning();

      const [player] = await database
        .insert(gamePlayerTable)
        .values({
          roomId: room.id,
          botId: bot!.id,
          power,
          isSpectator: false,
          isReady: true,
          isBot: true,
          status: 'active',
        })
        .returning();

      const secret = createBotCredentialSecret();
      const [credential] = await database
        .insert(botPlayerCredentialTable)
        .values({
          playerId: player!.id,
          botId: bot!.id,
          secretHash: hashBotCredentialSecret(secret),
        })
        .returning();

      createdBots.push({
        botId: bot!.id,
        playerId: player!.id,
        roomId: room.id,
        power,
        displayName: bot!.name,
        token: createBotCredentialToken(credential!.id, secret),
      });
    }

    publishRoomEvent(input.roomId, 'fill_bots');
    return { added: availablePowers.length, createdBots };
  });

// --- Finalize Phase ---
export const finalizePhase = authed
  .input(finalizePhaseSchema)
  .handler(async ({ input, context: { userSession } }) => {
    const room = await selectOne(
      database
        .select()
        .from(gameRoomTable)
        .where(eq(gameRoomTable.id, input.roomId)),
    );

    if (!room) {
      throw new ORPCError('NOT_FOUND', { message: 'Room not found' });
    }

    const membership = await getRoomMembership(input.roomId, userSession.user.id);
    assertRoomCreator(membership, 'finalize the phase');

    if (room.status !== 'playing') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Game is not in progress',
      });
    }

    if (!room.currentTurnId) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'No active turn',
      });
    }

    const turn = await selectOne(
      database
        .select()
        .from(gameTurnTable)
        .where(eq(gameTurnTable.id, room.currentTurnId)),
    );

    if (!turn || turn.isComplete) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'No active phase to finalize',
      });
    }

    const submissionPhases = ['order_submission', 'retreat_submission', 'build_submission'];
    if (!submissionPhases.includes(turn.phase)) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Current phase is not a submission phase',
      });
    }

    const { onFinalizePhase } = await import('@/domain/bot/brain/bot-triggers.ts');
    await onFinalizePhase(input.roomId);

    publishRoomEvent(input.roomId, 'finalize_phase');
    return { finalized: true };
  });

// --- List My Rooms ---
export const listMyRooms = authed
  .input(listMyRoomsSchema)
  .handler(async ({ input, context: { userSession } }) => {
    const myPlayerRecords = await database
      .select()
      .from(gamePlayerTable)
      .where(eq(gamePlayerTable.userId, userSession.user.id))
      .limit(input.limit)
      .offset(input.offset);

    if (myPlayerRecords.length === 0) {
      return [];
    }

    const roomIds = myPlayerRecords.map((p) => p.roomId);

    const rooms = await database
      .select()
      .from(gameRoomTable)
      .where(inArray(gameRoomTable.id, roomIds));

    return rooms.map((room) => ({
      ...room,
      myPlayer: myPlayerRecords.find((p) => p.roomId === room.id)!,
    }));
  });
