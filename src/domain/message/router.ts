import {
  getThread,
  listThreads,
  markThreadRead,
  openOrCreateThread,
  sendMessage,
  startTyping,
  watchMessageEvents,
} from './procedures.ts';
import { withBotMcpTool } from '@/rpc/mcp-bot-tools.ts';

export const messageRouter = {
  listThreads: withBotMcpTool(listThreads, 'message.listThreads'),
  openOrCreateThread: withBotMcpTool(
    openOrCreateThread,
    'message.openOrCreateThread',
  ),
  getThread: withBotMcpTool(getThread, 'message.getThread'),
  sendMessage: withBotMcpTool(sendMessage, 'message.sendMessage'),
  markThreadRead: withBotMcpTool(markThreadRead, 'message.markThreadRead'),
  startTyping,
  watchMessageEvents,
};
