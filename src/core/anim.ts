import {
    Anim,
    AnimateParams,
    AnimEntity,
    ControlParams,
    Selector,
    SelectorContext,
    Instructions,
    IterationParams,
    AnimMarker,
    AnimTimeLine,
    AnimContainer,
    AnimPlayer,
    PlayArguments,
    PlayParams,
    Target,
    ResolvedTarget,
    isTargetFunction,
} from './types';
import { easeOutElastic } from './easings';
import { log, parseValue } from './utils';
import { Delay, PlayerEntity, createTweens } from './entities';

const FRAME_MS = 16;
const MAX_TIME = Number.MAX_SAFE_INTEGER;
const MAX_ASYNC = 100;
const MAX_TL_DURATION_MS = 600000; // 10mn

// count the changes that can be triggered by an async call
let ASYNC_COUNTER = 0;

/**
 * Converts a duration in a number of frames.
 * 
 * A frame is 16 ms at speed 1.
 * 
 * @param durationMs The duration to convert, in milliseconds
 * @param speed The desired speed: it is used to divide the given duration 
 */
function convertDuration(durationMs: number, speed: number): number {
    return Math.round(durationMs / speed / FRAME_MS) * FRAME_MS;
}

const defaultSettings: ControlParams = {
    easing: easeOutElastic,
    duration: 1000,
    delay: 0,
    release: 0,
    elasticity: .5,
    speed: 1
}

export async function exhaustAsyncPipe() {
    /* eslint require-atomic-updates: warn */
    let c1 = -1;
    let c2 = ASYNC_COUNTER;
    let count = 0;
    let count2 = 0;

    while (c1 !== c2 && count < MAX_ASYNC) {
        // c1 !== c2 means that some async callbacks have been run on the animation engine as ASYNC_COUNTER changed
        await Promise.resolve();
        c1 = c2;
        c2 = ASYNC_COUNTER;
        if (c1 === c2) {
            count2++;
        } else {
            count2 = 0;
        }
        if (count === 0 || count2 < 2) {
            // force at least 2 identical rounds
            // the first await allows animations to add new instructions on the await queue (and these awaits don't increment ASYNC_COUNTER)
            c1 = -1;
        }
        if (ASYNC_COUNTER > 10000) {
            // purpose of ASYNC_COUNTER is to track changes, we don't care of the actual value
            ASYNC_COUNTER = 1;
        }
        count++;
    }

    if (count == MAX_ASYNC) {
        throw new Error("Max async loop reached");
    }
}

export class TimeLine implements Anim, AnimEntity, AnimTimeLine, AnimContainer {
    static convertDuration = convertDuration;
    // skipRendering = false;
    selectorCtxt: SelectorContext | undefined;
    isRunning = false;
    startRegistered = false;
    endRegistered = false;
    startTime = 0;
    currentTime = -1;
    endTime = -1;
    moveTarget = 0;
    nextEntity: AnimEntity | null = null;
    firstMarker: AnimMarker | undefined;
    currentMarker: AnimMarker | undefined;
    lastMarker: AnimMarker | undefined;
    parent: TimeLine | undefined;
    settings: ControlParams = defaultSettings;
    rList: AnimEntity | null = null; // linked list of running entities
    rListEnd: AnimEntity | null = null; // last node of the linked list of running entities
    lastTargetTime = -1;             // position of the last target frame
    lastTargetForward = true;        // true if the last target was going forward (i.e. time increase)
    tlFunctionCalled = false;        // true when the tl function has been called
    tlFunctionComplete = false;      // true when the tl function has returned
    tlFunctionArgs: any[] | undefined;
    released = false;
    done = false;                    // true when all child entities have been run
    releaseCb: Function | undefined;
    doneCb: ((time: number) => void) | undefined;

    constructor(
        public name: string,
        public tlFunction: (a: Anim) => void,
        tlFunctionArgs?: any[],
    ) {
        this.tlFunctionArgs = tlFunctionArgs;
    }

    attach(parent: TimeLine) {
        if (!this.parent) {
            this.parent = parent;
            this.settings = parent.settings;
            this.selectorCtxt = parent.selectorCtxt;
            parent.addEntity(this);
        }
    }

    init(startTime: number) {
        this.startTime = startTime;
    }

