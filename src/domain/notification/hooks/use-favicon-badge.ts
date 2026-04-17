import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearFaviconBadge,
  setFaviconBadge,
} from '@/domain/notification/favicon-badge.ts';
import { orpcUtils } from '@/rpc/react.ts';

export function useFaviconBadge() {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...orpcUtils.notification.getUnreadMessageCount.queryOptions(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const count = query.data?.count ?? 0;

  useEffect(() => {
    if (count > 0) {
      setFaviconBadge(count);
    } else {
      clearFaviconBadge();
    }
  }, [count]);

  useEffect(() => {
    return () => {
      clearFaviconBadge();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const invalidate = () => {
      void queryClient.invalidateQueries({
        queryKey:
          orpcUtils.notification.getUnreadMessageCount.queryOptions().queryKey,
      });
    };
    window.addEventListener(
      'diplomacy:in-tab-notify',
      invalidate as EventListener,
    );
    return () => {
      window.removeEventListener(
        'diplomacy:in-tab-notify',
        invalidate as EventListener,
      );
    };
  }, [queryClient]);
}
