import { useMemo, type ReactNode } from 'react';
import { Map as MapIcon, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import {
  describeBuildOrder,
  describeMainOrder,
  describeRetreatOrder,
  type BuildOrderDraft,
  type MainOrderDraft,
  type RetreatOrderDraft,
} from '@/domain/game/engine/order-drafting.ts';
import type { UnitPositions } from '@/domain/game/engine/types.ts';
import type { OrderProposalPayload } from '@/domain/message/schema.ts';
import { cn } from '@/lib/utils.ts';

function phaseLabel(phase: OrderProposalPayload['phase']): string {
  if (phase === 'order_submission') return 'Orders';
  if (phase === 'retreat_submission') return 'Retreats';
  return 'Builds';
}

function seasonLabel(season: OrderProposalPayload['season']): string {
  return season === 'spring' ? 'Spring' : 'Fall';
}

function orderLines(
  proposal: OrderProposalPayload,
  positions: UnitPositions,
): string[] {
  if (proposal.phase === 'order_submission') {
    return proposal.orders.map((order) => {
      if (!('orderType' in order)) return '';
      const draft: MainOrderDraft = {
        unitProvince: order.unitProvince,
        orderType: order.orderType,
        targetProvince: order.targetProvince,
        supportedUnitProvince: order.supportedUnitProvince,
        viaConvoy: order.viaConvoy,
      };
      return describeMainOrder(order.unitProvince, draft, positions);
    });
  }
  if (proposal.phase === 'retreat_submission') {
    return proposal.orders.map((order) => {
      if (!('retreatTo' in order)) return '';
      const draft: RetreatOrderDraft = {
        unitProvince: order.unitProvince,
        retreatTo: order.retreatTo,
      };
      return describeRetreatOrder(draft, positions);
    });
  }
  return proposal.orders.map((order) => {
    if (!('action' in order)) return '';
    const draft: BuildOrderDraft = {
      action: order.action,
      province: order.province,
      unitType: order.unitType,
      coast: order.coast,
    };
    return describeBuildOrder(draft);
  });
}

export function ProposalMessageCard({
  proposal,
  body,
  senderLabel,
  timestampLabel,
  isMine,
  onOpen,
}: {
  proposal: OrderProposalPayload;
  body: string;
  senderLabel: ReactNode;
  timestampLabel: string;
  isMine: boolean;
  onOpen: () => void;
}) {
  const lines = useMemo(
    () => orderLines(proposal, proposal.boardBefore.positions as UnitPositions),
    [proposal],
  );

  const subhead = `${seasonLabel(proposal.season)} ${proposal.year} · ${phaseLabel(proposal.phase)} · ${proposal.orders.length} ${proposal.orders.length === 1 ? 'order' : 'orders'}`;

  return (
    <div
      className={cn(
        'rounded-[1.35rem] border px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.64)]',
        isMine
          ? 'ml-6 border-[color:color-mix(in_oklab,var(--accent-navy)_28%,white_72%)] bg-[color:color-mix(in_oklab,var(--accent-navy)_8%,white_92%)]'
          : 'mr-6 border-black/10 bg-white/72',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
          {isMine ? 'You' : senderLabel}
        </div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
          {timestampLabel}
        </div>
      </div>
      {body.trim().length > 0 ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--ink-strong)]">
          {body}
        </p>
      ) : null}
      <div className="mt-3 rounded-[1.1rem] border border-[color:color-mix(in_oklab,var(--accent-brass)_34%,white_66%)] bg-[color:color-mix(in_oklab,var(--accent-brass)_10%,white_90%)] px-3 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--accent-oxblood)]">
          <Sparkles className="size-3.5" />
          Order proposal
        </div>
        <div className="mt-1 text-xs text-[color:var(--ink-soft)]">
          {subhead}
        </div>
        <ul className="mt-2 space-y-1 font-mono text-[12px] leading-5 text-[color:var(--ink-strong)]">
          {lines.slice(0, 4).map((line, index) => (
            <li key={index}>{line}</li>
          ))}
          {lines.length > 4 ? (
            <li className="text-[color:var(--ink-soft)]">
              + {lines.length - 4} more…
            </li>
          ) : null}
        </ul>
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-full text-xs font-semibold uppercase tracking-[0.14em]"
            onClick={onOpen}
          >
            <MapIcon className="size-3.5" />
            View on map
          </Button>
        </div>
      </div>
    </div>
  );
}
