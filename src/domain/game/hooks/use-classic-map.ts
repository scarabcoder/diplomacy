import { useEffect, useState } from 'react';
import classicMapSvg from '@/domain/game/assets-classic-map.svg?raw';

export interface ClassicMapProvince {
  id: string;
  d: string;
}

export interface ClassicMapCenter {
  x: number;
  y: number;
}

export interface ClassicMapData {
  width: number;
  height: number;
  provinces: ClassicMapProvince[];
  centers: Record<string, ClassicMapCenter>;
}

let cachedClassicMap: ClassicMapData | null = null;

function polygonPointsToPath(points: string): string {
  const segments = points
    .trim()
    .split(/\s+/)
    .map((segment) => segment.split(','))
    .filter((pair) => pair.length === 2);

  if (segments.length === 0) {
    return '';
  }

  return `${segments
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`)
    .join(' ')} Z`;
}

function parseViewBox(viewBox: string | null): { width: number; height: number } {
  const values = viewBox?.split(/\s+/).map(Number) ?? [];
  return {
    width: values[2] ?? 1524,
    height: values[3] ?? 1357,
  };
}

function loadClassicMap(): ClassicMapData {
  if (cachedClassicMap) {
    return cachedClassicMap;
  }

  if (typeof document === 'undefined') {
    throw new Error('Classic map parsing requires a browser environment');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(classicMapSvg, 'image/svg+xml');
  const svg = doc.documentElement;
  const parserError = doc.querySelector('parsererror');

  if (parserError) {
    throw new Error('Failed to parse classic Diplomacy SVG map');
  }

  const provincesGroup = svg.querySelector('#provinces');
  if (!provincesGroup) {
    throw new Error('Classic Diplomacy SVG is missing the provinces layer');
  }

  const provinces = [...provincesGroup.children]
    .map((element) => {
      const id = element.getAttribute('id');
      if (!id) {
        return null;
      }

      if (element.tagName.toLowerCase() === 'path') {
        const d = element.getAttribute('d');
        return d ? { id, d } : null;
      }

      if (element.tagName.toLowerCase() === 'polygon') {
        const points = element.getAttribute('points');
        return points ? { id, d: polygonPointsToPath(points) } : null;
      }

      return null;
    })
    .filter((province): province is ClassicMapProvince => province != null);

  const measuringHost = document.createElement('div');
  measuringHost.style.position = 'absolute';
  measuringHost.style.left = '-10000px';
  measuringHost.style.top = '-10000px';
  measuringHost.style.width = '0';
  measuringHost.style.height = '0';
  measuringHost.style.opacity = '0';
  measuringHost.style.pointerEvents = 'none';
  measuringHost.innerHTML = classicMapSvg;
  document.body.appendChild(measuringHost);

  const measuredSvg = measuringHost.querySelector('svg');
  if (!measuredSvg) {
    document.body.removeChild(measuringHost);
    throw new Error('Classic Diplomacy SVG could not be measured');
  }

  const centers: Record<string, ClassicMapCenter> = {};
  const centerElements = measuredSvg.querySelectorAll(
    '#province-centers > path, #supply-centers > path',
  );

  for (const element of centerElements) {
    const id = element.getAttribute('id');
    if (!id) continue;

    const box = (element as SVGGraphicsElement).getBBox();
    centers[id.replace(/Center$/, '')] = {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  }

  document.body.removeChild(measuringHost);

  cachedClassicMap = {
    ...parseViewBox(svg.getAttribute('viewBox')),
    provinces,
    centers,
  };

  return cachedClassicMap;
}

export function useClassicMap() {
  const [mapData, setMapData] = useState<ClassicMapData | null>(
    cachedClassicMap,
  );

  useEffect(() => {
    if (cachedClassicMap) {
      setMapData(cachedClassicMap);
      return;
    }

    setMapData(loadClassicMap());
  }, []);

  return mapData;
}
