import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';

type MessageEventPayload = {
  type: 'message';
  roomId: string;
  threadId: string | null;
  roomName?: string;
};

type PhaseEventPayload = {
  type: 'phase';
  roomId: string;
  roomName?: string;
  headline?: string | null;
};

type Payload = MessageEventPayload | PhaseEventPayload;

/**
 * Shows a native OS notification when an event arrives while the tab is
 * hidden and the user has granted Notification permission. This is a lighter
 * layer that complements Web Push — Web Push fires for tabless users, this
 * fires for open-but-hidden tabs when the user hasn't subscribed to push.
 */
export function useInTabNotifications() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const notifyRef = useRef((payload: Payload) => {
    if (typeof window === 'undefined') return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return;

    const title =
      payload.type === 'message'
        ? `New message — ${payload.roomName ?? 'Diplomacy'}`
        : `Phase resolved — ${payload.roomName ?? 'Diplomacy'}`;
    const body =
      payload.type === 'message'
        ? 'Open the thread to read it.'
        : (payload.headline ?? 'Open the board to review.');
    const tag =
      payload.type === 'message'
        ? `in-tab:message:${payload.threadId ?? payload.roomId}`
        : `in-tab:phase:${payload.roomId}`;

    try {
      const notification = new Notification(title, {
        body,
        tag,
      });
      notification.onclick = () => {
        window.focus();
        void navigateRef.current({
          to: '/rooms/$roomId',
          params: { roomId: payload.roomId },
        });
        notification.close();
      };
    } catch {
      // Older browsers may throw; ignore.
    }
  });

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<Payload>;
      if (!custom.detail) return;
      notifyRef.current(custom.detail);
    };
    window.addEventListener('diplomacy:in-tab-notify', handler as EventListener);
    return () => {
      window.removeEventListener(
        'diplomacy:in-tab-notify',
        handler as EventListener,
      );
    };
  }, []);
}

/**
 * Called from existing live-sync hooks to raise an in-tab notification. Keeps
 * the hook decoupled from specific event sources.
 */
export function dispatchInTabNotification(payload: Payload): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('diplomacy:in-tab-notify', { detail: payload }),
  );
}
