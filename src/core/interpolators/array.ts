import { ValueInterpolatorFactory, ValueInterpolator } from "./types";
import { constantInterpolatorFactory } from "./constant";

const RX_SEPARATOR = /([() ,])/;

export const createArrayInterpolatorFactory = (
  itemInterpolatorFactory: ValueInterpolatorFactory
): ValueInterpolatorFactory => (propFrom, propTo, options) => {
  const splitFrom = propFrom.trim().split(RX_SEPARATOR);
  if (splitFrom.length === 1) return null;
  
  const splitTo = propTo.trim().split(RX_SEPARATOR);
  
  const length = splitFrom.length;
  if (length !== splitTo.length) return null;
  
  const interpolators: ValueInterpolator[] = [];
  for (let index = 0; index < length; index++) {
    const interpolatorFactory = index % 2 === 0
      ? itemInterpolatorFactory
      : constantInterpolatorFactory;

    const interpolator = interpolatorFactory(splitFrom[index], splitTo[index], options);
    if (!interpolator) return null;
    
    interpolators.push(interpolator);
  }

  return {
    getValue(easing: number) {
      return interpolators
        .map(interpolator => interpolator.getValue(easing))
        .join("");
    }
  };
};
