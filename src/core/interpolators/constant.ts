import { ValueInterpolatorFactory } from "./types";

/**
 * Interpolator factory for a constant value.
 * 
 * It will match when `from` and `to` are equal.
 * 
 * The returned interpolator will constantly return their value.
 */
export const constantInterpolatorFactory: ValueInterpolatorFactory = (
  from,
  to
) => {
  if (from !== to) {
    return null;
  }
  return {
    getValue() {
      return to;
    }
  };
};
