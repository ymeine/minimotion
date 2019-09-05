function stringContains(str: string, text: string) {
  return str.indexOf(text) > -1;
}

export const TRANSFORMS = {
  transform: 1, // special property: contains the full transform value
  translateX: 1,
  translateY: 1,
  translateZ: 1,
  rotate: 1,
  rotateX: 1,
  rotateY: 1,
  rotateZ: 1,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  skewX: 1,
  skewY: 1,
  perspective: 1
};

/**
 * Determines and returns which unit the given transform function name is using.
 *  
 * @param functionName The name of the transform function to get unit for
 */
export function getTransformUnit(functionName: string) {
  if (stringContains(functionName, "translate") || functionName === "perspective") {
    return "px";
  }
  if (stringContains(functionName, "rotate") || stringContains(functionName, "skew")) {
    return "deg";
  }
  return "";
}

/**
 * Extracts the function calls from the transform chain string, to get the list of applied transformations.
 * 
 * It stores the information into a Map, therefore keeping the order which is important,
 * and for which the key is the transform function name and the value its single argument.
 * 
 * @param element The element to parse the transform chain from.
 */
export function getElementTransforms(element: HTMLElement) {
  const string = element.style.transform || "";
  const regexp = /(\w+)\(([^)]*)\)/g;
  const transforms = new Map<string, string>();
  let matches: RegExpExecArray | null;
  while ((matches = regexp.exec(string))) {
    transforms.set(matches[1], matches[2]);
  }
  return transforms;
}

let elementTransformsCache = new WeakMap<HTMLElement, Map<string, string>>();
/**
 * Cached version of `getElementTransforms`.
 * 
 * @see clearFastElementTransformsCache
 * @see getElementTransforms
 */
export function getFastElementTransforms(element: HTMLElement) {
  let result = elementTransformsCache.get(element);
  if (!result) {
    result = getElementTransforms(element);
    elementTransformsCache.set(element, result);
  }
  return result;
}

/**
 * Clears the cache for `getFastElementTransforms`.
 * 
 * @param element Pass the element to clear only its cache entry, or none to clear the whole cache.
 */
export function clearFastElementTransformsCache(element?: HTMLElement) {
  if (element) {
    elementTransformsCache.delete(element);
  } else {
    elementTransformsCache = new WeakMap();
  }
}

/**
 * Generates the transform chain string from a Map as the one returned by `getElementTransforms`.
 * 
 * @param transforms The Map of transforms. 
 */
export function stringifyTransforms(transforms: Map<string, string>) {
  return Array.from(transforms.entries())
    .map(([fn, arg]) => `${fn}(${arg})`)
    .join(' ');
}

/**
 * Returns either the full transform chain if given property is named `"transform"`, or a specific transform function's value.
 * 
 * If the transform function cannot be found, it will return a default value: `1` for the specific case of `scale`, or `0` along with a unit (if applicable) otherwise.
 * 
 * @param element The element to get transform or specific transform function argument from
 * @param propertyName `transform` to get the whole chain, or the name of the function to get its value
 */
export function getTransformValue(element: HTMLElement, propertyName: string) {
  if (propertyName === "transform") {
    return element.style.transform || "";
  }
  return (
    getFastElementTransforms(element).get(propertyName) ||
    (stringContains(propertyName, "scale") ? "1" : 0 + getTransformUnit(propertyName))
  );
}

/**
 * Sets either the whole transform chain or a specific transform function argument.
 * 
 * When setting a particular function, updates the cache, otherwise if setting everything it clears it.
 * 
 * @param element The element to set transform / transform function on
 * @param propertyName `transform` to set the whole chain, or the name of the function to set its value
 * @param value The value to set
 */
export function setTransformValue(element: HTMLElement, propertyName: string, value) {
  if (propertyName === "transform") {
    element.style.transform = value;
    clearFastElementTransformsCache(element);
    return;
  }
  const transforms = getFastElementTransforms(element);
  transforms.set(propertyName, value);
  const transform = stringifyTransforms(transforms);
  element.style.transform = transform;
}
