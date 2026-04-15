import {
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link } from '@tanstack/react-router';
import { Brain, MessageSquare, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { PowerFlag } from '@/domain/game/power-presentation.tsx';
import { cn } from '@/lib/utils.ts';
import type {
  FlyoutContent,
  HeaderStatusChipData,
  PlayersWindowSections,
  ToolbarAction,
} from './types.ts';
import { formatPlayerStatus } from './utils.ts';

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </div>
      {subtitle ? (
        <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
      ) : null}
    </div>
  );
}

export const FlyoutCard = memo(function FlyoutCard({
  children,
  title,
  subtitle,
  mobile,
  onClose,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  mobile?: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={
        mobile
          ? 'pointer-events-auto rounded-[1.75rem] border border-black/10 bg-white/96 p-4 shadow-2xl backdrop-blur'
          : 'pointer-events-auto w-[20rem] rounded-[1.75rem] border border-black/10 bg-white/92 p-4 shadow-2xl backdrop-blur'
      }
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <SectionTitle title={title} subtitle={subtitle} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-1 h-9 w-9 rounded-full text-muted-foreground"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      {children}
    </div>
  );
});

function ToolbarButton({ action }: { action: ToolbarAction }) {
  const Icon = action.icon;
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [suppressTooltipUntilLeave, setSuppressTooltipUntilLeave] =
    useState(false);

  const showTooltip = () => {
    if (suppressTooltipUntilLeave || action.disabled) {
      return;
    }

    setIsTooltipVisible(true);
  };

  const hideTooltip = () => {
    setIsTooltipVisible(false);
  };

  return (
    <div
      className="relative flex"
      onPointerEnter={showTooltip}
      onPointerLeave={() => {
        hideTooltip();
        setSuppressTooltipUntilLeave(false);
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title={action.tooltip ?? action.label}
        aria-label={action.label}
        aria-pressed={action.active}
        disabled={action.disabled}
        onFocus={showTooltip}
        onBlur={() => {
          hideTooltip();
          setSuppressTooltipUntilLeave(false);
        }}
        onClick={(event) => {
          action.onClick();
          hideTooltip();
          setSuppressTooltipUntilLeave(true);
          event.currentTarget.blur();
        }}
        className={cn(
          'h-11 w-11 cursor-pointer rounded-2xl border border-black/10 bg-white/88 text-slate-700 shadow-sm backdrop-blur transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-white hover:text-slate-950 hover:shadow-[0_14px_28px_rgba(15,23,42,0.16)] focus-visible:-translate-y-0.5 focus-visible:bg-white focus-visible:text-slate-950 focus-visible:shadow-[0_14px_28px_rgba(15,23,42,0.16)] disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-sm',
          action.active &&
            'border-[#111827]/15 bg-[#111827] text-white shadow-[0_14px_28px_rgba(17,24,39,0.24)] hover:bg-[#111827] hover:text-white focus-visible:bg-[#111827] focus-visible:text-white',
        )}
      >
        <Icon className="size-4" />
        <span className="sr-only">{action.label}</span>
      </Button>
      <div
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 flex -translate-x-1/2 whitespace-nowrap rounded-full border border-black/10 bg-[#111827]/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/88 shadow-lg transition duration-150 ease-out sm:bottom-auto sm:left-full sm:top-1/2 sm:mb-0 sm:ml-2 sm:-translate-y-1/2 sm:translate-x-0',
          isTooltipVisible ? 'visible opacity-100' : 'invisible opacity-0',
        )}
      >
        {action.tooltip ?? action.label}
      </div>
    </div>
  );
}

function HeaderStatusChip({
  icon: Icon,
  label,
  compactLabel,
  className,
  compact,
}: HeaderStatusChipData & { compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold tracking-[0.08em] shadow-sm',
        compact && 'flex-1 justify-center gap-1.5 px-2 py-1.5 md:flex-initial md:gap-2 md:px-3.5',
        className,
      )}
    >
      <Icon className="size-4 shrink-0" />
      {compact && compactLabel ? (
        <>
          <span className="md:hidden">{compactLabel}</span>
          <span className="hidden md:inline">{label}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
}

function PlayersWindowBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'ink' | 'success' | 'warning';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]',
        tone === 'ink' &&
          'border-[color:color-mix(in_oklab,var(--accent-navy)_36%,white_64%)] bg-[color:color-mix(in_oklab,var(--accent-navy)_78%,var(--ink-strong)_22%)] text-[color:var(--paper)] shadow-sm',
        tone === 'neutral' &&
          'border-[color:color-mix(in_oklab,var(--border)_76%,var(--accent-brass)_24%)] bg-[color:color-mix(in_oklab,var(--paper-strong)_86%,white_14%)] text-[color:var(--ink-soft)]',
        tone === 'success' &&
          'border-[color:color-mix(in_oklab,var(--accent-forest)_34%,white_66%)] bg-[color:color-mix(in_oklab,var(--accent-forest)_12%,white_88%)] text-[color:color-mix(in_oklab,var(--accent-forest)_74%,var(--ink-strong)_26%)]',
        tone === 'warning' &&
          'border-[color:color-mix(in_oklab,var(--accent-brass)_52%,white_48%)] bg-[color:color-mix(in_oklab,var(--accent-brass)_18%,white_82%)] text-[color:color-mix(in_oklab,var(--accent-oxblood)_34%,var(--ink-strong)_66%)]',
      )}
    >
      {label}
    </span>
  );
}

