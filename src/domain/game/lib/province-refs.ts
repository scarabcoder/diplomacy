export function getBaseProvince(provinceRef: string): string {
  const slashIndex = provinceRef.indexOf('/');
  return slashIndex === -1 ? provinceRef : provinceRef.substring(0, slashIndex);
}

export function getCoast(provinceRef: string): string | null {
  const slashIndex = provinceRef.indexOf('/');
  return slashIndex === -1 ? null : provinceRef.substring(slashIndex + 1);
}

export function resolveProvinceTargetClick(
  validTargets: string[],
  provinceRef: string,
): string | null {
  if (validTargets.includes(provinceRef)) {
    return provinceRef;
  }

  const baseProvince = getBaseProvince(provinceRef);
  if (validTargets.includes(baseProvince)) {
    return baseProvince;
  }

  const matchingTargets = validTargets.filter(
    (target) => getBaseProvince(target) === baseProvince,
  );

  if (matchingTargets.length === 1) {
    return matchingTargets[0] ?? null;
  }

  return null;
}