    /**
     * Creates a promise that will be fulfilled when the context is released.
     * 
     * Note: can only be called by one entity.
     * 
     * The release signal is sent when: 
     * 
     * - the timeline function as returned
     * - and all running entities are released
     */
    async releaseSignal() {
        if (!this.released) {
            return new Promise(resolve => this.releaseCb = resolve);
        }
    }

    private setTlFunctionComplete() {
        // console.log(this.name, ": tl function complete", this.currentTime);
        this.tlFunctionComplete = true;
        ASYNC_COUNTER++;
        this.checkState();
    }

    private checkState() {
        // log(this.name, ":checkState @", this.currentTime, this.released, this.done, this.tlFunctionComplete, this.lastTargetForward);

        // check if the timeline has released or completed
        if (this.released && this.done) return;

        if (this.tlFunctionComplete && this.lastTargetForward) {
            //console.log(this.name, ": check state");
            let ae = this.rList;
            let allReleased = true;
            let allDone = false;
            let count = 0;

            while (ae) {
                // log(this.name, ": check ae: ", ae.name, " released: ", ae.released)
                count++
                if (!ae.released) {
                    allReleased = false;
                }
                ae = ae.nextEntity;
            }

            // log(this.name, ": check ", count, allReleased, allDone)
            if (allReleased) {
                // log(this.name, ": RELEASED", (this.releaseCb !== undefined))
                this.released = true;
                if (this.releaseCb) {
                    this.releaseCb(); // will send release Signal
                    this.releaseCb = undefined;
                }
            }

            if (count === 0) {
                // log(this.name, ": DONE")
                this.done = true;
                if (this.doneCb) {
                    this.doneCb(this.lastTargetTime);
                    this.doneCb = undefined;
                }
                allDone = true;
            }

            if (this.parent && allReleased && this.done) {
                this.parent.removeEntity(this);
            }

            if (this.parent && (allReleased || allDone)) {
                this.parent.checkState();
            }
        }
    }

    async move(timeTarget: number, manageAsyncPipe = true): Promise<number> {
        this.moveTarget = timeTarget;

        let {currentTime} = this;
        if (timeTarget === currentTime) return currentTime;

        const forward = (timeTarget > currentTime);
        let nextTarget: number;

        // principle: display first all marker frames, then last frame is calculated between markers
        // key steps
        // 1. find next time where frames need to be displayed
        // 2. display frame
        // 3. exhaust the async pipe (that may generate new items in the running entity list)
        // 4. repeat
        while (currentTime !== this.moveTarget) {
            // step #1
            if (currentTime < 0) {
                if (this.startTime < 0) {
                    this.startTime = 0;
                }
                nextTarget = this.startTime;
            } else {
                if (forward !== this.lastTargetForward) {
                    // we changed direction: we may have to re-display the current frame if we are on a marker
                    // log(">> display last frame")
                    const m = this.getMarker(currentTime);
                    if (m) {
                        this.displayFrame(currentTime, timeTarget, forward);
                        await exhaustAsyncPipe();
                    }
                }

                nextTarget = this.getNextMarkerPosition(currentTime, forward);
                log("move: nextTarget @", currentTime, "->", nextTarget, ">>", timeTarget, "forward: ", forward);
                if (nextTarget < 0 || nextTarget === currentTime) {
                    // no marker found : we reached the end of the time line
                    this.moveTarget = currentTime;
                    this.endTime = currentTime;
                    return currentTime;
                } else {
                    if (forward) {
                        if (nextTarget > timeTarget) {
                            nextTarget = timeTarget;
                        }
                    } else {
                        if (nextTarget < timeTarget) {
                            nextTarget = timeTarget;
                        }
                    }
                }
            }
            // step #2
            this.displayFrame(nextTarget, timeTarget, forward);

            // step #3
            if (manageAsyncPipe) {
                await exhaustAsyncPipe();
            }

            // step #4
            currentTime = this.currentTime; // has been changed by displayFrame()
        }
        return this.currentTime;
    }

