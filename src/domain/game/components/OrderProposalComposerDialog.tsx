import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { orpcUtils } from '@/rpc/react.ts';
import { PROVINCES } from '@/domain/game/engine/map-data.ts';
import {
  canSupportHold,
  describeMainOrder,
  describeProvinceRef,
  getConvoyMoveTargets,
  getMoveTargets,
  getSupportMoveTargets,
  getSupportableUnitProvinces,
  getMainOrderAnnotations,
  type MainOrderDraft,
} from '@/domain/game/engine/order-drafting.ts';
import type {
  DislodgedUnit,
  SupplyCenterOwnership,
  UnitPositions,
} from '@/domain/game/engine/types.ts';
import { PowerName } from '@/domain/game/power-presentation.tsx';
import type { OrderProposalPayload } from '@/domain/message/schema.ts';
import type { MainSubmissionRecord } from '@/domain/game/lib/submission-records.ts';
import { DiplomacyMap } from './DiplomacyMap.tsx';

type Season = 'spring' | 'fall';
type ProposalPhase = OrderProposalPayload['phase'];

type ComposerTurn = {
  id: string;
  turnNumber: number;
  year: number;
  season: Season;
  phase: ProposalPhase;
  unitPositions: UnitPositions;
  supplyCenters: SupplyCenterOwnership;
  dislodgedUnits: DislodgedUnit[];
};

type Interaction =
  | { kind: 'idle' }
  | { kind: 'unit'; province: string }
  | { kind: 'move'; province: string; viaConvoy: boolean }
  | { kind: 'support-unit'; province: string }
  | {
      kind: 'support-target';
      province: string;
      supportedUnitProvince: string;
    }
  | { kind: 'convoy-army'; province: string }
  | {
      kind: 'convoy-target';
      province: string;
      supportedUnitProvince: string;
    };

type DraftMap = Record<string, MainOrderDraft>;

