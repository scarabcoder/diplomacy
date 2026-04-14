import { createORPCReactQueryUtils } from '@orpc/react-query';
import { client } from '@/rpc/client.ts';

export const orpcUtils = createORPCReactQueryUtils(client);