    /**
     * Display the frame at the given time position
     * @param time time position of the frame
     * @param targetTime time of the target frame
     * @param forward true if the animation is going forward (i.e. time is increasing)
     */
    displayFrame(time: number, targetTime: number, forward: boolean) {
        // log(this.name, ":display @", time, "target:", targetTime, "forward:", forward);
        this.currentTime = time;
        this.lastTargetTime = targetTime;
        this.lastTargetForward = forward;

        if (!this.tlFunctionCalled) {
            this.tlFunctionCalled = true;

            // init the instructions - this will indirectly call addEntity / removeEntity
            let r: any | Promise<any>;
            
            if (this.tlFunctionArgs) {
                r = this.tlFunction.apply(null, [this].concat(this.tlFunctionArgs));
            } else {
                r = this.tlFunction(this);
            }

            if (r && r.then) {
                r.then(() => {
                    this.setTlFunctionComplete();
                });
            } else {
                this.setTlFunctionComplete();
            }
        } else {
            // display frames for each running entity
            let ae = this.rList;
            while (ae) {
                // ae.skipRendering = this.skipRendering;
                ae.displayFrame(time, targetTime, forward);
                ae = ae.nextEntity;
            }

            // load entities from rList
            this.loadEntities(time, forward);
        }
        this.checkState();
    }

    loadEntities(time: number, forward: boolean) {
        //log(this.name, "loadEntities", time, forward);
        const m = this.getMarker(time);
        let startAes: AnimEntity[] | undefined, endAes: AnimEntity[] | undefined;

        if (m) {
            // console.log("marker @", time, m);
            startAes = forward ? m.startEntities : m.endEntities;
            endAes = forward ? m.endEntities : m.startEntities;
        }

        // add all new entities according to marker info
        if (startAes) {
            let idx = startAes.length, ae: AnimEntity;
            while (idx--) {
                ae = startAes[idx];
                if (!ae.isRunning) {
                    this.addEntity(ae); // will trigger a display frame
                }
            }
        }

        // remove all done entities according to marker info
        if (endAes) {
            let idx = endAes.length, ae: AnimEntity;
            while (idx--) {
                ae = endAes[idx];
                if (ae.isRunning) {
                    this.removeEntity(ae);
                }
            }
        }
    }

    getNextMarkerPosition(time: number, forward: boolean): number {
        // return the time position of the next marker in a given position
        // if no marker is found, -1 is returned

        // principle:
        // - find next in the running entity list
        // - if not found, look into own marker (will be redundant if already found in rList)
        if (Math.abs(time - this.currentTime) === FRAME_MS) {
            return time; // no need to dig into markers if we move to next frame
        }

        let n = forward ? MAX_TIME : -1, n2 = -1, ae = this.rList, found = false;
        while (ae) {
            n2 = ae.getNextMarkerPosition(time, forward);

            log(this.name, ": ae.getNextMarkerPosition for ", ae.name, " - time: target:", time, " -> marker:", n2);
            if (n2 > -1) {
                if (forward) {
                    // keep the min of the markers
                    if (time < n2 && n2 < n) {
                        n = n2;
                        found = true;
                    }
                } else {
                    // keep the max of the markers
                    if (time > n2 && n2 > n) {
                        n = n2;
                        found = true;
                    }
                }
            }
            ae = ae.nextEntity;
        }

        // look in the marker list
        let m = this.currentMarker;
        while (m) {
            if (forward) {
                if (m.time > time) {
                    if (found && n === m.time) {
                        this.currentMarker = m;
                        m = undefined;
                    } else if (m.time < n) {
                        // this marker is better positioned than n
                        n = m.time;
                        found = true;
                        m = m.prev; // see if prev is not closer to current time
                    } else {
                        m = undefined;
                    }
                } else {
                    m = m.next;
                }
            } else {
                if (m.time < time) {
                    if (found && n === m.time) {
                        this.currentMarker = m;
                        m = undefined;
                    } else if (m.time > n) {
                        // this marker is better positioned than n
                        n = m.time;
                        found = true;
                        m = m.next; // see if next is not closer to current time
                    } else {
                        m = undefined;
                    }
                } else {
                    m = m.prev;
                }
            }
        }

        // log(this.name, ": getNextMarkerPosition -> result = ", found ? n : -1)
        return found ? n : -1;
    }

    addEntity(ae: AnimEntity) {
        // this function is called through the calls done in the timeline function
        log(this.name, ": addEntity", ae.name, " @", this.currentTime);
        ASYNC_COUNTER++;
        if (!ae.startRegistered) {
            ae.init(this.currentTime);
            const m = this.createMarker(this.currentTime);
            if (!m.startEntities) {
                m.startEntities = [ae];
            } else {
                m.startEntities.push(ae);
            }
            ae.startRegistered = true;
        }

        ae.nextEntity = null;
        if (!this.rListEnd) {
            this.rList = ae;
            this.rListEnd = ae;
        } else {
            // append new entity at the end
            this.rListEnd.nextEntity = ae;
            this.rListEnd = ae;
        }
        ae.isRunning = true;
        // ae.skipRendering = this.skipRendering;
        ae.displayFrame(this.currentTime, this.lastTargetTime, this.lastTargetForward);
    }

