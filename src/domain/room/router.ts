import {
  createRoom,
  joinRoom,
  getRoom,
  watchRoomPageState,
  selectPower,
  deselectPower,
  setReady,
  startGame,
  fillBots,
  finalizePhase,
  listMyRooms,
} from './procedures.ts';
import { withBotMcpTool } from '@/rpc/mcp-bot-tools.ts';

export const roomRouter = {
  createRoom,
  joinRoom,
  getRoom: withBotMcpTool(getRoom, 'room.getRoom'),
  watchRoomPageState,
  selectPower: withBotMcpTool(selectPower, 'room.selectPower'),
  deselectPower: withBotMcpTool(deselectPower, 'room.deselectPower'),
  setReady: withBotMcpTool(setReady, 'room.setReady'),
  startGame,
  fillBots,
  finalizePhase,
  listMyRooms,
};
