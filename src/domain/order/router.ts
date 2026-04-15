import {
  submitOrders,
  submitRetreats,
  submitBuilds,
  getMyOrders,
} from './procedures.ts';
import { withBotMcpTool } from '@/rpc/mcp-bot-tools.ts';

export const orderRouter = {
  submitOrders: withBotMcpTool(submitOrders, 'order.submitOrders'),
  submitRetreats: withBotMcpTool(submitRetreats, 'order.submitRetreats'),
  submitBuilds: withBotMcpTool(submitBuilds, 'order.submitBuilds'),
  getMyOrders: withBotMcpTool(getMyOrders, 'order.getMyOrders'),
};
