import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { WarRoomStage } from '@/components/surfaces/war-room.tsx';
import { orpcUtils } from '@/rpc/react.ts';

export const Route = createFileRoute('/_auth')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect:
      typeof search.redirect === 'string' && search.redirect.startsWith('/')
        ? search.redirect
        : undefined,
  }),
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(
      orpcUtils.auth.getUserSession.queryOptions(),
    );
    if (session) {
      throw redirect({ replace: true, to: search.redirect || '/' });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <WarRoomStage>
      <Outlet />
    </WarRoomStage>
  );
}