function getPlayersWindowMetrics(playersWindowSections: PlayersWindowSections) {
  const activePlayers = playersWindowSections.activePlayers;
  const spectators = playersWindowSections.spectators;
  const pendingPlayers = activePlayers.filter(
    (player) => player.submissionState === 'pending',
  );
  const submittedPlayers = activePlayers.filter(
    (player) => player.submissionState === 'submitted',
  );
  const standbyPlayers = activePlayers.filter(
    (player) => player.submissionState === null,
  );
  const trackedPlayers = pendingPlayers.length + submittedPlayers.length;

  return {
    activePlayers,
    spectators,
    activeCount: activePlayers.length,
    spectatorCount: spectators.length,
    pendingPlayers,
    pendingCount: pendingPlayers.length,
    submittedPlayers,
    submittedCount: submittedPlayers.length,
    standbyPlayers,
    standbyCount: standbyPlayers.length,
    trackedPlayers,
    hasSubmissionTracking: trackedPlayers > 0,
  };
}

function formatRosterCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function PlayersWindowRow({
  player,
  onMessagePlayer,
  onInspectBot,
}: {
  player: PlayersWindowSections['activePlayers'][number];
  onMessagePlayer?: (playerId: string) => void;
  onInspectBot?: (playerId: string) => void;
}) {
  const stateTone =
    player.submissionState === 'pending'
      ? 'bg-[color:color-mix(in_oklab,var(--accent-brass)_12%,white_88%)]'
      : player.submissionState === 'submitted'
        ? 'bg-[color:color-mix(in_oklab,var(--accent-forest)_10%,white_90%)]'
        : '';
  const stateDot =
    player.submissionState === 'pending'
      ? 'bg-[color:var(--accent-brass)]'
      : player.submissionState === 'submitted'
        ? 'bg-[color:var(--accent-forest)]'
        : 'bg-[color:color-mix(in_oklab,var(--ink-soft)_56%,white_44%)]';

  return (
    <div
      className={cn(
        'grid gap-2.5 border-t border-[color:color-mix(in_oklab,var(--border)_76%,white_24%)] px-3.5 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
        stateTone,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.72)]',
            stateDot,
          )}
        />
        <div className="min-w-0">
          <div className="truncate text-[0.95rem] font-semibold text-[color:var(--ink-strong)]">
            {player.displayName}
          </div>
          {player.activityTagline ? (
            <div className="mt-0.5 truncate text-xs italic text-[color:var(--ink-soft)]">
              {player.activityTagline}
            </div>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
            {player.power ? (
              <span className="inline-flex items-center gap-1.5">
                <PowerFlag className="h-3 w-4.5" power={player.power} />
                <span>{player.powerLabel}</span>
              </span>
            ) : (
              <span>{player.powerLabel}</span>
            )}
            <span
              aria-hidden="true"
              className="h-1 w-1 rounded-full bg-[color:color-mix(in_oklab,var(--ink-soft)_48%,white_52%)]"
            />
            <span>{formatPlayerStatus(player.status)}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {onMessagePlayer && !player.isCurrentUser && !player.isSpectator ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full border border-black/10 bg-white/72 text-[color:var(--ink-soft)] hover:bg-white hover:text-[color:var(--ink-strong)]"
            aria-label={`Message ${player.displayName}`}
            onClick={() => onMessagePlayer(player.id)}
          >
            <MessageSquare className="size-3.5" />
          </Button>
        ) : null}
        {onInspectBot && player.isBot ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full border border-black/10 bg-white/72 text-[color:var(--ink-soft)] hover:bg-white hover:text-[color:var(--ink-strong)]"
            aria-label={`Inspect ${player.displayName}`}
            onClick={() => onInspectBot(player.id)}
          >
            <Brain className="size-3.5" />
          </Button>
        ) : null}
        {player.submissionState === 'submitted' ? (
          <PlayersWindowBadge label="Submitted" tone="success" />
        ) : player.submissionState === 'pending' ? (
          <PlayersWindowBadge label="Pending" tone="warning" />
        ) : null}
        {player.isCurrentUser ? (
          <PlayersWindowBadge label="You" tone="ink" />
        ) : null}
        {player.role === 'creator' ? (
          <PlayersWindowBadge label="Creator" tone="neutral" />
        ) : null}
        {player.isBot ? (
          <PlayersWindowBadge label="Bot" tone="neutral" />
        ) : null}
      </div>
    </div>
  );
}

