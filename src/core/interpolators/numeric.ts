import { getTransformUnit } from "../transforms";
import { ValueInterpolatorFactory } from "./types";
import { interpolate } from "./interpolate";

const RX_NUMERIC_PROP = /^(\*=|\+=|-=)?([+-]?([0-9]*)(\.[0-9]*)?)(%|px|pt|em|rem|in|cm|mm|ex|ch|pc|vw|vh|vmin|vmax|deg|rad|turn)?$/,
  RX_DEFAULT_PX_PROPS = /(radius|width|height|top|left)$/i;

const parseNumericProp = (number: string) => {
  const result = RX_NUMERIC_PROP.exec(number);

  if (result) {
    const [, relativeOperator, stringNumber, integralPart, decimalPart, unit] = result;
    const fractionDigitsCount = decimalPart ? decimalPart.length - 1 : 0;
    
    if (integralPart || fractionDigitsCount > 0) {
      const number = +stringNumber;
  
      return {
        relativeOperator,
        number,
        unit,
        fractionDigitsCount
      };
    }
  }

  return null;
};

export const numericInterpolatorFactory: ValueInterpolatorFactory = (
  propFrom,
  propTo,
  options = {}
) => {
  const { propName, type, fromIsDom } = options;

  // propTo is a numeric prop - e.g. '20px' or '+=300.3em' or '0.3'
  const parsedTo = parseNumericProp(propTo);
  if (!parsedTo) return null;

  const {relativeOperator} = parsedTo;
  let to = parsedTo.number;
  let unit = parsedTo.unit || "";
  let fractionDigits = 1;

  const parsedFrom = parseNumericProp(propFrom);
  // check consistency
  if (!parsedFrom) return null;
  // cannot be relative
  if (parsedFrom.relativeOperator) return null;
  
  const fromUnit = parsedFrom.unit || "";
  // units have to be the same
  if (unit && fromUnit && !fromIsDom && fromUnit !== unit) return null;

  unit = unit || fromUnit; // if unit is not defined in to value, we use from value
  const from = parsedFrom.number;

  if (!unit) {
    // set default unit for common properties
    if (propName) {
      if (type === "transform") {
        unit = getTransformUnit(propName);
      } else if (type === "css" && propName.match(RX_DEFAULT_PX_PROPS)) {
        unit = "px";
      }
    }
  }

  switch (relativeOperator) {
    case "+=": {
      to += from;
      break;
    }
    case "-=": {
      to = from - to;
      break;
    }
    case "*=": {
      to *= from;
      break;
    }
  }

  if (!unit) {
    fractionDigits = 2; // unit-less properties should be rounded with 2 decimals by default (e.g. opacity)
  }

  fractionDigits = Math.max(
    fractionDigits,
    parsedFrom.fractionDigitsCount,
    parsedTo.fractionDigitsCount
  );

  const roundLevel = 10 ** fractionDigits;
  
  return {
    getValue(easing: number) {
      return interpolate(from, to, easing, roundLevel) + unit;
    }
  };
};
