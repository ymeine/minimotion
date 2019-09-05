import { ValueInterpolatorFactory } from "./types";
import { interpolate } from "./interpolate";

const RX_HEX1 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
const RX_HEX2 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
const RX_RGB  = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/;
const RX_RGBA = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/;
const RX_HSL  = /hsl\(\s*(\d+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/;
const RX_HSLA = /hsla\(\s*(\d+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)\s*\)/;

/**
 * Parse a CSS color string and return an array [r, g, b, a] or null is the value is not a color
 * @param value a color value - e.g. '#FFF' or '#0050FF' or 'rgba(12,45,125,1)' etc.
 */
export function parseColor(value: string | null): number[] | null {
  if (!value) return null;
  
  let result: number[] | null;
  
  result = parseHexColor(value);
  if (!result) {
    result = parseRgbColor(value);
    if (!result) {
      result = parseHslColor(value);
    }
  }

  return result;
}

function parseHexColor(value: string): number[] | null {
  // transform format "#ABC" to equivalent "#AABBCC" to be able to parse only inputs in the second format afterwards
  const hex = value.replace(RX_HEX1, (_, red, green, blue) => red + red + green + green + blue + blue);
  const result = RX_HEX2.exec(hex);

  if (!result) return null;

  const parse = input => parseInt(input, 16);
  // return Array.from(result).slice(1, 4).map(parse).concat(1);
  const [_, red, green, blue] = result;
  return [parse(red), parse(green), parse(blue), 1];
}

function parseRgbColor(value: string): number[] | null {
  const result = RX_RGB.exec(value) || RX_RGBA.exec(value);
  
  if (!result) return null;
  
  const [_, red, green, blue, alpha] = result;
  const finalAlpha = alpha === undefined ? 1 : parseFloat(alpha);

  const parse = input => parseInt(input, 10);
  return [parse(red), parse(green), parse(blue), finalAlpha];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function parseHslColor(value: string): number[] | null {
  const result = RX_HSL.exec(value) || RX_HSLA.exec(value);
  
  if (!result) return null;

  const [_, _hue, _saturation, _lightness, _alpha] = result;

  const hue = parseInt(_hue) / 360;
  const saturation = parseInt(_saturation) / 100;
  const lightness = parseInt(_lightness) / 100;
  const alpha = _alpha === undefined ? 1 : parseFloat(_alpha);

  let red, green, blue;

  if (saturation == 0) {
    red = green = blue = lightness;
  } else {
    const q = lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;

    const p = 2 * lightness - q;
    red = hue2rgb(p, q, hue + 1 / 3);
    green = hue2rgb(p, q, hue);
    blue = hue2rgb(p, q, hue - 1 / 3);
  }

  return [red * 255, green * 255, blue * 255, alpha];
}

/**
 * Interpolator factory for a color value.
 * 
 * It will not match if `to` cannot be parsed as a color.
 * 
 * If `from` cannot be parsed as a color but is specified to be read from the DOM, a default value is set for it: fully opaque black. Otherwise, unless it can be parsed right away, the interpolator will not match.
 * 
 * The returned interpolator will interpolate each component of the color in parallel.
 */
export const colorInterpolatorFactory: ValueInterpolatorFactory = (
  propFrom,
  propTo,
  options = {}
) => {
  const { fromIsDom } = options;

  const to = parseColor(propTo);
  if (!to) return null;

  let from = parseColor(propFrom);
  if (fromIsDom && !from) {
    from = [0, 0, 0, 1];
  }
  if (!from) return null;

  return {
    getValue(easing: number) {
      const rgba: number[] = [];
      for (let index = 0; index < 4; index++) {
        rgba.push(interpolate(from![index], to[index], easing, index === 3 ? 100 : 1));
      }
      return `rgba(${rgba.join(", ")})`;
    }
  };
};