    removeEntity(ae: AnimEntity) {
        log(this.name, ": removeEntity", ae.name, "@", this.currentTime);
        ASYNC_COUNTER++;
        let e = this.rList;
        if (!ae.endRegistered && this.lastTargetForward) {
            // only register the end in forward mode
            const m = this.createMarker(this.currentTime);
            if (!m.endEntities) {
                m.endEntities = [ae];
            } else {
                m.endEntities.push(ae);
            }
            ae.endRegistered = true;
        }
        if (e === ae) {
            this.rList = ae.nextEntity;
            if (this.rListEnd === ae) {
                this.rListEnd = null;
            }
        } else {
            while (e) {
                if (e.nextEntity === ae) {
                    e.nextEntity = ae.nextEntity;
                    if (this.rListEnd === ae) {
                        this.rListEnd = e;
                    }
                    e = null;
                } else {
                    e = e.nextEntity;
                }
            }
        }
        ae.isRunning = false;
    }

    /**
     * Retrieves the marker associated to the given time position.
     * 
     * Returns null if no marker is defined for this time.
     * 
     * @param time The time to retrieve the marker at.
     */
    getMarker(time: number): AnimMarker | undefined {
        let {currentMarker} = this;
        if (!currentMarker) return undefined;

        const forward = time >= currentMarker.time;
        while (currentMarker) {
            if (currentMarker.time === time) return currentMarker;

            // Warning: this part can be fragile (works only if currentMarker is well positioned)
            if (forward && (currentMarker.time <= time)) {
                currentMarker = currentMarker.next;
            } else if (!forward && (currentMarker.time >= time)) {
                currentMarker = currentMarker.prev;
            } else {
                currentMarker = undefined;
            }
        }

        return undefined;
    }

    /**
     * Retrieves an existing marker or creates a new one if none exists.
     * 
     * @param time The time position where the marker should be set
     * @param start [optional] Marker from which to start the search (used for recursion)
     */
    createMarker(time: number, start?: AnimMarker): AnimMarker {
        if (!this.firstMarker) {
            const marker = createMarker(time);
            this.firstMarker = this.lastMarker = this.currentMarker = marker;
            return marker;
        } else {
            const currentMarker = start || this.currentMarker!;

            let marker: AnimMarker | undefined;
            if (currentMarker.time === time) {
                return currentMarker;
            }
            if (time > currentMarker.time) {
                // look next
                marker = currentMarker.next;
                if (marker && marker.time <= time) {
                    return this.createMarker(time, marker);
                }
                // a new marker needs to be created
                marker = currentMarker.next = createMarker(time, currentMarker, currentMarker.next);
                if (this.lastMarker === currentMarker) {
                    this.lastMarker = marker;
                }
            } else {
                // look back
                marker = currentMarker.prev;
                if (marker && marker.time >= time) {
                    return this.createMarker(time, marker);
                }
                // a new marker needs to be created
                marker = currentMarker.prev = createMarker(time, currentMarker.prev, currentMarker);
                if (this.firstMarker === currentMarker) {
                    this.firstMarker = marker;
                }
            }

            this.currentMarker = marker;
            return marker;
        }
    }

    // this method can be overridden for specific contexts
    select(selector: Selector, scope?: SelectorContext): HTMLElement | null {
        if (!selector) return null;
        
        if (typeof selector === "string") {
            scope = scope || this.selectorCtxt;
            if (scope) {
                return scope!.querySelector(selector);
            }
        } else if (selector["style"]) {
            return selector;
        }
        
        return null;
    }

    selectAll(selector: Selector, scope?: SelectorContext): HTMLElement[] | null {
        if (typeof selector === "string") {
            scope = scope || this.selectorCtxt;
            if (scope) {
                return Array.from(scope!.querySelectorAll(selector));
            }
        } else if (selector["style"]) {
            return [selector];
        } else if (Array.isArray(selector)) {
            let result: HTMLElement[] = [];
            const {length} = selector;
            for (let index = 0; length > index; index++) {
                const result2 = this.selectAll(selector[index], scope);
                if (result2) {
                    result = result.concat(result2);
                }
            }
            return result;
        }

        return null;
    }

