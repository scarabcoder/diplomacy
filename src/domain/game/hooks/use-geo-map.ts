import { useMemo } from 'react';
import { geoConicConformal, geoPath } from 'd3-geo';
import type { GeoPath, GeoPermissibleObjects, GeoProjection } from 'd3-geo';
import type { Feature, Polygon } from 'geojson';
import {
  DIPLOMACY_GEO,
  type ProvinceGeoProperties,
} from '@/domain/game/engine/map-geo.ts';

interface UseGeoMapOptions {
  width: number;
  height: number;
  padding?: number;
}

interface GeoMapResult {
  features: Feature<Polygon, ProvinceGeoProperties>[];
  pathGenerator: GeoPath<unknown, GeoPermissibleObjects>;
  projection: GeoProjection;
}

export function useGeoMap({
  width,
  height,
  padding = 20,
}: UseGeoMapOptions): GeoMapResult {
  return useMemo(() => {
    // The Diplomacy board covers Europe and the Mediterranean, so a Europe-tuned
    // conic projection preserves the board's width far better than Mercator.
    const proj = geoConicConformal()
      .parallels([35, 65])
      .rotate([-15, 0])
      .center([0, 50]);

    proj.fitExtent(
      [
        [padding, padding],
        [width - padding, height - padding],
      ],
      DIPLOMACY_GEO,
    );

    const pathGen = geoPath().projection(proj);

    return {
      features: DIPLOMACY_GEO.features,
      pathGenerator: pathGen,
      projection: proj,
    };
  }, [width, height, padding]);
}
