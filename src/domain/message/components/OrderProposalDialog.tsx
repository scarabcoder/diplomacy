import { useEffect, useMemo, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { ReplayMap } from '@/domain/game/components/phase-replay/ReplayMap.tsx';
import { proposalToReplayInputs } from '@/domain/game/components/phase-replay/proposalAdapters.ts';
import {
  describeBuildOrder,
  describeMainOrder,
  describeRetreatOrder,
  type BuildOrderDraft,
  type MainOrderDraft,
  type RetreatOrderDraft,
} from '@/domain/game/engine/order-drafting.ts';
import type {
  SupplyCenterOwnership,
  UnitPositions,
} from '@/domain/game/engine/types.ts';
import type { OrderProposalPayload } from '@/domain/message/schema.ts';

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

export function OrderProposalDialog({
  proposal,
  messageId,
  senderLabel,
  onClose,
}: {
  proposal: OrderProposalPayload;
  messageId: string;
  senderLabel: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const positions = proposal.boardBefore.positions as UnitPositions;
  const supplyCenters = proposal.boardBefore
    .supplyCenters as SupplyCenterOwnership;

  const { annotations, movingUnits } = useMemo(
    () => proposalToReplayInputs(proposal),
    [proposal],
  );

  const lines = useMemo(
    () => orderLines(proposal, positions),
    [proposal, positions],
  );

  const heading = `${seasonLabel(proposal.season)} ${proposal.year} · ${phaseLabel(proposal.phase)}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch bg-[color:color-mix(in_oklab,var(--accent-navy)_28%,transparent)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      <button
        type="button"
        aria-label="Close proposal"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative mx-auto my-auto flex h-[min(92vh,54rem)] w-[min(96vw,76rem)] flex-col overflow-hidden rounded-[1.8rem] border border-black/10 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--paper)_94%,white_6%)_0%,color-mix(in_oklab,var(--paper-strong)_88%,var(--accent-brass)_12%)_100%)] shadow-[0_24px_60px_rgba(66,48,24,0.32)]">
        <div className="flex items-start justify-between gap-4 border-b border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--accent-oxblood)]">
              Order Proposal
            </div>
            <h2 className="mt-1 font-display text-xl text-[color:var(--ink-strong)]">
              {heading}
            </h2>
            <div className="mt-1 text-sm text-[color:var(--ink-soft)]">
              From {senderLabel}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border border-[color:color-mix(in_oklab,var(--border)_76%,white_24%)] bg-[color:color-mix(in_oklab,var(--paper)_72%,white_28%)] text-[color:var(--ink-soft)] hover:bg-[color:color-mix(in_oklab,var(--paper)_62%,white_38%)] hover:text-[color:var(--ink-strong)]"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
          <div className="relative min-h-[24rem] overflow-hidden md:min-h-0">
            <ReplayMap
              resetKey={messageId}
              positions={positions}
              supplyCenters={supplyCenters}
              annotations={annotations}
              movingUnits={movingUnits}
              dislodgedUnits={proposal.boardBefore.dislodgedUnits}
            />
          </div>
          <div className="flex min-h-0 flex-col overflow-y-auto border-t border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] px-4 py-4 md:border-l md:border-t-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink-soft)]">
              Proposed orders
            </div>
            <ul className="mt-3 space-y-2 font-mono text-sm leading-5 text-[color:var(--ink-strong)]">
              {lines.map((line, index) => (
                <li
                  key={index}
                  className="rounded-[0.9rem] border border-black/10 bg-white/72 px-3 py-2"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
