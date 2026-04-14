import { ORPCError } from '@orpc/client';

type ArrayItem<T> = T extends (infer U)[] ? U : never;

export const selectOne = async <
  T extends {
    _: { result: any };
    limit: (arg: any) => any;
  },
>(
  qb: T,
): Promise<ArrayItem<T['_']['result']> | undefined> => {
  const result = await qb.limit(1).execute();
  return result[0] ?? undefined;
};

export const selectOneOrThrow = async <
  T extends {
    _: { result: any };
    limit: (arg: any) => any;
  },
>(
  qb: T,
  message = 'Resource not found',
): Promise<ArrayItem<T['_']['result']>> => {
  const result = await selectOne(qb);
  if (!result) {
    throw new ORPCError('NOT_FOUND', { message });
  }
  return result;
};
