export * from "./types";
export * from "./auto";
export * from "./constant";
export * from "./numeric";
export * from "./color";
export * from "./array";

import { createAutoInterpolatorFactory } from "./auto";
import { constantInterpolatorFactory } from "./constant";
import { numericInterpolatorFactory } from "./numeric";
import { colorInterpolatorFactory } from "./color";
import { createArrayInterpolatorFactory } from "./array";
import { instantInterpolatorFactory } from "./instant";

/**
 * List of interpolators that can be used to animate properties depending on their specific types.
 * 
 * The order matters, since it will be used in a process finding the first matching interpolator: it should be from most specific to least specific.
 */
export const INTERPOLATORS = [
  constantInterpolatorFactory,
  numericInterpolatorFactory,
  colorInterpolatorFactory,
  // the array interpolator will be inserted here
  instantInterpolatorFactory // this interpolator should be the last one (as it never fails)
];

export const createInterpolator = createAutoInterpolatorFactory(INTERPOLATORS);

INTERPOLATORS.splice(
  INTERPOLATORS.length - 1,
  0,
  createArrayInterpolatorFactory(createInterpolator)
);