    random(min: number, max: number): number {
        return min + Math.trunc(Math.random() * (max + 1 - min));
    }

    defaults(params: ControlParams): void {
        if (params) {
            const newSettings = Object.create(this.settings);
            for (const k of Object.keys(params)) {
                newSettings[k] = params[k];
            }
            this.settings = newSettings;
        }
    }

    set(params: AnimateParams) {
        return this.animate({
            ...params,
            duration: 0
        });
    }

    /**
     * Starts an animation.
     * 
     * It takes a single parameter object, with the following properties: 
     * 
     * - `target`: a DOM element, or a selector to retrieve one
     * - timing: 
     *     - `duration`: the duration of the animation itself (it's between the `delay` and the `release`)
     *     - `delay`: the amount of delay to use before starting the playback of the animation
     *     - `release`: the amount of time to wait before considering the animation is over (after delay and duration have passed). It can be negative, which means that the animation would be considered over before delay and duration have passed.
     *     - `speed`: the speed factor to apply for the playback of the animation
     * - interpolation: 
     *     - `easing`: the timing function to use. An animation has a `from` source and a `to` target. Animations make the current value vary from `from` to `to`, over the specified duration. The easing function associates a time value (on the x axis) to a value within the range `[from, to]` (on the y-axis). The easing function receives two parameters: the current time, and the elasticity factor.
     *     - `elasticity`: a factor of elasticity, making the value _bounce_ around the end of the values interval, progressively converging to `to`. It is actually passed to the easing function as a second parameter, so the latter ust implement it.
     * 
     * @param params The parameter object, as described above.
     */
    async animate(params: AnimateParams): Promise<any> {
        // read all control args
        const defaults = this.settings;
        const target = parseValue("target", params, defaults) as Target;
        const easing = parseValue("easing", params, defaults) as Function;
        const speed = parseValue("speed", params, defaults) as number;
        // convertDuration
        const duration = convertDuration(parseValue("duration", params, defaults), speed);
        const delay = convertDuration(parseValue("delay", params, defaults), speed);
        const release = convertDuration(parseValue("release", params, defaults), speed);
        const elasticity = parseValue("elasticity", params, defaults) as number;

        // identify target
        let finalTarget: ResolvedTarget;
        if (isTargetFunction(target)) {
            finalTarget = target;
        } else {
            const targetElement = this.select(target);
            if (targetElement == null) {
                return console.log('[anim] invalid target selector: ' + target);
            }
            finalTarget = targetElement;
        }
    
        // identify properties/attributes to animate and create a tween for each of them
        const tween = createTweens(finalTarget, params, defaults, this, duration, easing, elasticity, delay, release);
        if (tween) {
            // return a promise associated to the last tween
            return new Promise((resolve) => {
                if (tween!.released) {
                    resolve();
                } else {
                    tween!.releaseCb = resolve;
                }
            });
        }
    }

    /**
     * Adds a delay entity to the timeline.
     * 
     * @param durationMs The duration of the delay in milliseconds
     */
    async delay(durationMs: number) {
        const duration = convertDuration(durationMs, this.settings.speed!);
        
        if (duration > 0) {
            const delay = new Delay(duration);
            delay.attach(this);
            return new Promise((resolve) => {
                delay.releaseCb = resolve;
            });
        }
        
        return;
    }

    async group(instructions: ((a: Anim) => void));
    async group(name: string, instructions: ((a: Anim) => void))
    /**
     * Adds a sub-timeline to the timeline.
     * 
     * It takes an animation function, such as what you pass to a Player constructor.
     * 
     * You can optionally name the group for debug purposes, otherwise the default name `"group"` is given.
     * 
     * @param nameOrInstructions 
     * @param instructions 
     */
    async group(nameOrInstructions: string | ((a: Anim) => void), instructions?: ((a: Anim) => void)) {
        let name;
        if (typeof nameOrInstructions === "string") {
            name = nameOrInstructions;
        } else {
            name = "group";
            instructions = nameOrInstructions as ((a: Anim) => void);
        }

        if (instructions) {
            const timeline = new TimeLine(name, instructions);
            timeline.attach(this);
            await timeline.releaseSignal();
            ASYNC_COUNTER++;
        }
    }

