import { timingSafeEqual } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { database } from '@/database/database.ts';
import { selectOne } from '@/database/helpers.ts';
import {
  botPlayerCredentialTable,
  botTable,
  gamePlayerTable,
} from '@/database/schema/game-schema.ts';
import {
  createBotCredentialSecret,
  createBotCredentialToken,
  hashBotCredentialSecret,
  parseBotCredentialToken,
} from '@/domain/bot/token.ts';

export type BotSeatSession = {
  credentialId: string;
  botId: string;
  botName: string;
  playerId: string;
  roomId: string;
};

export type BotCredentialRecord = BotSeatSession & {
  secretHash: string;
  revokedAt: Date | null;
};

export {
  createBotCredentialSecret,
  createBotCredentialToken,
  hashBotCredentialSecret,
  parseBotCredentialToken,
};

function safeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function getBotCredentialRecord(
  credentialId: string,
): Promise<BotCredentialRecord | null> {
  const row = await selectOne(
    database
      .select({
        credentialId: botPlayerCredentialTable.id,
        secretHash: botPlayerCredentialTable.secretHash,
        revokedAt: botPlayerCredentialTable.revokedAt,
        botId: botTable.id,
        botName: botTable.name,
        playerId: gamePlayerTable.id,
        roomId: gamePlayerTable.roomId,
      })
      .from(botPlayerCredentialTable)
      .innerJoin(botTable, eq(botTable.id, botPlayerCredentialTable.botId))
      .innerJoin(
        gamePlayerTable,
        and(
          eq(gamePlayerTable.id, botPlayerCredentialTable.playerId),
          eq(gamePlayerTable.botId, botPlayerCredentialTable.botId),
          isNull(gamePlayerTable.userId),
        ),
      )
      .where(eq(botPlayerCredentialTable.id, credentialId)),
  );

  if (!row) {
    return null;
  }

  return {
    credentialId: row.credentialId,
    secretHash: row.secretHash,
    revokedAt: row.revokedAt,
    botId: row.botId,
    botName: row.botName,
    playerId: row.playerId,
    roomId: row.roomId,
  };
}

export async function authenticateBotCredentialToken(
  token: string,
): Promise<BotSeatSession | null> {
  const parsedToken = parseBotCredentialToken(token);

  if (!parsedToken) {
    return null;
  }

  const credential = await getBotCredentialRecord(parsedToken.credentialId);

  if (!credential || credential.revokedAt) {
    return null;
  }

  const providedHash = hashBotCredentialSecret(parsedToken.secret);

  if (!safeEqualHex(credential.secretHash, providedHash)) {
    return null;
  }

  return {
    credentialId: credential.credentialId,
    botId: credential.botId,
    botName: credential.botName,
    playerId: credential.playerId,
    roomId: credential.roomId,
  };
}

export async function touchBotCredential(credentialId: string) {
  await database
    .update(botPlayerCredentialTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(botPlayerCredentialTable.id, credentialId));
}
