import { ControlParams, AnimEntity, AnimContainer, PlayParams, TweenType, ResolvedTarget, isTargetFunction } from "./types";
import { parseValue, log, getAnimationType, dom } from './utils';
import { ValueInterpolator } from './interpolators/types';
import { createInterpolator } from './interpolators';

const trunc = Math.trunc, ceil = Math.ceil;
let AE_COUNT = 0;

/**
 * A timeline entity.
 */
abstract class TimelineEntity implements AnimEntity {
    // Implemented properties

    name: string;
    nextEntity: AnimEntity | null;
    isRunning = false;
    startRegistered = false;
    endRegistered = false;
    // skipRendering = false;
    released = false;
    done = false;

    // Specific properties

    /**
     * The parent this entity is attached to.
     */
    parent: AnimContainer | undefined;

    /**
     * The delay duration to use to run this timeline.
     */
    delay = 0;

    /**
     * The release duration to use to run this timeline.
     */
    release = 0;

    /**
     * The specified duration of this timeline.
     */
    duration = -1;

    /**
     * The specified start time of this timeline.
     */
    startTime = -1;

    /**
     * The specified end time of this timeline.
     */
    endTime = -1;

    /**
     * The actual start time of this timeline given the specified start time and delay duration.
     */
    delayedStartTime = -1;

    /**
     * The actual end time of this timeline given the specified end time and release duration.
     */
    delayedEndTime = -1;

    /**
     * The actual time of the end of the movement, but not the one of the timeline.
     * It considers the delayed start time and the specified duration, but not the specified release time. 
     */
    doneTime = -1;

    /**
     * A callback that can be specified to be called when the timeline has completely ended, meaning it reached the delayed end time.
     */
    releaseCb: (() => void) | null = null;

    constructor(name) {
        this.name = name;
    }

    attach(parent: AnimContainer) {
        if (!this.parent) {
            parent.addEntity(this);
            this.parent = parent;
        }
    }

    init(startTime: number) {
        this.startTime = startTime;

        if (this.delay < 0) {
            this.delay = 0;
        }

        this.delayedStartTime = startTime + this.delay;
        
        if (this.duration >= 0) {
            // doneTime occurs when movement finishes - but this is not necessarily the end of the animation
            const doneTime = this.delayedStartTime + this.duration;
            this.doneTime = doneTime;
            
            this.delayedEndTime = doneTime + this.release;
            if (this.delayedEndTime < this.delayedStartTime) {
                this.release = -this.duration;
                // release cannot be bigger than duration
                this.delayedEndTime = this.delayedStartTime;
            }

            this.endTime = doneTime;
            if (this.delayedEndTime > this.endTime) {
                this.endTime = this.delayedEndTime;
            }
        }
    }

    checkDoneAndRelease(time: number, forward: boolean) {
        // log(this.name, "checkDoneAndRelease")
        if (time === this.doneTime) {
            this.done = true;
        }

        if (this.done && this.parent) {
            if ((forward && time === this.endTime) || (!forward && time === this.startTime)) {
                this.parent.removeEntity(this);
            }
        }

        if (time === this.delayedEndTime) {
            this.released = true;
            if (this.releaseCb) {
                this.releaseCb();
                this.releaseCb = null;
            }
        }
    }

    getNextMarkerPosition(time: number, forward: boolean): number {
        // log(this.name, ": next frame pos", time);
        // tween has 2 or 3 markers
        // - if release has already been triggered (i.e. tween doesn't run for the 1st time):
        //         delayTime <= doneTime
        // - if first time, releaseTime needs to be included, and we have 2 options:
        //         delayTime <= releaseTime <= doneTime (release<=0)
        //     or  delayTime <= doneTime <= releaseTime (release>0)
        if (forward) {
            if (time < this.delayedStartTime) return this.delayedStartTime;

            if (!this.releaseCb) {
                if (time < this.doneTime) return this.doneTime;
                return -1;
            } else {
                // 1st time
                if (this.release <= 0) {
                    if (time < this.delayedEndTime) return this.delayedEndTime;
                    if (time < this.doneTime) return this.doneTime;
                    return -1;
                } else {
                    if (time < this.doneTime) return this.doneTime;
                    if (time < this.delayedEndTime) return this.delayedEndTime;
                    return -1;
                }
            }
        } else {
            // backward - nb: releaseCb doesn't need to be checked in this case
            if (time > this.doneTime) return this.doneTime;
            if (time > this.delayedStartTime) return this.delayedStartTime;
            return -1;
        }
    }

    displayFrame(time: number, targetTime: number, forward: boolean) {
        this.checkDoneAndRelease(time, forward);
    }
}

