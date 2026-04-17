import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { withMcpTool, type McpToolMeta } from '@/rpc/mcp.ts';

type BotFacingMcpToolName =
  | 'room.getRoom'
  | 'room.selectPower'
  | 'room.deselectPower'
  | 'room.setReady'
  | 'game.getGameState'
  | 'game.getGameHistory'
  | 'game.getPhaseResultHistory'
  | 'game.getSubmissionStatus'
  | 'game.acknowledgePhaseResult'
  | 'message.listThreads'
  | 'message.openOrCreateThread'
  | 'message.getThread'
  | 'message.sendMessage'
  | 'message.sendOrderProposal'
  | 'message.markThreadRead'
  | 'order.submitOrders'
  | 'order.submitRetreats'
  | 'order.submitBuilds'
  | 'order.getMyOrders'
  | 'room.watchRoomPageState'
  | 'message.watchMessageEvents';

function readOnlyAnnotations(): ToolAnnotations {
  return { readOnlyHint: true };
}

export const BOT_MCP_TOOL_DEFINITIONS: Record<
  BotFacingMcpToolName,
  McpToolMeta
> = {
  'room.getRoom': {
    description:
      'Get the current room roster and turn information for the bot seat room.',
    annotations: readOnlyAnnotations(),
  },
  'room.selectPower': {
    description: 'Claim a power for the current bot seat in the room lobby.',
  },
  'room.deselectPower': {
    description: 'Release the current bot seat power claim in the room lobby.',
  },
  'room.setReady': {
    description: 'Mark the current bot seat ready or not ready in the lobby.',
  },
  'game.getGameState': {
    description:
      'Get the current game state, my submission, and pending phase result for the bot seat room.',
    annotations: readOnlyAnnotations(),
  },
  'game.getGameHistory': {
    description:
      'List completed turns, submitted orders, and order results for the bot seat room.',
    annotations: readOnlyAnnotations(),
  },
  'game.getPhaseResultHistory': {
    description:
      'List every published phase result payload in chronological order for the bot seat room.',
    annotations: readOnlyAnnotations(),
  },
  'game.getSubmissionStatus': {
    description:
      'Get which powers are submitted or pending in the current phase for the bot seat room.',
    annotations: readOnlyAnnotations(),
  },
  'game.acknowledgePhaseResult': {
    description:
      'Acknowledge a published phase result as the current bot player seat.',
  },
  'message.listThreads': {
    description:
      'List message threads visible to the current bot player in the room.',
    annotations: readOnlyAnnotations(),
  },
  'message.openOrCreateThread': {
    description:
      'Open an existing private thread or create one with the selected participant player IDs.',
  },
  'message.getThread': {
    description:
      'Get a message thread, its messages, and pagination state for the current bot player.',
    annotations: readOnlyAnnotations(),
  },
  'message.sendMessage': {
    description:
      'Send a private message into an existing room conversation as the current bot player.',
  },
  'message.sendOrderProposal': {
    description:
      'Send a structured, visualizable order proposal into a room conversation as the current bot player. The proposal includes proposed orders and a snapshot of the current board state.',
  },
  'message.markThreadRead': {
    description:
      'Mark a room conversation as read for the current bot player seat.',
  },
  'order.submitOrders': {
    description:
      'Submit main-phase Diplomacy orders for the bot player power in the active room.',
  },
  'order.submitRetreats': {
    description:
      'Submit retreat orders for the bot player power in the active room.',
  },
  'order.submitBuilds': {
    description:
      'Submit build or disband orders for the bot player power in the active room.',
  },
  'order.getMyOrders': {
    description:
      'Get the current submitted orders, retreats, or builds for the bot player power.',
    annotations: readOnlyAnnotations(),
  },
  'room.watchRoomPageState': {
    description:
      'Start watching room page state for the current bot room and receive a subscribable room-state resource link.',
    annotations: readOnlyAnnotations(),
  },
  'message.watchMessageEvents': {
    description:
      'Start watching room message events and receive a subscribable message-event resource link.',
    annotations: readOnlyAnnotations(),
  },
};

export function withBotMcpTool<
  T extends {
    meta(meta: Record<string, unknown>): unknown;
  },
>(procedure: T, toolName: BotFacingMcpToolName): T {
  const definition = BOT_MCP_TOOL_DEFINITIONS[toolName];

  return withMcpTool(procedure as never, {
    ...definition,
    surfaces: ['internal_bot'],
  }) as T;
}