    /**
     * Convenience method to execute given animation functions in sequence.
     * 
     * @param blocks The sequence of animation functions.
     */
    async sequence(...blocks: Instructions[]): Promise<any> {
        const length = blocks.length;
        if (!length) return;

        await this.group("sequence", async function (a) {
            for (let index = 0; length > index; index++) {
                await a.group("block." + index, blocks[index]);
                ASYNC_COUNTER++;
            }
        });

        ASYNC_COUNTER++;
    }

    /**
     * Convenience method to execute given animation functions in parallel.
     * 
     * @param blocks The set of animation functions.
     */
    async parallelize(...tracks: ((a: Anim) => void)[]): Promise<any> {
        const length = tracks.length;
        if (!length) return;
        
        await this.group("tracks", a => {
            for (let index = 0; length > index; index++) {
                a.group("track." + index, tracks[index]);
            }
        });

        ASYNC_COUNTER++;
    }

    async iterate(
        targetsOrParams: Selector | IterationParams,
        instructions: (a: Anim, idx: number, total: number, e: HTMLElement) => void | Promise<any>,
    ) {
        let targets: Selector, inSequence = false

        if ((targetsOrParams as any).targets !== undefined) {
            targets = (targetsOrParams as IterationParams).targets;
            inSequence = (targetsOrParams as IterationParams).sequence === true
        } else {
            targets = targetsOrParams as Selector;
        }

        const elements = this.selectAll(targets);
        if (!elements) return;

        const length = elements.length;
        if (length) {
            await this.group("iteration", async function (a1: Anim) {
                for (let index = 0; length > index; index++) {
                    const group = a1.group("item." + index, async function (a2) {
                        const e = elements![index];
                        a2.defaults({ target: e });
                        await instructions(a2, index, length, e);
                    });
                    if (inSequence) {
                        await group;
                        ASYNC_COUNTER++;
                        // log(">> release received: ", i);
                    }
                }
            });

            ASYNC_COUNTER++;
        }
    }

    /**
     * Convenience method to execute the given animation function the given number of times.
     * 
     * @param times 
     * @param instructions 
     */
    async repeat(times: number, instructions: ((a: Anim, loopCount: number) => void)) {
        if (times > 0) {
            await this.group("loop", async function (a) {
                for (let index = 0; times > index; index++) {
                    await a.group("block", async function (a2) {
                        await instructions(a2, index);
                    });
                    ASYNC_COUNTER++;
                }
            });
            ASYNC_COUNTER++;
        }
    }

    async play(instructions: ((a: Anim) => void));
    async play(params: PlayParams, instructions: ((a: Anim) => void))
    async play(paramsOrInstructions: PlayParams | ((a: Anim) => void), instructions?: ((a: Anim) => void)) {
        let params: PlayParams | undefined;
        if (typeof paramsOrInstructions === "object") {
            params = paramsOrInstructions;
        } else {
            instructions = paramsOrInstructions as ((a: Anim) => void);
        }

        if (instructions) {
            const tl = new TimeLine("playTimeline", instructions);
            tl.selectorCtxt = this.selectorCtxt;
            const p = new PlayerEntity(tl, this.settings, params);
            p.attach(this);
            return new Promise((resolve) => {
                p.releaseCb = resolve;
            });
        }
        return;
    }
}

function createMarker(time: number, prev?: AnimMarker, next?: AnimMarker): AnimMarker {
    return {
        prev: prev,
        next: next,
        time: time,
        startEntities: undefined,
        endEntities: undefined
    }
}

const LENGTH_UNPROCESSED = -2;
let PLAY_COUNT = 0;

function nextTimeTick(t1: number, forward: boolean, speed: number) {
    if (t1 < 0) return 0;

    const t2 = forward ? t1 + FRAME_MS * speed : t1 - FRAME_MS * speed;
    return t2 < 0 ? 0 : t2;
}

/**
 * A Player is responsible for handling the playback of an animation.
 * 
 * @param animFunction The animation function, which uses the provided API to execute animation steps.
 * @param animFunctionArgs Optional, a list of arguments to be passed to the animation function behind the first argument (which is the API). 
 */