/**
 * Creates a set of tweens to animate each of the given properties.
 * 
 * @param params The set of properties passed to the animation (also includes actual configuration parameters)
 * @param settings The set of default configuration parameters, used to detect whether the iterated property in `params` is a parameter (to ignore) or a property to animate.
 * @param parent The parent entity to attach the tween to.
 * 
 * @param target Forwarded to `Tween`
 * @param duration Forwarded to `Tween`
 * @param easing Forwarded to `Tween`
 * @param elasticity Forwarded to `Tween`
 * @param delay Forwarded to `Tween`
 * @param release Forwarded to `Tween`
 */
export function createTweens(
    target: ResolvedTarget,
    params,
    settings,
    parent,
    duration: number,
    easing: Function,
    elasticity: number,
    delay: number,
    release: number
) {
    return Object.keys(params)
        .filter(param => settings[param] === undefined && param !== 'target')
        .reduce((lastTween, param) => {
            // TODO share init results across all tweens of a same family
            const tween = new Tween(target, param, params[param], duration, easing, elasticity, delay, release);

            if (!tween.isValid) {
                return lastTween;
            }

            tween.attach(parent);
            return tween;
        }, null);
}

/**
 * An entity used to animated a single property.
 */
export class Tween extends TimelineEntity {
    /**
     * Whether this tween is valid or not.
     */
    isValid = true;

    /**
     * The animation type based on what property this tween is responsible for.
     */
    type: TweenType;

    /**
     * The interpolator used to animate the property this tween is responsible for.
     */
    interpolator: ValueInterpolator | null;

    constructor(
        public target: ResolvedTarget,
        public propName: string,
        propValue,
        public duration: number,
        public easing,
        public elasticity: number,
        delay: number,
        release: number
    ) {
        // todo normalize from / to, support colors, etc.
        super("tween#" + ++AE_COUNT);
        this.delay = delay;
        this.release = release;
        const r = this.parsePropValue(propValue);
        if (r !== 0) {
            console.error("[animate] invalid syntax (Error " + r + ")");
            this.isValid = false;
        }
    }

    /**
     * Extracts the value from the property this tween is responsible for.
     * 
     * During this process, the property is analyzed and therefore the animation type is determined, and a proper interpolator is created.
     * 
     * @param propValue The value to interpret using 
     * 
     * @return 0 if process went fine, an error code otherwise.
     */
    parsePropValue(propValue): number {
        // - define tween type: style, attribute or transform
        // - get to value & unit, determine if relative (i.e. starts with "+" or "-")
        // - get from value (unit should be the same as to)
        // - identify value type (dimension, color, unit-less)
        const {target, propName} = this;
        const type = getAnimationType(target, propName);
        this.type = type;

        if (type === 'invalid') return 100;

        let fromValueIsInDom = false;
        let propFrom: any;
        let propTo: any;

        if (Array.isArray(propValue)) {
            if (propValue.length !== 2) return 101;

            propFrom = '' + propValue[0];
            propTo = '' + propValue[1];
        } else {
            fromValueIsInDom = true;

            if (isTargetFunction(target)) {
                propFrom = '';
            } else {
                propFrom = '' + dom.getValue(target, propName, type);
            }
            propTo = '' + propValue;
        }

        this.interpolator = createInterpolator(propFrom, propTo, {
            fromIsDom: fromValueIsInDom,
            propName,
            type
        })
        return this.interpolator ? 0 : 102;
    }

    displayFrame(time: number, targetTime: number, forward: boolean) {
        log(this.name, ": display frame", time, targetTime, forward)

        if (this.delayedStartTime <= time && time <= this.endTime) {
            // if (!this.skipRendering) {
                const targetFrame = time === targetTime;
                if ((targetFrame && this.delayedStartTime <= time && time <= this.doneTime)) {
                    this.setProgression(time - this.delayedStartTime);
                } else if (!targetFrame) {
                    if (forward && targetTime >= this.doneTime && time === this.doneTime) {
                        this.setProgression(time - this.delayedStartTime);
                    } else if (!forward && targetTime <= this.delayedStartTime && time === this.delayedStartTime) {
                        this.setProgression(0);
                    }
                }
            // }
            this.checkDoneAndRelease(time, forward);
        }
    }

    setProgression(elapsed: number) {
        const {target} = this;
        
        if (!target || !this.isValid) return;
        
        const {duration} = this;
        const progression = duration === 0 ? 1 : elapsed / duration;
        const easing = this.easing(progression, this.elasticity);
        const value = this.interpolator!.getValue(easing);

        if (isTargetFunction(target)) {
            target({ property: this.propName, value })
        } else {
            dom.setValue(target, this.propName, this.type, value);
        }
    }
}

/**
 * A simple delay entity, with no associated animation at all.
 */
export class Delay extends TimelineEntity {
    constructor(duration: number) {
        super("delay");
        this.delay = duration;
        this.duration = 0;
    }
}

