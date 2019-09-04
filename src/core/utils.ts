import { TweenType, ResolvedTarget, isTargetFunction } from './types';
import { getTransformValue, setTransformValue, TRANSFORMS } from './transforms';

let LOG_ACTIVE = false;

/**
 * Conditionally calls `console.log` to take into account log activation.
 * 
 * @param args Forwarded as is to `console.log`
 * 
 * @see activateLogs
 * @see deactivateLogs
 */
export function log(...args: any[]) {
    if (LOG_ACTIVE) {
        console.log(...args);
    }
}

/**
 * Activates logs.
 * @see log
 * @see deactivateLogs
 */
export function activateLogs() {
    LOG_ACTIVE = true;
}

/**
 * Deactivates logs.
 * @see log
 * @see activateLogs
 */
export function deactivateLogs() {
    LOG_ACTIVE = false;
}

/**
 * Gets value of property `name` inside `params`, or inside `defaults` in case the value is `undefined`.
 * 
 * @param name The property name
 * @param params The main object containing wanted properties
 * @param defaults The object containing default properties
 */
export function parseValue(name, params, defaults) {
    const v = params[name];
    return (v === undefined) ? defaults[name] : v;
}

// --------------------------------------------------------------------------------------------------------------------
// utilities from http://animejs.com

const RX_CSS_NAME = /([a-z])([A-Z])/g;

/**
 * Transforms mixed (or lower) camel cased string into a kebab (with hyphens) case string.
 * @param value The string to transform
 */
function stringToHyphens(value: string) {
    return value.replace(RX_CSS_NAME, '$1-$2').toLowerCase();
}

/**
 * Tell whether given `element` is an `SVGElement` instance.
 * 
 * @param element The value to check
 */
function isSVG(element: any): element is SVGElement {
    return element.ownerSVGElement !== undefined;
}

/**
 * Identifies the type of animation.
 * 
 * Different types can be: 
 * 
 * - `function`: animation is driven by a custom user function
 * - `attribute`: animation is applied to the attribute of an HTML element
 * - `css`: animation is applied to a property of the style of an HTML element
 * - `transform`: animation is applied to one function inside the `transform` property of the style of an HTML element.
 * - `invalid`: the animation can't be interpreted and is marked invalid
 * 
 * @param target The target defined when calling the animation
 * @param propName The name of the specific property to animate
 */
export function getAnimationType(target: ResolvedTarget, propName: string): TweenType {
    if (isTargetFunction(target)) {
        return 'function';
    }

    if (target.nodeType || isSVG(target)) {
        if ((target.hasAttribute(propName) || (isSVG(target) && target[propName]))) return 'attribute';
        if (TRANSFORMS[propName] === 1) return 'transform';
        return 'css';
    }
    return 'invalid';
}

export const dom = {
    /**
     * Get the value of the property named `propName` inside given element (`targetElt`), depending on its type (`propType`).
     * 
     * Properties are not real object properties in the JavaScript sense, so depending on their type, they will be read differently.
     * 
     * @param targetElement The element to get property from
     * @param propertyName The name of the property
     * @param propertyType The type of the property
     */
    getValue(targetElement: HTMLElement, propertyName: string, propertyType: TweenType) {
        switch (propertyType) {
            case 'css': return dom.getCSSValue(targetElement, propertyName);
            case 'transform': return getTransformValue(targetElement, propertyName);
            case 'attribute': return targetElement.getAttribute(propertyName);
        }
    },

    /**
     * Sets the value of the property named `propName` inside given element (`targetElt`), depending on its type (`propType`).
     * 
     * Properties are not real object properties in the JavaScript sense, so depending on their type, they will be written differently.
     * 
     * If the property type is not supported, a warning message will be logged in case logs are activated.
     * 
     * @param targetElt The element to set property from
     * @param propName The name of the property
     * @param propType The type of the property
     */
    setValue(targetElt: HTMLElement, propName: string, propType: TweenType, value) {
        if (!targetElt) return;
        switch (propType) {
            case 'css':
                targetElt.style[propName] = value;
                break;
            case 'transform':
                setTransformValue(targetElt, propName, value);
                break;
            case 'attribute':
                targetElt.setAttribute(propName, value);
                break;
            default:
                log("[animate] unsupported animation type: " + propType);
        }
    },

    /**
     * Gets the computed style property with given name from given element.
     * 
     * If given property name is not directly in the `style` property of the element, returns an empty string.
     * 
     * If computed value is falsy, returns `"0"`. 
     * 
     * @param element The element to get computed style property from
     * @param name The name of the computed style property to get
     */
    getCSSValue(element: HTMLElement, name: string) {
        if (name in element.style) {
            return getComputedStyle(element).getPropertyValue(stringToHyphens(name)) || '0';
        }
        return '';
    }
}
