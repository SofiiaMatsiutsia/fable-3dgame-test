import type { Vector3, Quaternion } from 'three';

export interface Stem {
  level: number;
  points: Vector3[];
  radii: number[];
  orients: Quaternion[];
  winds: number[];
  length: number;
  radialSegments: number;
  maxLevel: number;
  id: number;
  parentId: number;
}

export function defaultParams(): Record<string, unknown>;

export function generateSkeleton(
  userParams: Record<string, unknown>,
  rng: { next(): number; range(a: number, b: number): number; vary(a: number, b: number): number }
): { stems: Stem[]; tips: unknown[]; params: Record<string, unknown> };
