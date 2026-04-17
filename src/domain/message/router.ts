import {
  getThread,
  listThreads,
  markThreadRead,
  openOrCreateThread,
  sendMessage,
  sendOrderProposal,
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
  sendOrderProposal: withBotMcpTool(
    sendOrderProposal,
    'message.sendOrderProposal',
  ),
  markThreadRead: withBotMcpTool(markThreadRead, 'message.markThreadRead'),
  startTyping,
  watchMessageEvents,
};
