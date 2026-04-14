import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { orpcUtils } from '@/rpc/react.ts';

export const Route = createFileRoute('/_auth')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string } => ({
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
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  );
}
