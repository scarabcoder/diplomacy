import {
  getBuildAnnotations,
  getMainOrderAnnotations,
  getRetreatAnnotations,
  type BuildOrderDraft,
  type MainOrderDraft,
  type OrderAnnotation,
  type RetreatOrderDraft,
} from '@/domain/game/engine/order-drafting.ts';
import type { UnitPositions } from '@/domain/game/engine/types.ts';
import type { OrderProposalPayload } from '@/domain/message/schema.ts';
import type { ReplayMovingUnit } from './useLoopingReplay.ts';

/**
 * Convert a stored OrderProposalPayload into the annotations + moving-unit
 * tuples that ReplayMap expects.
 */
export function proposalToReplayInputs(proposal: OrderProposalPayload): {
  annotations: OrderAnnotation[];
  movingUnits: ReplayMovingUnit[];
} {
  const positions = proposal.boardBefore.positions as UnitPositions;
  let annotations: OrderAnnotation[] = [];

  if (proposal.phase === 'order_submission') {
    const drafts: Record<string, MainOrderDraft> = {};
    for (const order of proposal.orders) {
      if ('orderType' in order) {
        drafts[order.unitProvince] = {
          unitProvince: order.unitProvince,
          orderType: order.orderType,
          targetProvince: order.targetProvince,
          supportedUnitProvince: order.supportedUnitProvince,
          viaConvoy: order.viaConvoy,
        };
      }
    }
    annotations = getMainOrderAnnotations(drafts, positions);
  } else if (proposal.phase === 'retreat_submission') {
    const drafts: Record<string, RetreatOrderDraft> = {};
    for (const order of proposal.orders) {
      if ('retreatTo' in order) {
        drafts[order.unitProvince] = {
          unitProvince: order.unitProvince,
          retreatTo: order.retreatTo,
        };
      }
    }
    annotations = getRetreatAnnotations(drafts, positions);
  } else if (proposal.phase === 'build_submission') {
    const drafts: BuildOrderDraft[] = [];
    for (const order of proposal.orders) {
      if ('action' in order) {
        drafts.push({
          action: order.action,
          province: order.province,
          unitType: order.unitType,
          coast: order.coast,
        });
      }
    }
    annotations = getBuildAnnotations(drafts, positions);
  }

  const movingUnits: ReplayMovingUnit[] = annotations
    .filter(
      (
        annotation,
      ): annotation is OrderAnnotation & {
        to: string;
        power: NonNullable<OrderAnnotation['power']>;
        unitType: NonNullable<OrderAnnotation['unitType']>;
      } =>
        (annotation.kind === 'move' || annotation.kind === 'retreat') &&
        Boolean(annotation.to) &&
        Boolean(annotation.power) &&
        Boolean(annotation.unitType),
    )
    .map((annotation) => ({
      id: annotation.id,
      from: annotation.from,
      to: annotation.to,
      power: annotation.power,
      unitType: annotation.unitType,
    }));

  return { annotations, movingUnits };
}
