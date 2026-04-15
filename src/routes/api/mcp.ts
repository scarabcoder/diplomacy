import { createFileRoute } from '@tanstack/react-router';
import { authenticateBotMcpRequest } from '@/rpc/mcp-auth.ts';
import {
  createMcpPreflightResponse,
  createMcpUnauthorizedResponse,
  handleAuthenticatedMcpRequest,
} from '@/rpc/mcp-server.ts';

async function handleMcpRequest(request: Request) {
  const botSession = await authenticateBotMcpRequest(request);

  if (!botSession) {
    return createMcpUnauthorizedResponse();
  }

  return handleAuthenticatedMcpRequest(request, botSession);
}

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      ANY: ({ request }) => {
        if (request.method === 'OPTIONS') {
          return createMcpPreflightResponse();
        }

        return handleMcpRequest(request);
      },
    },
  },
});
