import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Bell, BellOff, Loader2, Mail } from 'lucide-react';
import {
  ParchmentPanel,
  SectionKicker,
  WarRoomStage,
} from '@/components/surfaces/war-room.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  checkWebPushSupport,
  getCurrentSubscriptionEndpoint,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from '@/domain/notification/web-push-client.ts';
import { orpcUtils } from '@/rpc/react.ts';

export const Route = createFileRoute('/_authenticated/settings/notifications')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      orpcUtils.notification.getMyPreferences.queryOptions(),
    );
  },
  component: NotificationsSettingsPage,
});

type PrefKey =
  | 'emailOnMessage'
  | 'emailOnPhaseResult'
  | 'webPushOnMessage'
  | 'webPushOnPhaseResult';

function NotificationsSettingsPage() {
  const queryClient = useQueryClient();

  const preferencesQuery = useSuspenseQuery(
    orpcUtils.notification.getMyPreferences.queryOptions(),
  );
  const preferences = preferencesQuery.data.preferences;

  const updateMutation = useMutation({
    ...orpcUtils.notification.updateMyPreferences.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orpcUtils.notification.getMyPreferences.queryOptions()
          .queryKey,
      });
    },
  });

  const togglePref = (key: PrefKey) => {
    updateMutation.mutate({ [key]: !preferences[key] });
  };

  const pushSupport = useMemo(() => checkWebPushSupport(), []);
  const [pushStatus, setPushStatus] = useState<
    'unknown' | 'subscribed' | 'unsubscribed' | 'denied'
  >('unknown');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupport.supported) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setPushStatus('denied');
      return;
    }
    void getCurrentSubscriptionEndpoint().then((endpoint) => {
      setPushStatus(endpoint ? 'subscribed' : 'unsubscribed');
    });
  }, [pushSupport.supported]);

  const enablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const result = await subscribeToWebPush();
      if (result.status === 'subscribed') {
        setPushStatus('subscribed');
      } else if (result.status === 'permission_denied') {
        setPushStatus('denied');
        setPushError('Browser permission denied. Enable notifications in your browser settings.');
      } else if (result.status === 'misconfigured') {
        setPushError(
          'Server is missing VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable web push.',
        );
      } else if (result.status === 'unsupported') {
        setPushError(result.reason);
      }
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      await unsubscribeFromWebPush();
      setPushStatus('unsubscribed');
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <WarRoomStage>
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-10">
        <ParchmentPanel
          className="stagger-panel px-5 py-5 sm:px-6"
          style={{ '--stagger-index': 0 } as CSSProperties}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <SectionKicker>Settings</SectionKicker>
              <h1 className="font-display text-3xl text-foreground sm:text-4xl">
                Notifications
              </h1>
              <p className="max-w-[40rem] text-sm leading-6 text-muted-foreground">
                Choose how you want to hear about new messages and phases
                resolving.
              </p>
            </div>
            <Button asChild variant="outline" className="self-start">
              <Link to="/">
                <ArrowLeft className="size-4" /> Back to rooms
              </Link>
            </Button>
          </div>
        </ParchmentPanel>

        <ParchmentPanel
          className="stagger-panel space-y-5 px-5 py-5 sm:px-6"
          style={{ '--stagger-index': 1 } as CSSProperties}
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--accent-brass)_28%,white_72%)] text-[color:var(--accent-oxblood)]">
              <Mail className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-xl text-foreground">Email</h2>
              <p className="text-sm text-muted-foreground">
                Sent to your account email. Message emails are coalesced every
                {' '}
                {Math.round(preferences.messageDebounceSeconds / 60)} min per
                thread to avoid spam.
              </p>
            </div>
          </div>
          <PreferenceToggle
            label="New messages"
            description="Email when someone sends you a message in a thread you're in."
            checked={preferences.emailOnMessage}
            onToggle={() => togglePref('emailOnMessage')}
            disabled={updateMutation.isPending}
          />
          <PreferenceToggle
            label="Phase resolved"
            description="Email when a turn's orders, retreats, or builds are adjudicated."
            checked={preferences.emailOnPhaseResult}
            onToggle={() => togglePref('emailOnPhaseResult')}
            disabled={updateMutation.isPending}
          />
        </ParchmentPanel>

        <ParchmentPanel
          className="stagger-panel space-y-5 px-5 py-5 sm:px-6"
          style={{ '--stagger-index': 2 } as CSSProperties}
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-[color:color-mix(in_oklab,var(--accent-brass)_28%,white_72%)] text-[color:var(--accent-oxblood)]">
              <Bell className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-xl text-foreground">
                Browser notifications
              </h2>
              <p className="text-sm text-muted-foreground">
                Pushed by your browser — these work even when the tab is closed,
                once you've enabled them on this device.
              </p>
            </div>
          </div>

          {pushSupport.supported ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {pushStatus === 'subscribed' ? (
                  <>
                    <span className="inline-flex items-center gap-2 rounded-full bg-[oklch(0.92_0.08_150)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[oklch(0.35_0.15_150)]">
                      <Bell className="size-3" /> Enabled on this device
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => void disablePush()}
                      disabled={pushBusy}
                    >
                      {pushBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <BellOff className="size-4" />
                      )}
                      Disable on this device
                    </Button>
                  </>
                ) : pushStatus === 'denied' ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-[oklch(0.92_0.04_28)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-destructive">
                    <BellOff className="size-3" /> Blocked in browser
                  </span>
                ) : (
                  <Button
                    onClick={() => void enablePush()}
                    disabled={pushBusy}
                  >
                    {pushBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Bell className="size-4" />
                    )}
                    Enable on this device
                  </Button>
                )}
              </div>

              {pushError ? (
                <p className="rounded-[1rem] bg-[oklch(0.92_0.04_28)] px-4 py-3 text-sm text-destructive">
                  {pushError}
                </p>
              ) : null}

              <PreferenceToggle
                label="New messages"
                description="Push a notification when someone messages you."
                checked={preferences.webPushOnMessage}
                onToggle={() => togglePref('webPushOnMessage')}
                disabled={updateMutation.isPending}
              />
              <PreferenceToggle
                label="Phase resolved"
                description="Push a notification when a turn is adjudicated."
                checked={preferences.webPushOnPhaseResult}
                onToggle={() => togglePref('webPushOnPhaseResult')}
                disabled={updateMutation.isPending}
              />
            </div>
          ) : (
            <p className="rounded-[1rem] bg-[color:color-mix(in_oklab,var(--paper-strong)_70%,white_30%)] px-4 py-3 text-sm text-muted-foreground">
              {pushSupport.reason}
            </p>
          )}
        </ParchmentPanel>
      </div>
    </WarRoomStage>
  );
}

function PreferenceToggle({
  label,
  description,
  checked,
  onToggle,
  disabled,
}: Readonly<{
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}>) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[1.15rem] border border-black/10 bg-white/58 px-4 py-3 transition hover:bg-white/72">
      <div className="min-w-0 space-y-1">
        <div className="font-display text-base text-foreground">{label}</div>
        <div className="text-sm leading-6 text-muted-foreground">
          {description}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-black/10 transition disabled:cursor-not-allowed disabled:opacity-60 ${
          checked
            ? 'bg-[color:var(--accent-oxblood)]'
            : 'bg-[color:color-mix(in_oklab,var(--paper-strong)_70%,white_30%)]'
        }`}
      >
        <span
          className={`inline-block size-5 transform rounded-full bg-white shadow-sm transition ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
        <span className="sr-only">
          {label}: {checked ? 'on' : 'off'}
        </span>
      </button>
    </label>
  );
}
