import type { View } from 'react-native';

export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Cross-component registry for feature-tour spotlight targets. Screens and
 * shared chrome (e.g. the tab bar) register their views under a key; the
 * FeatureTour overlay measures them in window coordinates when a step opens.
 */
const targets = new Map<string, View>();

export function registerTourTarget(key: string, view: View | null): void {
  if (view == null) {
    targets.delete(key);
  } else {
    targets.set(key, view);
  }
}

export function measureTourTarget(key: string): Promise<TourRect | null> {
  return new Promise((resolve) => {
    const view = targets.get(key);
    if (view == null) {
      resolve(null);
      return;
    }
    view.measureInWindow((x, y, width, height) => {
      if (!Number.isFinite(x) || width <= 0 || height <= 0) {
        resolve(null);
      } else {
        resolve({ x, y, width, height });
      }
    });
  });
}
