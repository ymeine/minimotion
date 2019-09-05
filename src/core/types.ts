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

export interface ControlParams {
    target?: Target;
    easing?: (elapsed: number, elasticity: number) => number;    // e.g. easeInOutQuad
    duration?: number;              // e.g. 1000
    delay?: number;                 // e.g. 1000 -> delay before execution
    release?: number;               // e.g. -20 -> to release the function 20ms before completion
    elasticity?: number;
    speed?: number;                 // speed ratio e.g. 1 for normal speed, 2 for 2x faster, 0.5 for 2x slower
}

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

export type TweenType = 'transform' | 'attribute' | 'css' | 'function' | 'invalid';
export type RelativeOperator = '+=' | '-=' | '*=' | '';

export interface AnimateParams extends ControlParams, StyleParams {
    onUpdate?: () => void; // callback function called on any update
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
    onupdate?: (time: number) => void;
    forward?: boolean;
    raf?: (callback: (time: number) => void) => void;
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
