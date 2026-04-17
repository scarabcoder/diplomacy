import {
  getGameState,
  getGameHistory,
  getPhaseResultHistory,
  getSubmissionStatus,
  acknowledgePhaseResult,
} from './procedures.ts';
import { withBotMcpTool } from '@/rpc/mcp-bot-tools.ts';

export const gameRouter = {
  getGameState: withBotMcpTool(getGameState, 'game.getGameState'),
  getGameHistory: withBotMcpTool(getGameHistory, 'game.getGameHistory'),
  getPhaseResultHistory: withBotMcpTool(
    getPhaseResultHistory,
    'game.getPhaseResultHistory',
  ),
  getSubmissionStatus: withBotMcpTool(
    getSubmissionStatus,
    'game.getSubmissionStatus',
  ),
  acknowledgePhaseResult: withBotMcpTool(
    acknowledgePhaseResult,
    'game.acknowledgePhaseResult',
  ),
};