function PlayersWindowSection({
  title,
  subtitle,
  players,
  tone = 'neutral',
  onMessagePlayer,
  onInspectBot,
}: {
  title: string;
  subtitle?: string;
  players: PlayersWindowSections['activePlayers'];
  tone?: 'neutral' | 'warning' | 'success';
  onMessagePlayer?: (playerId: string) => void;
  onInspectBot?: (playerId: string) => void;
}) {
  if (players.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-end justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </div>
        {subtitle ? (
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
            {subtitle}
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          'overflow-hidden rounded-[1.25rem] border shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
          tone === 'neutral' &&
            'border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] bg-[color:color-mix(in_oklab,var(--paper)_82%,var(--paper-strong)_18%)]',
          tone === 'warning' &&
            'border-[color:color-mix(in_oklab,var(--accent-brass)_44%,white_56%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-brass)_13%,white_87%)_0%,color-mix(in_oklab,var(--paper)_82%,var(--accent-brass)_18%)_100%)]',
          tone === 'success' &&
            'border-[color:color-mix(in_oklab,var(--accent-forest)_32%,white_68%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-forest)_10%,white_90%)_0%,color-mix(in_oklab,var(--paper)_84%,var(--accent-forest)_16%)_100%)]',
        )}
      >
        {players.map((player) => (
          <PlayersWindowRow
            key={player.id}
            player={player}
            onMessagePlayer={onMessagePlayer}
            onInspectBot={onInspectBot}
          />
        ))}
      </div>
    </section>
  );
}