export function OrderProposalComposerDialog({
  roomId,
  threadId,
  turn,
  onClose,
  onSent,
}: {
  roomId: string;
  threadId: string;
  turn: ComposerTurn;
  onClose: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState('');
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [interaction, setInteraction] = useState<Interaction>({ kind: 'idle' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sendMutation = useMutation(
    orpcUtils.message.sendOrderProposal.mutationOptions({
      onSuccess: () => {
        onSent();
      },
      onError: (error: unknown) => {
        const message =
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message: string }).message)
            : 'Failed to send proposal';
        setErrorMessage(message);
      },
    }),
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (interaction.kind !== 'idle') {
          setInteraction({ kind: 'idle' });
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interaction.kind, onClose]);

  const supportedPhase = turn.phase === 'order_submission';

  const annotations = useMemo(
    () => getMainOrderAnnotations(drafts, turn.unitPositions),
    [drafts, turn.unitPositions],
  );

  const selectedProvince =
    interaction.kind === 'unit' ||
    interaction.kind === 'move' ||
    interaction.kind === 'support-unit' ||
    interaction.kind === 'support-target' ||
    interaction.kind === 'convoy-army' ||
    interaction.kind === 'convoy-target'
      ? interaction.province
      : null;

  const validTargets = useMemo<string[]>(() => {
    if (!supportedPhase) return [];
    if (interaction.kind === 'move') {
      return interaction.viaConvoy
        ? getConvoyMoveTargets(interaction.province, turn.unitPositions)
        : getMoveTargets(interaction.province, turn.unitPositions);
    }
    if (interaction.kind === 'support-target') {
      return [
        ...getSupportMoveTargets(
          interaction.province,
          interaction.supportedUnitProvince,
          turn.unitPositions,
        ),
        interaction.supportedUnitProvince,
      ];
    }
    if (interaction.kind === 'convoy-target') {
      return getConvoyMoveTargets(
        interaction.supportedUnitProvince,
        turn.unitPositions,
      );
    }
    return [];
  }, [interaction, supportedPhase, turn.unitPositions]);

  const highlightedUnitProvinces = useMemo<string[]>(() => {
    if (interaction.kind === 'support-unit') {
      return getSupportableUnitProvinces(
        interaction.province,
        turn.unitPositions,
      );
    }
    if (interaction.kind === 'convoy-army') {
      return Object.entries(turn.unitPositions)
        .filter(([, unit]) => unit.unitType === 'army')
        .filter(([province]) => province !== interaction.province)
        .map(([province]) => province);
    }
    return [];
  }, [interaction, turn.unitPositions]);

  const setDraft = useCallback((province: string, draft: MainOrderDraft) => {
    setDrafts((current) => ({ ...current, [province]: draft }));
  }, []);

  const handleUnitClick = useCallback(
    (provinceId: string) => {
      if (!supportedPhase) return;
      const unit = turn.unitPositions[provinceId];
      if (!unit) return;

      if (interaction.kind === 'support-unit') {
        const supportable = getSupportableUnitProvinces(
          interaction.province,
          turn.unitPositions,
        );
        if (
          provinceId !== interaction.province &&
          supportable.includes(provinceId)
        ) {
          setInteraction({
            kind: 'support-target',
            province: interaction.province,
            supportedUnitProvince: provinceId,
          });
          return;
        }
      }

      if (interaction.kind === 'convoy-army') {
        if (
          provinceId !== interaction.province &&
          turn.unitPositions[provinceId]?.unitType === 'army'
        ) {
          setInteraction({
            kind: 'convoy-target',
            province: interaction.province,
            supportedUnitProvince: provinceId,
          });
          return;
        }
      }

      setInteraction({ kind: 'unit', province: provinceId });
    },
    [interaction, supportedPhase, turn.unitPositions],
  );

  const handleProvinceClick = useCallback(
    (provinceId: string) => {
      if (!supportedPhase) return;

      if (interaction.kind === 'move') {
        if (validTargets.includes(provinceId)) {
          setDraft(interaction.province, {
            unitProvince: interaction.province,
            orderType: 'move',
            targetProvince: provinceId,
            supportedUnitProvince: null,
            viaConvoy: interaction.viaConvoy,
          });
          setInteraction({ kind: 'idle' });
          return;
        }
      }

      if (interaction.kind === 'support-target') {
        if (provinceId === interaction.supportedUnitProvince) {
          if (
            canSupportHold(
              interaction.province,
              interaction.supportedUnitProvince,
              turn.unitPositions,
            )
          ) {
            setDraft(interaction.province, {
              unitProvince: interaction.province,
              orderType: 'support',
              targetProvince: null,
              supportedUnitProvince: interaction.supportedUnitProvince,
              viaConvoy: false,
            });
            setInteraction({ kind: 'idle' });
            return;
          }
        } else if (validTargets.includes(provinceId)) {
          setDraft(interaction.province, {
            unitProvince: interaction.province,
            orderType: 'support',
            targetProvince: provinceId,
            supportedUnitProvince: interaction.supportedUnitProvince,
            viaConvoy: false,
          });
          setInteraction({ kind: 'idle' });
          return;
        }
      }

      if (interaction.kind === 'convoy-target') {
        if (validTargets.includes(provinceId)) {
          setDraft(interaction.province, {
            unitProvince: interaction.province,
            orderType: 'convoy',
            targetProvince: provinceId,
            supportedUnitProvince: interaction.supportedUnitProvince,
            viaConvoy: false,
          });
          setInteraction({ kind: 'idle' });
          return;
        }
      }

      if (turn.unitPositions[provinceId]) {
        handleUnitClick(provinceId);
      }
    },
    [
      handleUnitClick,
      interaction,
      setDraft,
      supportedPhase,
      turn.unitPositions,
      validTargets,
    ],
  );

  const handleChooseOrderType = (
    type: 'hold' | 'move' | 'support' | 'convoy',
    viaConvoy = false,
  ) => {
    if (interaction.kind !== 'unit') return;
    const province = interaction.province;

    if (type === 'hold') {
      setDraft(province, {
        unitProvince: province,
        orderType: 'hold',
        targetProvince: null,
        supportedUnitProvince: null,
        viaConvoy: false,
      });
      setInteraction({ kind: 'idle' });
      return;
    }

    if (type === 'move') {
      setInteraction({ kind: 'move', province, viaConvoy });
      return;
    }

    if (type === 'support') {
      setInteraction({ kind: 'support-unit', province });
      return;
    }

    if (type === 'convoy') {
      setInteraction({ kind: 'convoy-army', province });
      return;
    }
  };

  const handleRemoveDraft = (province: string) => {
    setDrafts((current) => {
      const { [province]: _removed, ...rest } = current;
      return rest;
    });
  };

  const handleSubmit = async () => {
    if (Object.keys(drafts).length === 0 || !supportedPhase) return;
    setErrorMessage(null);

    const orders: MainSubmissionRecord[] = Object.values(drafts);
    const proposal: OrderProposalPayload = {
      version: 1,
      turnId: turn.id,
      turnNumber: turn.turnNumber,
      year: turn.year,
      season: turn.season,
      phase: 'order_submission',
      orders,
      boardBefore: {
        positions: turn.unitPositions,
        supplyCenters: turn.supplyCenters,
        dislodgedUnits: turn.dislodgedUnits,
      },
    };

    await sendMutation.mutateAsync({
      roomId,
      threadId,
      body: body.trim().length > 0 ? body.trim() : 'Proposed orders',
      proposal,
    });
  };

  const interactionStatus = describeInteraction(interaction);

  const selectedUnit = selectedProvince
    ? turn.unitPositions[selectedProvince]
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch bg-[color:color-mix(in_oklab,var(--accent-navy)_28%,transparent)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      <button
        type="button"
        aria-label="Close composer"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative mx-auto my-auto flex h-[min(94vh,58rem)] w-[min(98vw,82rem)] flex-col overflow-hidden rounded-[1.8rem] border border-black/10 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--paper)_94%,white_6%)_0%,color-mix(in_oklab,var(--paper-strong)_88%,var(--accent-brass)_12%)_100%)] shadow-[0_24px_60px_rgba(66,48,24,0.32)]">
        <div className="flex items-start justify-between gap-4 border-b border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--accent-oxblood)]">
              New Order Proposal
            </div>
            <h2 className="mt-1 font-display text-xl text-[color:var(--ink-strong)]">
              {turn.season === 'spring' ? 'Spring' : 'Fall'} {turn.year}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--ink-soft)]">
              {supportedPhase
                ? 'Click any unit on the map — yours or another power’s — to assign an order for the proposal.'
                : 'Order proposals can only be composed during the main order phase for now.'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border border-[color:color-mix(in_oklab,var(--border)_76%,white_24%)] bg-[color:color-mix(in_oklab,var(--paper)_72%,white_28%)] text-[color:var(--ink-soft)] hover:bg-[color:color-mix(in_oklab,var(--paper)_62%,white_38%)] hover:text-[color:var(--ink-strong)]"
            aria-label="Close composer"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.9fr)]">
          <div className="relative min-h-[24rem] overflow-hidden md:min-h-0">
            <DiplomacyMap
              positions={turn.unitPositions}
              supplyCenters={turn.supplyCenters}
              annotations={annotations}
              selectedUnitProvince={selectedProvince}
              validTargets={validTargets}
              highlightedUnitProvinces={highlightedUnitProvinces}
              onUnitClick={handleUnitClick}
              onProvinceClick={handleProvinceClick}
            />
          </div>
          <div className="flex min-h-0 flex-col border-t border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] md:border-l md:border-t-0">
            <div className="border-b border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink-soft)]">
                {interaction.kind === 'idle' ? 'Choose a unit' : 'Action'}
              </div>
              <div className="mt-1 text-sm font-semibold text-[color:var(--ink-strong)]">
                {interactionStatus}
              </div>
              {interaction.kind === 'unit' && selectedUnit ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs"
                    onClick={() => handleChooseOrderType('hold')}
                  >
                    Hold
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs"
                    onClick={() => handleChooseOrderType('move')}
                  >
                    Move
                  </Button>
                  {selectedUnit.unitType === 'army' &&
                  getConvoyMoveTargets(interaction.province, turn.unitPositions)
                    .length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs"
                      onClick={() => handleChooseOrderType('move', true)}
                    >
                      Move via convoy
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full text-xs"
                    onClick={() => handleChooseOrderType('support')}
                  >
                    Support
                  </Button>
                  {selectedUnit.unitType === 'fleet' &&
                  PROVINCES[interaction.province]?.type === 'water' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full text-xs"
                      onClick={() => handleChooseOrderType('convoy')}
                    >
                      Convoy
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-xs"
                    onClick={() => setInteraction({ kind: 'idle' })}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
              {interaction.kind !== 'idle' && interaction.kind !== 'unit' ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-xs"
                    onClick={() => setInteraction({ kind: 'idle' })}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ink-soft)]">
                Draft ({Object.keys(drafts).length})
              </div>
              {Object.values(drafts).length === 0 ? (
                <div className="mt-3 rounded-[1.15rem] border border-dashed border-black/10 bg-white/60 px-3 py-4 text-xs text-[color:var(--ink-soft)]">
                  No orders yet. Click a unit on the map to propose one.
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {Object.values(drafts).map((draft) => {
                    const unit = turn.unitPositions[draft.unitProvince];
                    return (
                      <li
                        key={draft.unitProvince}
                        className="flex items-start justify-between gap-3 rounded-[1.1rem] border border-black/10 bg-white/72 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          {unit ? (
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink-soft)]">
                              <PowerName
                                className="gap-1.5"
                                flagClassName="h-3 w-4.5"
                                power={unit.power}
                              />
                            </div>
                          ) : null}
                          <div className="mt-1 font-mono text-xs text-[color:var(--ink-strong)]">
                            {describeMainOrder(
                              draft.unitProvince,
                              draft,
                              turn.unitPositions,
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-[color:var(--ink-soft)] hover:text-[color:var(--accent-oxblood)]"
                          aria-label={`Remove ${describeProvinceRef(draft.unitProvince)} order`}
                          onClick={() => handleRemoveDraft(draft.unitProvince)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-[color:color-mix(in_oklab,var(--border)_72%,white_28%)] px-4 py-3">
              <textarea
                className="min-h-20 w-full rounded-[1.1rem] border border-black/10 bg-white/74 px-3.5 py-3 text-sm text-[color:var(--ink-strong)] outline-none placeholder:text-[color:var(--ink-soft)] focus:border-[color:var(--accent-brass)]"
                placeholder="Optional message to accompany the proposal…"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              {errorMessage ? (
                <div className="mt-2 rounded-[0.8rem] border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-900">
                  {errorMessage}
                </div>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-[color:var(--ink-soft)]">
                  {supportedPhase
                    ? 'Proposals are advisory — they do not submit orders.'
                    : 'Return during the order phase to propose orders.'}
                </div>
                <Button
                  type="button"
                  className="h-10 rounded-full text-xs font-semibold uppercase tracking-[0.16em]"
                  disabled={
                    !supportedPhase ||
                    Object.keys(drafts).length === 0 ||
                    sendMutation.isPending
                  }
                  onClick={() => void handleSubmit()}
                >
                  <Send className="size-4" />
                  {sendMutation.isPending ? 'Sending…' : 'Send proposal'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function describeInteraction(interaction: Interaction): string {
  if (interaction.kind === 'idle') {
    return 'Click a unit on the map to start an order.';
  }
  if (interaction.kind === 'unit') {
    return `Selected ${describeProvinceRef(interaction.province)}. Pick an order type.`;
  }
  if (interaction.kind === 'move') {
    return `Choose where ${describeProvinceRef(interaction.province)} should move${interaction.viaConvoy ? ' via convoy' : ''}.`;
  }
  if (interaction.kind === 'support-unit') {
    return `Click the unit that ${describeProvinceRef(interaction.province)} should support.`;
  }
  if (interaction.kind === 'support-target') {
    return `Click where ${describeProvinceRef(interaction.supportedUnitProvince)} is headed — or its own province to support hold.`;
  }
  if (interaction.kind === 'convoy-army') {
    return `Click the army that ${describeProvinceRef(interaction.province)} should convoy.`;
  }
  if (interaction.kind === 'convoy-target') {
    return `Click the destination for ${describeProvinceRef(interaction.supportedUnitProvince)}.`;
  }
  return '';
}
