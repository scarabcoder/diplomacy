import { ORPCError } from '@orpc/client';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { authed } from '@/rpc/base.ts';
import { database } from '@/database/database.ts';
import {
  gameRoomTable,
  gamePlayerTable,
  gameTurnTable,
} from '@/database/schema/game-schema.ts';
import { userTable } from '@/database/schema/auth-schema.ts';
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
  selectPowerSchema,
  deselectPowerSchema,
  setReadySchema,
  startGameSchema,
  fillBotsSchema,
  listMyRoomsSchema,
} from './schema.ts';

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
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

    return { room, player: player! };
  });

// --- Get Room ---
export const getRoom = authed
  .input(getRoomSchema)
  .handler(async ({ input }) => {
    const room = await selectOne(
      database
        .select()
        .from(gameRoomTable)
        .where(eq(gameRoomTable.id, input.roomId)),
    );

    if (!room) {
      throw new ORPCError('NOT_FOUND', { message: 'Room not found' });
    }

    const players = await database
      .select()
      .from(gamePlayerTable)
      .where(eq(gamePlayerTable.roomId, room.id));

    // Get current turn if game is playing
    let currentTurn = null;
    if (room.currentTurnId) {
      currentTurn = await selectOne(
        database
          .select()
          .from(gameTurnTable)
          .where(eq(gameTurnTable.id, room.currentTurnId)),
      );
    }

    return { room, players, currentTurn: currentTurn ?? null };
  });

// --- Select Power ---
export const selectPower = authed
  .input(selectPowerSchema)
  .handler(async ({ input, context: { userSession } }) => {
    const player = await selectOne(
      database
        .select()
        .from(gamePlayerTable)
        .where(
          and(
            eq(gamePlayerTable.roomId, input.roomId),
            eq(gamePlayerTable.userId, userSession.user.id),
          ),
        ),
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

    if (existingClaim && existingClaim.userId !== userSession.user.id) {
      throw new ORPCError('CONFLICT', {
        message: `${input.power} is already taken`,
      });
    }

    const [updated] = await database
      .update(gamePlayerTable)
      .set({ power: input.power, isReady: false })
      .where(eq(gamePlayerTable.id, player.id))
      .returning();

    return updated!;
  });

// --- Deselect Power ---
export const deselectPower = authed
  .input(deselectPowerSchema)
  .handler(async ({ input, context: { userSession } }) => {
    const player = await selectOne(
      database
        .select()
        .from(gamePlayerTable)
        .where(
          and(
            eq(gamePlayerTable.roomId, input.roomId),
            eq(gamePlayerTable.userId, userSession.user.id),
          ),
        ),
    );

    if (!player) {
      throw new ORPCError('NOT_FOUND', { message: 'Player not found' });
    }

    const [updated] = await database
      .update(gamePlayerTable)
      .set({ power: null, isReady: false })
      .where(eq(gamePlayerTable.id, player.id))
      .returning();

    return updated!;
  });

// --- Set Ready ---
export const setReady = authed
  .input(setReadySchema)
  .handler(async ({ input, context: { userSession } }) => {
    const player = await selectOne(
      database
        .select()
        .from(gamePlayerTable)
        .where(
          and(
            eq(gamePlayerTable.roomId, input.roomId),
            eq(gamePlayerTable.userId, userSession.user.id),
          ),
        ),
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

    if (room.createdBy !== userSession.user.id) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Only the room creator can start the game',
      });
    }

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

    if (room.createdBy !== userSession.user.id) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Only the room creator can add bots',
      });
    }

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

    // Create bot user records and player records for each available power
    for (const power of availablePowers) {
      const botId = `bot-${power}-${room.id}`;

      // Upsert bot user record
      await database
        .insert(userTable)
        .values({
          id: botId,
          name: `Bot (${power.charAt(0).toUpperCase() + power.slice(1)})`,
          email: `${botId}@bot.local`,
          emailVerified: false,
          isAnonymous: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();

      // Create bot player
      await database
        .insert(gamePlayerTable)
        .values({
          roomId: room.id,
          userId: botId,
          power,
          isSpectator: false,
          isReady: true,
          isBot: true,
          status: 'active',
        })
        .onConflictDoNothing();
    }

    return { added: availablePowers.length };
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