function PlayersWindowCard({
  onClose,
  playersWindowSections,
  panelId,
  titleId,
  descriptionId,
  closeButtonRef,
  mobile,
  onMessagePlayer,
  onInspectBot,
}: {
  onClose: () => void;
  playersWindowSections: PlayersWindowSections;
  panelId: string;
  titleId: string;
  descriptionId: string;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  mobile?: boolean;
  onMessagePlayer?: (playerId: string) => void;
  onInspectBot?: (playerId: string) => void;
}) {
  const {
    activePlayers,
    spectators,
    activeCount,
    spectatorCount,
    pendingPlayers,
    pendingCount,
    submittedPlayers,
    submittedCount,
    standbyPlayers,
    standbyCount,
    hasSubmissionTracking,
  } = getPlayersWindowMetrics(playersWindowSections);
  const subtitle =
    spectatorCount > 0
      ? `${formatRosterCount(activeCount, 'active')} · ${formatRosterCount(
          spectatorCount,
          'spectator',
        )} observing`
      : formatRosterCount(activeCount, 'active');
  const statusCopy = hasSubmissionTracking
    ? pendingCount > 0
      ? `${pendingCount} still drafting. Powers awaiting a decision are listed first.`
      : 'All required powers have submitted for this phase.'
    : 'Check who is seated, who is observing, and who is running the room.';

  return (
    <div
      id={panelId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        'pointer-events-auto overflow-hidden rounded-[1.8rem] border border-[color:color-mix(in_oklab,var(--border)_74%,var(--accent-brass)_26%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--paper)_90%,white_10%)_0%,color-mix(in_oklab,var(--paper-strong)_88%,var(--accent-brass)_12%)_100%)] p-4 text-foreground shadow-[0_20px_52px_rgba(66,48,24,0.22)]',
        mobile
          ? 'w-full rounded-b-[1.8rem] rounded-t-none border-x-0 border-t-0 px-4 pb-4 pt-3 shadow-[0_18px_38px_rgba(66,48,24,0.18)]'
          : 'w-[24rem] max-w-[calc(100vw-2rem)]',
      )}
    >
      {mobile ? (
        <div
          aria-hidden="true"
          className="mb-3 h-px w-full bg-[linear-gradient(90deg,transparent_0%,color-mix(in_oklab,var(--accent-brass)_36%,var(--paper-shadow)_64%)_18%,color-mix(in_oklab,var(--accent-oxblood)_28%,var(--paper-shadow)_72%)_50%,color-mix(in_oklab,var(--accent-brass)_36%,var(--paper-shadow)_64%)_82%,transparent_100%)]"
        />
      ) : null}
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] pb-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--accent-oxblood)]">
            Field Dossier
          </div>
          <h2
            id={titleId}
            className="mt-1 font-display text-[1.4rem] leading-none text-[color:var(--ink-strong)]"
          >
            Players
          </h2>
          <p className="mt-2 text-sm text-[color:var(--ink-soft)]">
            {subtitle}
          </p>
        </div>
        <Button
          ref={closeButtonRef}
          type="button"
          variant="ghost"
          size="icon"
          data-players-window-close
          className="-mr-2 -mt-1 h-10 w-10 rounded-full border border-[color:color-mix(in_oklab,var(--border)_76%,white_24%)] bg-[color:color-mix(in_oklab,var(--paper)_72%,white_28%)] text-[color:var(--ink-soft)] hover:bg-[color:color-mix(in_oklab,var(--paper)_62%,white_38%)] hover:text-[color:var(--ink-strong)] focus-visible:bg-[color:color-mix(in_oklab,var(--paper)_62%,white_38%)] focus-visible:text-[color:var(--ink-strong)]"
          aria-label="Close player roster"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="space-y-4">
        <div
          id={descriptionId}
          className="rounded-[1.25rem] border border-[color:color-mix(in_oklab,var(--border)_74%,var(--accent-brass)_26%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--paper)_76%,white_24%)_0%,color-mix(in_oklab,var(--paper-strong)_84%,var(--accent-brass)_16%)_100%)] px-3.5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <PlayersWindowBadge
              label={formatRosterCount(activeCount, 'active')}
            />
            {spectatorCount > 0 ? (
              <PlayersWindowBadge
                label={formatRosterCount(spectatorCount, 'spectator')}
              />
            ) : null}
            {hasSubmissionTracking ? (
              pendingCount > 0 ? (
                <PlayersWindowBadge
                  label={formatRosterCount(pendingCount, 'pending', 'pending')}
                  tone="warning"
                />
              ) : (
                <PlayersWindowBadge label="All submitted" tone="success" />
              )
            ) : null}
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[color:var(--ink-soft)]">
            {statusCopy}
          </p>
        </div>
        {hasSubmissionTracking ? (
          <>
            <PlayersWindowSection
              title="Awaiting This Phase"
              subtitle={
                pendingCount > 0
                  ? formatRosterCount(pendingCount, 'pending', 'pending')
                  : undefined
              }
              players={pendingPlayers}
              tone="warning"
              onMessagePlayer={onMessagePlayer}
              onInspectBot={onInspectBot}
            />
            <PlayersWindowSection
              title="Submitted"
              subtitle={
                submittedCount > 0
                  ? formatRosterCount(submittedCount, 'ready', 'ready')
                  : undefined
              }
              players={submittedPlayers}
              tone="success"
              onMessagePlayer={onMessagePlayer}
              onInspectBot={onInspectBot}
            />
            <PlayersWindowSection
              title="Standing By"
              subtitle={
                standbyCount > 0
                  ? `${formatRosterCount(standbyCount, 'power')} without orders`
                  : undefined
              }
              players={standbyPlayers}
              onMessagePlayer={onMessagePlayer}
              onInspectBot={onInspectBot}
            />
          </>
        ) : (
          <PlayersWindowSection
            title="Active Powers"
            subtitle={`${formatRosterCount(activeCount, 'power')} in play`}
            players={activePlayers}
            onMessagePlayer={onMessagePlayer}
            onInspectBot={onInspectBot}
          />
        )}
        <PlayersWindowSection
          title="Spectators"
          subtitle={
            spectatorCount > 0
              ? `${formatRosterCount(spectatorCount, 'spectator')} observing`
              : undefined
          }
          players={spectators}
        />
      </div>
    </div>
  );
}

