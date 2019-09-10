/**
 * An input to resolve to an HTML element.
 * 
 * Can be the element itself directly, or a selector used to retrieve a single element.
 */
export type Selector = HTMLElement | string;

export interface TargetFunctionArg {
    property: string;
    value: string;
}
export type TargetFunction = (arg: TargetFunctionArg) => void;

export function isTargetFunction(value: any): value is TargetFunction {
    return typeof value === 'function';
}

export type Target = Selector | TargetFunction;

export type ResolvedTarget = HTMLElement | TargetFunction;

export interface SelectorContext {
    querySelector(selector: string): HTMLElement | null;
    querySelectorAll(selector: string): NodeListOf<HTMLElement> | HTMLElement[];
}


type StyleNumber = number | string | (number | string)[];

export interface Instructions {
    (a: Anim): void | Promise<any>;
}

/**
 * Parameters used to control a single animation.
 */
export interface ControlParams {
    /**
     * A DOM element, or a selector to retrieve one. It is by default the target to apply the animated properties.
     */
    target?: Target;

    /**
     * The timing function to use.
     * 
     * An animation has a `from` source and a `to` target. Animations make the current value vary from `from` to `to`, over the specified duration.
     * 
     * The easing function associates a time value (on the x axis) to a value within the range `[from, to]` (on the y-axis).
     * 
     * It receives two parameters: the current time, and the elasticity factor.
     */
    easing?: (elapsed: number, elasticity: number) => number;

    /**
     * The duration of the animation itself, in milliseconds.
     * 
     * It sits between the `delay` and the `release`.
     */
    duration?: number;

    /**
     * The amount of time to wait before starting the playback of the animation, in milliseconds.
     */
    delay?: number;

    /**
     * The amount of time to wait before considering the animation is completed (after delay and duration have passed), in milliseconds.
     * 
     * It can be negative, which means that the animation will be considered completed before delay and duration have passed.
     */
    release?: number;

    /**
     * A factor of elasticity, making the value _bounce_ around the end of the values interval, progressively converging to the target value.
     * 
     * It is actually passed to the easing function as a second parameter, so it is up to the latter to implement it.
     */
    elasticity?: number;

    /**
     * The speed factor to apply for the playback of the animation.
     * 
     * For example: 
     * 
     * - 1 is normal speed
     * - 2 is twice faster
     * - 0.5 is half speed
     */
    speed?: number;
}

/**
 * Open set of properties used to defined the animation ranges per property.
 * 
 * The CSS transform being treated specifically, the set of transform functions that can be animated is predefined.
 * 
 * For the rest, you can defined any property name and it will be eventually treated accordingly to what the name might refer to: a style property, an attribute, etc.
 */
interface StyleParams {
    translateX?: StyleNumber;
    translateY?: StyleNumber;
    translateZ?: StyleNumber;
    rotate?: StyleNumber;
    rotateX?: StyleNumber;
    rotateY?: StyleNumber;
    rotateZ?: StyleNumber;
    scale?: StyleNumber;
    scaleX?: StyleNumber;
    scaleY?: StyleNumber;
    scaleZ?: StyleNumber;
    skewX?: StyleNumber;
    skewY?: StyleNumber;
    perspective?: StyleNumber;
    [stylePropName: string]: any;
}

/**
 * The type of the property being animated by the tween.
 * 
 * The different values mean: 
 * 
 * - `transform`: a CSS transform function
 * - `attribute`: an HTML element attribute
 * - `css`: a property of the style of an element
 * - `function`: ...
 * - `invalid`: could be interpolated but not applied, so rejected as invalid
 */
export type TweenType = 'transform' | 'attribute' | 'css' | 'function' | 'invalid';

/**
 * The set of relative operators that can be used to define bounds of an animation range.
 */
export type RelativeOperator = '+=' | '-=' | '*=' | '';

/**
 * The combination of control parameters - to control the animation - and animated properties - specifying their animation ranges.
 */
export interface AnimateParams extends ControlParams, StyleParams {
    /**
     * Callback function anytime the animation applies the result.
     */
    onUpdate?: () => void;
}

export interface IterationParams {
    targets: Selector; // | Selector[]
    sequence?: boolean;
}

export interface PlayParams {
    alternate?: boolean;
    times?: number;
    speed?: number;
    backSpeed?: number;
    delay?: number;
    release?: number;
    // startPos / endPos ?
    // duration ? (replace endPos & times)
}

export interface Anim {
    defaults(params: ControlParams): void;
    animate(params: AnimateParams): Promise<any>; // animate a style property

