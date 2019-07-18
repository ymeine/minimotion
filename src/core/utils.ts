import { TweenType, RelativeOperator } from './types';

let LOG_ACTIVE = false;

export function log(...args: any[]) {
    if (LOG_ACTIVE) {
        console.log.apply(console, args);
    }
}

export function activateLogs() {
    LOG_ACTIVE = true;
}

export function deactivateLogs() {
    LOG_ACTIVE = false;
}

export function parseValue(name, params, defaults) {
    let v = params[name];
    return (v === undefined) ? defaults[name] : v;
}

// --------------------------------------------------------------------------------------------------------------------
// utilities from http://animejs.com

const TRANSFORMS = new Set(['translateX', 'translateY', 'translateZ', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'skewX', 'skewY', 'perspective']);
const RX_CSS_NAME = /([a-z])([A-Z])/g;

/**
 * Transform js prop names into css propnames (e.g. "borderColor" into "border-color")
 * @param str 
 */
function stringToHyphens(str: string) {
    return str.replace(RX_CSS_NAME, '$1-$2').toLowerCase();
}

function isSVG(el) {
    return el.ownerSVGElement !== undefined; // instanceof SVGElement
}

/**
 * Identify the type of animation (transform vs attribute vs css style)
 * @param el 
 * @param propName 
 */
export function getAnimationType(el: any, propName: string): TweenType {
    if (el.nodeType || isSVG(el)) {
        if (TRANSFORMS.has(propName)) return 'transform';
        if ((el.getAttribute(propName) || (isSVG(el) && el[propName]))) return 'attribute';
        if (propName !== 'transform') return 'css';
    }
    return 'invalid';
}

const TRANSFORM_FUNCTION_PARAMS = () => /\s*(\-)?\d+\s*(px|deg)?\s*(?:\,\s*)?/g;
const TRANSFORM_REGEXP = () => /\s*(\w+)\s*\([^\)]\)/g;

export let dom = {
    /**
     * Return the current value of a targeted property
     * @param targetElt 
     * @param propName 
     * @param propType 
     */
    getValue(targetElt, propName, propType) {
        switch (propType) {
            case 'css': return dom.getCSSValue(targetElt, propName);
            case 'transform': return null; // todo getTransformValue(target, propName);
            case 'attribute': return null; // todo target.getAttribute(propName)
        }
        return null;
    },

    setValue(targetElt, propName, propType, value) {
        if (!targetElt) return;
        switch (propType) {
            case 'css':
                targetElt.style[propName] = value;
                break;
            case 'transform':
                // TODO 2019-07-11T12:54:47+02:00
                // don't drop the other values
                // if "none", it's ok
                // for the rest, target properly
                // could be a regexp
                // console.log(dom.getTransforms(targetElt));
                targetElt.style.transform = `${propName}(${value}px)`;
                break;
            default:
                console.log("[animate] unsupported animation type: " + propType);
        }
    },

    getTransforms(element) {
        const transforms: {name:string, value:string, unit:string}[] = [];
        const propertyValue = element.style.transform;
        
        if (propertyValue == null || propertyValue === '' || propertyValue === 'none') {
            return transforms;
        }

        const regexp = TRANSFORM_REGEXP();
        while (true) {
            const result = regexp.exec(propertyValue);
            if (result == null) {
                break;
            }
            const [_, name, value, unit] = result;
            transforms.push({name, value, unit});
        }

        return transforms;
    },

    /**
     * Read the dom element to access the computed CSS value
     * @param el 
     * @param prop 
     */
    getCSSValue(el, prop: string) {
        if (prop in el.style) {
            return getComputedStyle(el).getPropertyValue(stringToHyphens(prop)) || '0';
        }
        return '';
    }
}

// Colors

const RX_HEX1 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
    RX_HEX2 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i,
    RX_RGB = /rgb\(\s*(\d+)\s*\,\s*(\d+)\s*\,\s*(\d+)\s*\)/,
    RX_RGBA = /rgba\(\s*(\d+)\s*\,\s*(\d+)\s*\,\s*(\d+)\s*\,\s*([\d\.]+)\s*\)/,
    RX_HSL = /hsl\(\s*(\d+)\s*,\s*([\d\.]+)%\s*,\s*([\d\.]+)%\s*\)/,
    RX_HSLA = /hsla\(\s*(\d+)\s*,\s*([\d\.]+)%\s*,\s*([\d\.]+)%\s*\,\s*([\d\.]+)\s*\)/;

/**
 * Parse a CSS color string and return an array [r, g, b, a] or null is the value is not a color
 * @param value a color value - e.g. '#FFF' or '#0050FF' or 'rgba(12,45,125,1)' etc.
 */
export function parseColor(value: string | null): number[] | null {
    if (!value) return null;
    let r: number[] | null;
    r = parseHexColor(value);
    if (!r) {
        r = parseRgbColor(value);
        if (!r) {
            r = parseHslColor(value);
        }
    }
    return r;
}

function parseHexColor(value: string): number[] | null {
    const hex = value.replace(RX_HEX1, (m, r, g, b) => r + r + g + g + b + b);
    const rgb = RX_HEX2.exec(hex);
    if (!rgb) return null;
    return [parseInt(rgb[1], 16), parseInt(rgb[2], 16), parseInt(rgb[3], 16), 1];
}

function parseRgbColor(value: string): number[] | null {
    const rgb = RX_RGB.exec(value) || RX_RGBA.exec(value);
    if (!rgb) return null;
    let a = 1;
    if (rgb[4] !== undefined) {
        a = parseFloat(rgb[4]);
    }
    return [parseInt(rgb[1], 10), parseInt(rgb[2], 10), parseInt(rgb[3], 10), a];
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
    const hsl = RX_HSL.exec(value) || RX_HSLA.exec(value);
    if (!hsl) return null;
    const h = parseInt(hsl[1]) / 360;
    const s = parseInt(hsl[2]) / 100;
    const l = parseInt(hsl[3]) / 100;
    let a = 1;
    if (hsl[4] !== undefined) {
        a = parseFloat(hsl[4]);
    }
    let r, g, b;
    if (s == 0) {
        r = g = b = l;
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r * 255, g * 255, b * 255, a];
}