function PlayersWindowLayer({
  isOpen,
  onClose,
  panelRef,
  playersWindowSections,
  panelId,
  titleId,
  descriptionId,
  closeButtonRef,
  onMessagePlayer,
  onInspectBot,
}: {
  isOpen: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
  playersWindowSections: PlayersWindowSections;
  panelId: string;
  titleId: string;
  descriptionId: string;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onMessagePlayer?: (playerId: string) => void;
  onInspectBot?: (playerId: string) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div ref={panelRef}>
      <div className="pointer-events-none absolute right-0 top-[calc(100%+0.75rem)] z-30 hidden sm:block">
        <PlayersWindowCard
          onClose={onClose}
          playersWindowSections={playersWindowSections}
          panelId={panelId}
          titleId={titleId}
          descriptionId={descriptionId}
          closeButtonRef={closeButtonRef}
          onMessagePlayer={onMessagePlayer}
          onInspectBot={onInspectBot}
        />
      </div>
      <button
        type="button"
        aria-label="Close player roster"
        className="fixed inset-0 z-30 bg-[color:color-mix(in_oklab,var(--accent-navy)_18%,transparent)] sm:hidden"
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 sm:hidden">
        <div className="px-0 pt-20">
          <div className="max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain">
            <PlayersWindowCard
              mobile
              onClose={onClose}
              playersWindowSections={playersWindowSections}
              panelId={panelId}
              titleId={titleId}
              descriptionId={descriptionId}
              closeButtonRef={closeButtonRef}
              onMessagePlayer={onMessagePlayer}
              onInspectBot={onInspectBot}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const WorkspaceHeader = memo(function WorkspaceHeader({
  roomName,
  roomCode,
  bannerMeta,
  buildStatusChip,
  submissionStatusChip,
  unreadThreadCount,
  isMessagesOpen,
  isPlayersWindowOpen,
  playersWindowSections,
  onMessagePlayer,
  onInspectBot,
  onToggleMessages,
  onClosePlayersWindow,
  onTogglePlayersWindow,
}: {
  roomName: string;
  roomCode: string;
  bannerMeta: ReactNode;
  buildStatusChip: HeaderStatusChipData | null;
  submissionStatusChip: HeaderStatusChipData | null;
  unreadThreadCount: number;
  isMessagesOpen: boolean;
  isPlayersWindowOpen: boolean;
  playersWindowSections: PlayersWindowSections;
  onMessagePlayer: (playerId: string) => void;
  onInspectBot?: (playerId: string) => void;
  onToggleMessages: () => void;
  onClosePlayersWindow: () => void;
  onTogglePlayersWindow: () => void;
}) {
  const playersButtonRef = useRef<HTMLButtonElement | null>(null);
  const playersWindowRef = useRef<HTMLDivElement | null>(null);
  const playersWindowCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const playersWindowPanelId = useId();
  const playersWindowTitleId = useId();
  const playersWindowDescriptionId = useId();
  const { activeCount, pendingCount, hasSubmissionTracking } =
    getPlayersWindowMetrics(playersWindowSections);
  const playersButtonSummary = hasSubmissionTracking
    ? pendingCount > 0
      ? formatRosterCount(pendingCount, 'pending', 'pending')
      : 'All submitted'
    : formatRosterCount(activeCount, 'active');
  const playersButtonStatusTone =
    hasSubmissionTracking && pendingCount > 0
      ? 'border-[color:color-mix(in_oklab,var(--accent-brass)_58%,white_42%)] bg-[color:color-mix(in_oklab,var(--accent-brass)_18%,transparent)] text-[color:var(--paper)]'
      : 'border-white/10 bg-white/[0.08] text-white/82';
  const wasPlayersWindowOpenRef = useRef(false);

  useEffect(() => {
    if (!isPlayersWindowOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        playersButtonRef.current?.contains(target) ||
        playersWindowRef.current?.contains(target)
      ) {
        return;
      }

      onClosePlayersWindow();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClosePlayersWindow();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlayersWindowOpen, onClosePlayersWindow]);

  useEffect(() => {
    if (isPlayersWindowOpen) {
      const frame = requestAnimationFrame(() => {
        playersWindowCloseButtonRef.current?.focus();
      });

      wasPlayersWindowOpenRef.current = true;
      return () => cancelAnimationFrame(frame);
    }

    if (wasPlayersWindowOpenRef.current) {
      playersButtonRef.current?.focus();
      wasPlayersWindowOpenRef.current = false;
    }
  }, [isPlayersWindowOpen]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 border-b border-black/10 bg-[#111827]/78 text-white backdrop-blur-md">
      <div className="pointer-events-auto relative flex min-h-12 items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex md:gap-3">
          <Link
            to="/"
            className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-white/55 transition hover:text-white"
          >
            Back
          </Link>
          <div className="h-4 w-px shrink-0 bg-white/15" />
          <h1 className="truncate text-sm font-semibold">{roomName}</h1>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 font-mono text-[10px] tracking-[0.18em] text-white/75">
            {roomCode}
          </span>
        </div>
        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 text-base font-medium text-white/82 md:block">
          <span>{bannerMeta}</span>
        </div>
        <div className="flex flex-1 items-center justify-end gap-1.5 md:flex-none md:gap-2">
          <Button
            type="button"
            variant="ghost"
            aria-pressed={isMessagesOpen}
            aria-label={isMessagesOpen ? 'Hide messages' : 'Show messages'}
            onClick={onToggleMessages}
            className={cn(
              'h-9 min-w-0 flex-1 justify-center gap-1.5 rounded-full border px-2 text-left shadow-sm transition duration-200 ease-out hover:bg-white/[0.14] hover:text-white focus-visible:bg-white/[0.14] focus-visible:text-white md:h-11 md:min-w-[7.25rem] md:flex-initial md:justify-start md:gap-2.5 md:px-3',
              isMessagesOpen
                ? 'border-[color:var(--accent-brass)] bg-[color:color-mix(in_oklab,var(--accent-brass)_24%,white_6%)] text-white'
                : 'border-white/10 bg-white/[0.08] text-white/82',
            )}
          >
            <MessageSquare className="size-4 shrink-0" />
            <span className="text-sm font-semibold text-white md:hidden">
              {unreadThreadCount}
            </span>
            <span className="hidden min-w-0 flex-1 md:block">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                Messages
              </span>
              <span className="block text-sm font-semibold leading-tight text-white">
                {unreadThreadCount > 0 ? unreadThreadCount : 'Open'}
                <span className="ml-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/72">
                  {unreadThreadCount === 1
                    ? 'unread'
                    : unreadThreadCount > 1
                      ? 'unread'
                      : 'panel'}
                </span>
              </span>
            </span>
          </Button>
          <Button
            ref={playersButtonRef}
            type="button"
            variant="ghost"
            aria-controls={playersWindowPanelId}
            aria-expanded={isPlayersWindowOpen}
            aria-haspopup="dialog"
            aria-label={
              isPlayersWindowOpen ? 'Hide player roster' : 'Show player roster'
            }
            onClick={onTogglePlayersWindow}
            className={cn(
              'h-9 min-w-0 flex-1 justify-center gap-1.5 rounded-full border px-2 text-left shadow-sm transition duration-200 ease-out hover:bg-white/[0.14] hover:text-white focus-visible:bg-white/[0.14] focus-visible:text-white md:h-11 md:min-w-[7.25rem] md:flex-initial md:justify-start md:gap-2.5 md:px-3',
              playersButtonStatusTone,
              isPlayersWindowOpen &&
                'border-[color:var(--accent-brass)] bg-[color:color-mix(in_oklab,var(--accent-brass)_24%,white_6%)] text-white',
            )}
          >
            <Users className="size-4 shrink-0" />
            <span className="text-sm font-semibold text-white md:hidden">
              {activeCount}
            </span>
            <span className="hidden min-w-0 flex-1 md:block">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                Players
              </span>
              <span className="block text-sm font-semibold leading-tight text-white">
                {activeCount}
                <span className="ml-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/72">
                  active
                </span>
              </span>
            </span>
            <span className="hidden rounded-full border border-white/12 bg-white/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/86 sm:inline-flex">
              {playersButtonSummary}
            </span>
          </Button>
          {buildStatusChip ? (
            <HeaderStatusChip {...buildStatusChip} compact />
          ) : null}
          {submissionStatusChip ? (
            <HeaderStatusChip {...submissionStatusChip} compact />
          ) : null}
        </div>
        <PlayersWindowLayer
          isOpen={isPlayersWindowOpen}
          onClose={onClosePlayersWindow}
          panelRef={playersWindowRef}
          playersWindowSections={playersWindowSections}
          panelId={playersWindowPanelId}
          titleId={playersWindowTitleId}
          descriptionId={playersWindowDescriptionId}
          closeButtonRef={playersWindowCloseButtonRef}
          onMessagePlayer={onMessagePlayer}
          onInspectBot={onInspectBot}
        />
      </div>
      <div className="pointer-events-auto border-t border-white/10 px-3 py-1.5 text-center text-[15px] font-medium text-white/82 md:hidden sm:px-4">
        <div>{bannerMeta}</div>
      </div>
    </div>
  );
});

export const ToolbarDock = memo(function ToolbarDock({
  toolbarGroups,
}: {
  toolbarGroups: ToolbarAction[][];
}) {
  return (
    <>
      <div className="pointer-events-none absolute left-4 top-16 bottom-4 z-20 hidden items-center sm:flex">
        <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-[1.75rem] border border-black/10 bg-white/76 p-2 shadow-xl backdrop-blur-md">
          {toolbarGroups.map((group, index) => (
            <div
              key={`desktop-group-${index}`}
              className="flex flex-col items-center gap-2"
            >
              {index > 0 ? <div className="mb-1 h-px w-8 bg-black/10" /> : null}
              {group.map((action) => (
                <ToolbarButton key={action.id} action={action} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-4 z-20 sm:hidden">
        <div className="pointer-events-auto rounded-[1.75rem] border border-black/10 bg-white/82 shadow-xl backdrop-blur-md">
          <div className="overflow-x-auto overflow-y-visible">
            <div className="flex min-w-max justify-center px-2 py-2">
              {toolbarGroups.map((group, index) => (
                <div
                  key={`mobile-group-${index}`}
                  className="flex shrink-0 items-center gap-2"
                >
                  {index > 0 ? (
                    <div className="mx-1 h-8 w-px bg-black/10" />
                  ) : null}
                  {group.map((action) => (
                    <ToolbarButton key={action.id} action={action} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

export const WorkspaceFlyoutLayer = memo(function WorkspaceFlyoutLayer({
  flyout,
  onClose,
}: {
  flyout: FlyoutContent | null;
  onClose: () => void;
}) {
  if (!flyout) {
    return null;
  }

  return (
    <>
      <div className="pointer-events-none absolute left-20 top-16 bottom-4 z-20 hidden items-center sm:flex">
        <div className="max-h-[calc(100vh-6rem)] overflow-y-auto">
          <FlyoutCard
            title={flyout.title}
            subtitle={flyout.subtitle}
            onClose={onClose}
          >
            {flyout.body}
          </FlyoutCard>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-20 z-20 sm:hidden">
        <div className="max-h-[45vh] overflow-y-auto">
          <FlyoutCard
            title={flyout.title}
            subtitle={flyout.subtitle}
            mobile
            onClose={onClose}
          >
            {flyout.body}
          </FlyoutCard>
        </div>
      </div>
    </>
  );
});
