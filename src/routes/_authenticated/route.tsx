import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { orpcUtils } from '@/rpc/react.ts';
import { EnablePushPrompt } from '@/domain/notification/components/EnablePushPrompt.tsx';
import { useFaviconBadge } from '@/domain/notification/hooks/use-favicon-badge.ts';
import { useInTabNotifications } from '@/domain/notification/hooks/use-in-tab-notifications.ts';

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
  useInTabNotifications();
  useFaviconBadge();
  return (
    <>
      <Outlet />
      <EnablePushPrompt />
    </>
  );
}
