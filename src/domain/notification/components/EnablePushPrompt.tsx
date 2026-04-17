import { useEffect, useState } from 'react';
import { Bell, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import {
  checkWebPushSupport,
  getCurrentSubscriptionEndpoint,
  subscribeToWebPush,
} from '@/domain/notification/web-push-client.ts';

const DISMISSED_KEY = 'notifications-prompt-dismissed';

export function EnablePushPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const support = checkWebPushSupport();
    if (!support.supported) return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    void getCurrentSubscriptionEndpoint().then((endpoint) => {
      if (!endpoint) setVisible(true);
    });
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  };

  const handleEnable = async () => {
    setBusy(true);
    try {
      await subscribeToWebPush();
    } finally {
      setBusy(false);
      dismiss();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 motion-safe:animate-in motion-safe:slide-in-from-bottom-2 motion-safe:fade-in motion-safe:duration-300">
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-[1.25rem] border border-[color:color-mix(in_oklab,var(--border)_72%,var(--accent-brass)_28%)] bg-[color:color-mix(in_oklab,var(--paper)_92%,white_8%)] px-4 py-3 shadow-[0_12px_32px_rgba(66,48,24,0.22)]">
        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--accent-brass)_28%,white_72%)] text-[color:var(--accent-oxblood)]">
          <Bell className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm text-foreground">
            Get notified about messages and phase results
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Enable browser notifications so you hear about new activity even
            when this tab is closed.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.14em]"
              disabled={busy}
              onClick={() => void handleEnable()}
            >
              {busy ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Bell className="size-3" />
              )}
              Enable
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.14em]"
              onClick={dismiss}
            >
              Not now
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-black/5 hover:text-foreground"
          onClick={dismiss}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
