export function findFunctionPaths(
  value: unknown,
  path = 'root',
  seen = new WeakSet<object>(),
): string[] {
  if (typeof value === 'function') {
    return [path];
  }

  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value !== 'object') {
    return [];
  }

  if (value instanceof Date || value instanceof RegExp) {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findFunctionPaths(item, `${path}[${index}]`, seen),
    );
  }

  return Object.entries(value).flatMap(([key, nestedValue]) =>
    findFunctionPaths(nestedValue, `${path}.${key}`, seen),
  );
}