    iterate(targetsOrParams: Selector | IterationParams, instructions: (a: Anim, idx: number, total: number, e: HTMLElement) => void | Promise<any>): Promise<any>;
    repeat(times: number, instructions: ((a: Anim, loopCount: number) => void)): Promise<any>;
    sequence(...blocks: ((a: Anim) => void)[]): Promise<any>;
    parallelize(...tracks: ((a: Anim) => void)[]): Promise<any>;

    group(instructions: ((a: Anim) => void)): Promise<any>;
    group(name: string, instructions: ((a: Anim) => void)): Promise<any>;

    play(instructions: ((a: Anim) => void)): Promise<any>;
    play(params: PlayParams, instructions: ((a: Anim) => void)): Promise<any>;

    select(selector: Selector, scope?: SelectorContext): HTMLElement | null;
    selectAll(selector: Selector, scope?: SelectorContext): HTMLElement[] | null;

    // // setStyle
    // // addCssClass ->async // cf class list
    // // swing() startPosition, endPosition = time or -1, backSpeed, fwdSpeed, cycles, dynamic
    // player() -> returns a player ?

    delay(timeMs: number): Promise<any>;
    random(min: number, max: number): number;
}

export interface AnimContainer {
    addEntity(ae: AnimEntity): void;
    removeEntity(ae: AnimEntity): void;
}

export interface AnimEntity {
    /**
     * The name of the entity.
     */
    name: string;

    /**
     * `true` if the entity is in its parent timeline running list.
     */
    isRunning: boolean;

    /**
     * `false` if the entity has not registered in the parent start markers.
     */
    startRegistered: boolean;

    /**
     * `false` if the entity has not registered in the parent end markers.
     */
    endRegistered: boolean;

    /**
     * Reference to the next entity in the parent timeline running list.
     */
    nextEntity: AnimEntity | null;

    // Skipping rendering leads to wrong results for animations that rely on reading the current value from the DOM
    // /** 
    //  * `true` if rendering should not be done (e.g. for duration() calculation).
    //  */
    // skipRendering: boolean;

    /**
     * Attaches this entity to the given parent.
     * 
     * @param parent The parent to attach to.
     */
    attach(parent: AnimContainer);

    /**
     * Initializes the entity with a given start time.
     * 
     * @param startTime The start time.
     */
    init(startTime: number): void;

    /**
     * Retrieves the next or previous marker position from teh given time.
     * 
     * @param time The reference time to search from.
     * @param forward Whether to search for next (when `true`) or previous (when `false`) one
     * 
     * @return The position of the marker.
     */
    getNextMarkerPosition(time: number, forward: boolean): number;

    /**
     * Displays (applies) the frame corresponding to ???.
     * 
     * @param time ?
     * @param targetTime ?
     * @param forward ?
     */
    displayFrame(time: number, targetTime: number, forward: boolean);
    
    /**
     * `true` if the animation has completed.
     */
    done: boolean;
    
    /**
     * `true` if the entity has been released (i.e. next instructions can be run).
     */
    released: boolean;

    // // isFinite: boolean; // todo
    // next(tick: number): void;    // move animation to next step and updates done and released  // next(stateHolder?)
    // apply(state) -> replay / rewind or seek
}

export interface AnimTimeLine {
    move(time: number): Promise<any>;
}

export interface AnimMarker {
    prev: AnimMarker | undefined;
    next: AnimMarker | undefined;
    time: number;
    startEntities: AnimEntity[] | undefined;
    endEntities: AnimEntity[] | undefined;
}

export interface PlayArguments {
    /**
     * A callback called every time the interpolation is committed.
     * 
     * It receives the current time.
     */
    onupdate?: (time: number) => void;
    
    /**
     * Whether to play the animation forward or backward.
     * 
     * It is `true` be default. Otherwise if it is falsy it will make the animation play backwards.
     */
    forward?: boolean;
    
    /**
     * A custom `requestAnimationFrame` function. Might be useful for specific platforms or contexts.
     */
    raf?: (callback: (time: number) => void) => void;
    
    /**
     * The wanted speed to play the animation. It's a factor.
     */
    speed?: number;

    // until?: number; // time position
}

export interface AnimPlayer {
    position: number;
    isPlaying: boolean;
    duration(): Promise<number>; // -1 if infinite
    move(timePosition: number): Promise<number>;
    play(args?: PlayArguments): Promise<number>;
    pause(): void;
    stop(): Promise<number>;
}
