import type { BufferGeometry } from 'three';
import type { Stem } from './weber-penn.js';

export function buildBranchGeometry(
  stems: Stem[],
  opts?: {
    tileWorldSize?: number;
    radialScale?: number;
    ringStride?: number;
    terminalSides?: number;
    terminalRingStride?: number;
  }
): BufferGeometry;