interface AnimTimeLine {
    doneCb: ((time: number) => void) | undefined;
    move(timeTarget: number, manageAsyncPipe?: boolean): Promise<number>
    getNextMarkerPosition(time: number, forward: boolean): number;
}

/**
 * A player entity, capable of running a timeline entity, forward, backward, at different speeds, looping, etc.
 */
export class PlayerEntity extends TimelineEntity {
    timeLine: AnimTimeLine;
    alternate = false;
    times = 1;
    speed = 1;
    backSpeed = 1;
    d1 = -1; // duration of part 1 (= fwd part of a cycle)
    d2 = -1; // duration of part 2 (= backward part of a cycle)

    constructor(timeline: AnimTimeLine, defaults: ControlParams, params?: PlayParams) {
        super("play");
        
        this.timeLine = timeline;

        if (params) {
            this.times = params.times || 1;
            this.alternate = params.alternate || false;
            this.speed = params.speed || 1;
            this.backSpeed = params.backSpeed || 1;
            this.delay = parseValue("delay", params, defaults) as number;
            this.release = parseValue("release", params, defaults) as number;
        }

        timeline.doneCb = tlDuration => {
            this.d1 = trunc(tlDuration / this.speed);
            this.d2 = this.alternate ? trunc(tlDuration / this.backSpeed) : 0;
            this.duration = (this.d1 + this.d2) * this.times;
            this.init(this.startTime);
        }
    }

    getNextMarkerPosition(time: number, forward: boolean): number {
        const {timeLine} = this;
        const start = this.delayedStartTime;

        if (this.duration === -1) {
            // first cycle is not finished
            if (time < this.delayedStartTime) return forward ? this.delayedStartTime : -1;

            const extendedTimeline = timeLine as any;
            if (forward !== extendedTimeline.lastTargetForward) {
                // direction changed, we need to trigger load of previous entities
                extendedTimeline.loadEntities(extendedTimeline.currentTime, forward);
            }
            
            const markerPosition = timeLine.getNextMarkerPosition(
                (time - start) * this.speed,
                forward,
            );

            return (markerPosition === -1)
                ? -1
                : start + ceil(markerPosition / this.speed);
        } else {
            // d1, d2 and duration are defined (cf. doneCb)
            const marker1 = super.getNextMarkerPosition(time, forward);
            let marker2 = -1;
            if (marker1 >= this.delayedStartTime && marker1 <= this.doneTime) {
                const {d1} = this;
                const cycleLength = trunc(d1 + this.d2);
                const relativeTime = time - start;
                const boundedTime = relativeTime % cycleLength;
                const numberOfFullCycles = trunc(relativeTime / cycleLength);

                if (boundedTime < d1) {
                    // forward part
                    marker2 = timeLine.getNextMarkerPosition(
                        boundedTime * this.speed,
                        forward,
                    );
                    if (marker2 !== -1) {
                        marker2 = start
                            + numberOfFullCycles * cycleLength
                            + ceil(marker2 / this.speed);
                    }
                } else {
                    // backward part
                    marker2 = timeLine.getNextMarkerPosition(
                        (cycleLength - boundedTime) * this.backSpeed,
                        !forward,
                    );
                    if (marker2 !== -1) {
                        marker2 = start
                            + numberOfFullCycles * cycleLength
                            + d1
                            + ceil((d1 - marker2) / this.backSpeed);
                    }
                }
            }
            
            log("getNextMarkerPosition: d1=", this.d1, "d2=", this.d2, "m1=", marker1, "m2=", marker2, "doneTime", this.doneTime);
            
            if (marker2 === -1) return marker1;
            if (marker1 === -1) return marker2;

            if (forward) {
                return (marker2 < marker1) ? marker2 : marker1;
            } else {
                return (marker2 > marker1) ? marker2 : marker1;
            }
        }
    }

    displayFrame(time: number, targetTime: number, forward: boolean) {
        if (this.delayedStartTime <= time) {
            const {timeLine} = this;

            if (this.duration === -1) {
                // first cycle is not finished
                timeLine.move(
                    (time - this.delayedStartTime) * this.speed,
                    false,
                );
            } else {
                // d1, d2 and duration are defined (cf. doneCb)
                if (time >= this.delayedStartTime && time <= this.doneTime) {
                    const cycleLength = trunc(this.d1 + this.d2);

                    let boundedTime = (time - this.delayedStartTime) % cycleLength;
                    if (boundedTime === 0 && time !== this.delayedStartTime) {
                        boundedTime = cycleLength;
                    }
                    if (boundedTime <= this.d1) {
                        // forward part
                        timeLine.move(boundedTime * this.speed, false);
                    } else {
                        // backward part
                        timeLine.move(
                            (cycleLength - boundedTime) * this.backSpeed,
                            false,
                        );
                    }
                }
            }
        }
        
        this.checkDoneAndRelease(time, forward);
    }
}
