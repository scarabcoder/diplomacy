import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { orpcUtils } from '@/rpc/react.ts';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(
      orpcUtils.auth.getUserSession.queryOptions(),
    );

    if (!session) {
      throw redirect({
        replace: true,
        to: '/login',
        search: { redirect: location.pathname },
      });
    }

    return { session };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <Outlet />;
}