export class Player implements AnimPlayer {
    /**
     * The maximum duration to calculate the duration of the animation in milliseconds.
     * 
     * Defaults to 600 000ms.
     * 
     * @see `duration`
     */
    maxDuration: number = MAX_TL_DURATION_MS;
    protected timeLine: TimeLine;
    protected currentTick = -1;
    protected length = LENGTH_UNPROCESSED;
    private playId = 0;

    constructor(
        public animFunction: (a: Anim, ...args: any[]) => any,
        animFunctionArgs?: any[]
    ) {
        this.timeLine = new TimeLine("root", animFunction, animFunctionArgs);

        if (typeof document !== "undefined") {
            this.timeLine.selectorCtxt = document;
        }
    }

    /**
     * Starts playing the animation using the given options.
     * 
     * Options are passed as a single object parameter, with the following properties, all optional: 
     * 
     * - `onupdate`: a callback called every time the interpolation is committed. It receives the current time.
     * - `forward`: if not given, `true` be default, otherwise if falsy will make the animation play backwards
     * - `speed`: the speed to play the animation at; it's a factor
     * - `raf`: a custom `requestAnimationFrame`-like function. Might be useful for specific platforms or contexts

     * @param args The options object as described above. This argument itself is optional.
     */
    async play(args?: PlayArguments): Promise<number> {
        let onUpdate: ((time: number) => void) | undefined;
        let speed = 1;
        let fwd = true;
        let raf: ((callback: (time: number) => void) => void) | undefined;

        if (args) {
            onUpdate = args.onupdate;
            raf = args.raf;
            fwd = (args.forward !== undefined) ? !!args.forward : true;
            speed = args.speed || 1;
        }
        raf = raf || window.requestAnimationFrame;

        return new Promise<number>((resolve) => {
            const {timeLine} = this;
            const playId = ++PLAY_COUNT;
            this.playId = playId;

            const paint = async () => {
                const t1 = timeLine.currentTime;
                const t2 = nextTimeTick(timeLine.currentTime, fwd, speed);

                if (this.playId !== playId) {
                    // play was stopped or restarted in the meantime
                    return resolve(t1);
                }
                
                await timeLine.move(t2)
                const currentTime = timeLine.currentTime;
                
                if (onUpdate && currentTime !== t1) {
                    onUpdate(currentTime);
                }

                if ((fwd && timeLine.endTime === currentTime) || !fwd && currentTime === 0) {
                    resolve(currentTime);
                    this.playId = 0;
                } else {
                    raf!(paint);
                }
            }
            paint();
        });
    }

    /**
     * Pauses the animation. That way you can start it again later on without losing the position.
     */
    pause() {
        this.playId = 0;
    }

    /**
     * Stops the animation, resetting the position to the start.
     */
    async stop(): Promise<number> {
        this.playId = 0;
        return this.timeLine.move(0);
    }

    /**
     * Jumps to the specific given point in time inside the underlying timeline.
     * 
     * @param timeTarget The target point in time
     */
    async move(timeTarget) {
        return this.timeLine.move(timeTarget);
    }

    /**
     * Returns the duration of this animation, in milliseconds.
     * 
     * To know it, the player needs to run the animation fully once and only once, thus executing the animation functions which eventually provide the timing information.
     * 
     * However, it doesn't apply the requested timings in order to make the animation instant.
     */
    async duration(): Promise<number> {
        // TODO support infinite duration
        if (this.length === LENGTH_UNPROCESSED) {
            const {position} = this;
            // Skipping rendering leads to wrong results for
            // animations that rely on reading the current
            // value from the DOM

            // this.timeLine.skipRendering = true;
            await this.runTicker();
            this.length = this.timeLine.currentTime;
            await this.move(position); // move back to original position
            // this.timeLine.skipRendering = false;
        }
        return this.length;
    }

    /**
     * The current time in the underlying timeline, in milliseconds.
     */
    get position(): number {
        const {currentTime} = this.timeLine;
        return currentTime < 0 ? 0 : currentTime;
    }

    /**
     * Whether this player instance is currently playing (`true`) or not (`false`).
     */
    get isPlaying(): boolean {
        return this.playId !== 0;
    }

    private async runTicker() {
        const {timeLine} = this;
        const max = Math.trunc(this.maxDuration / FRAME_MS);
        let count = 0;
        while (count < max) {
            count++;
            this.currentTick++;
            await timeLine.move(this.currentTick * FRAME_MS);
            if (timeLine.endTime === timeLine.currentTime) {
                return; // done
            }
        }
    }
}
