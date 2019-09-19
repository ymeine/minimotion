import { ControlParams, AnimEntity, AnimContainer, PlayParams, TweenType, ResolvedTarget, GetValue, SetValue, InitProperties, ApplyProperties } from "./types";
import { parseValue, log, getAnimationType, dom } from './utils';
import { ValueInterpolator } from './interpolators/types';
import { createInterpolator } from './interpolators';

const trunc = Math.trunc, ceil = Math.ceil;
let AE_COUNT = 0;

abstract class TimelineEntity implements AnimEntity {
    name: string;
    nextEntity: AnimEntity | null;
    isRunning = false;
    startRegistered = false;
    endRegistered = false;
    // skipRendering = false;
    released = false;
    done = false;
    parent: AnimContainer | undefined;
    delay = 0;
    release = 0;
    duration = -1;
    startTime = -1;
    delayTime = -1;
    releaseTime = -1;
    doneTime = -1;
    endTime = -1;
    releaseCb: (() => void) | null = null;

    constructor(name) {
        this.name = name;
    }

    attach(parent: AnimContainer) {
        if (!this.parent) {
            this.parent = parent;
            this.parent.addEntity(this);
        }
    }

    init(startTime: number) {
        this.startTime = startTime;
        if (this.delay < 0) {
            this.delay = 0;
        }
        this.delayTime = startTime + this.delay;
        if (this.duration >= 0) {
            const doneTime = this.delayTime + this.duration; // doneTime occurs when movement finishes - but this is not necessarily the end of the animation
            this.doneTime = doneTime;
            this.releaseTime = doneTime + this.release;
            if (this.releaseTime < this.delayTime) {
                this.release = -this.duration;
                this.releaseTime = this.delayTime; // release cannot be bigger than duration
            }
            this.endTime = doneTime;
            if (this.releaseTime > this.endTime) {
                this.endTime = this.releaseTime;
            }
        }
    }

    checkDoneAndRelease(time: number, forward: boolean) {
        // log(this.name, "checkDoneAndRelease")
        if (time === this.doneTime) {
            this.done = true;
        }
        if (this.done && this.parent) {
            if (forward && time === this.endTime) {
                this.parent.removeEntity(this);
            } else if (!forward && time === this.startTime) {
                this.parent.removeEntity(this);
            }
        }
        if (time === this.releaseTime) {
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
            if (time < this.delayTime) return this.delayTime;

            if (this.releaseCb) {
                // 1st time
                if (this.release <= 0) {
                    if (time < this.releaseTime) return this.releaseTime;
                    if (time < this.doneTime) return this.doneTime;
                    return -1;
                } else {
                    if (time < this.doneTime) return this.doneTime;
                    if (time < this.releaseTime) return this.releaseTime;
                    return -1;
                }
            } else {
                if (time < this.doneTime) return this.doneTime;
                return -1;
            }
        } else {
            // backward - nb: releaseCb doesn't need to be checked in this case
            if (time > this.doneTime) return this.doneTime;
            if (time > this.delayTime) return this.delayTime;
            return -1;
        }
    }

    displayFrame(time: number, targetTime: number, forward: boolean) {
        this.checkDoneAndRelease(time, forward);
    }
}

export function createTweens(
    target: ResolvedTarget,
    initProperties: InitProperties,
    applyProperties: ApplyProperties,
    params,
    settings,
    parent,
    duration: number,
    easing: Function,
    elasticity: number,
    delay: number,
    release: number
) {
    const propertiesSpecs = Object.keys(params)
        .filter(property => !settings.hasOwnProperty(property) && property !== 'target')
        .reduce((output, property) => (output[property] = params[property], output), {});

    const tween = new TweenGroup(
        target,
        propertiesSpecs,
        initProperties,
        applyProperties,
        duration,
        easing,
        elasticity,
        delay,
        release,
    );
    tween.attach(parent);
    return tween;
}

export class TweenGroup extends TimelineEntity {
    isValid = true;
    private tweens: Tween[];
    private properties: Object = {};
    private propertiesSet = {};

    constructor(
        private target: ResolvedTarget,
        propertiesSpecs,
        initProperties: InitProperties,
        private applyProperties: ApplyProperties,
        public duration: number,
        easing,
        elasticity: number,
        public delay: number,
        public release: number
    ) {
        super("tween-group#" + ++AE_COUNT);

        let getValue;
        if (initProperties != null) {
            initProperties(this.properties, target);
            getValue = property => this.properties[property];
        } else {
            getValue = (property, target, type) => {
                const value = dom.getValue(property, target, type);
                this.properties[property] = value;
                return value;
            };
        }

        let setValue;
        if (applyProperties != null) {
            setValue = (property, target, type, value) => {
                this.properties[property] = value;
            };
        } else {
            const propertiesTypes = {};

            setValue = (property, target, type, value) => {
                this.propertiesSet[property] = true;
                this.properties[property] = value;
                propertiesTypes[property] = type;
            };

            this.applyProperties = (properties, target) => {
                for (const [property, value] of Object.entries(properties)) {
                    if (this.propertiesSet[property]) {
                        dom.setValue(property, target, propertiesTypes[property], value);
                    }
                }
            };
        }

        this.tweens = Object.entries(propertiesSpecs)
            .map(([propName, propSpec]) => new Tween(
                target,
                getValue,
                setValue,
                propName,
                propSpec,
                duration,
                easing,
                elasticity,
            ))
            .filter(tween => tween.isValid);
    }
    
    displayFrame(time: number, targetTime: number, forward: boolean) {
        if (time >= this.delayTime && time <= this.endTime) {
            let progression;
            const targetFrame = time === targetTime;
            if ((targetFrame && this.delayTime <= time && time <= this.doneTime)) {
                progression = time - this.delayTime;
            } else if (!targetFrame) {
                if (forward && targetTime >= this.doneTime && time === this.doneTime) {
                    progression = time - this.delayTime;
                } else if (!forward && targetTime <= this.delayTime && time === this.delayTime) {
                    progression = 0;
                }
            }

            if (progression != null) {
                this.tweens.forEach(tween => tween.setProgression(progression));
                (this.applyProperties)(this.properties, this.target);
            };

            this.checkDoneAndRelease(time, forward);
        }

        this.propertiesSet = {};
    }
}

export class Tween {
    isValid = true;
    type: TweenType;
    interpolator: ValueInterpolator | null;

    constructor(
        public target: ResolvedTarget,
        public getValue: GetValue,
        public setValue: SetValue,
        public propName: string,
        propValue,
        public duration: number,
        public easing,
        public elasticity: number,
    ) {
        // todo normalize from / to, support colors, etc.
        const r = this.parsePropValue(propValue);
        if (r !== 0) {
            console.error("[animate] invalid syntax (Error " + r + ")");
            this.isValid = false;
        }
    }

    // return 0 if ok
    parsePropValue(propValue): number {
        // - define tween type: style, attribute or transform
        // - get to value & unit, determine if relative (i.e. starts with "+" or "-")
        // - get from value (unit should be the same as to)
        // - identify value type (dimension, color, unit-less)
        const target = this.target,
            propName = this.propName,
            type = this.type = getAnimationType(target, propName);

        let fromIsDom = false;
        let propFrom: any, propTo: any;
        if (Array.isArray(propValue)) {
            if (propValue.length !== 2) return 101;
            propFrom = '' + propValue[0];
            propTo = '' + propValue[1];
        } else {
            fromIsDom = true;
            propFrom = '' + (this.getValue)(
                propName,
                target,
                type,
            );
            propTo = '' + propValue;
        }

        this.interpolator = createInterpolator(propFrom, propTo, {
            fromIsDom,
            propName,
            type
        })
        return this.interpolator ? 0 /* ok */ : 102 /* invalid */;
    }

    setProgression(elapsed: number) {
        const target = this.target;
        if (!this.isValid) return;
        const d = this.duration,
            progression = d === 0 ? 1 : elapsed / d,
            easing = this.easing(progression, this.elasticity),
            value = this.interpolator!.getValue(easing);
        (this.setValue)(
            this.propName,
            target,
            this.type,
            value,
        );
    }
}

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
        const tl = this.timeLine, start = this.delayTime;
        if (this.duration === -1) {
            // first cycle is not finished
            if (time < this.delayTime) return forward ? this.delayTime : -1;

            if (forward !== (tl as any).lastTargetForward) {
                // direction changed, we need to trigger load of previous entities
                (tl as any).loadEntities((tl as any).currentTime, forward);
            }
            const m = tl.getNextMarkerPosition((time - start) * this.speed, forward);
            return (m === -1) ? -1 : start + ceil(m / this.speed);
        } else {
            // d1, d2 and duration are defined (cf. doneCb)
            const m1 = super.getNextMarkerPosition(time, forward);
            let m2 = -1;
            if (m1 >= this.delayTime && m1 <= this.doneTime) {
                const d1 = this.d1, cycleLength = trunc(d1 + this.d2),
                    relTime = time - start,
                    t = relTime % cycleLength,
                    nbrOfFullCycles = trunc(relTime / cycleLength);
                if (t < d1) {
                    // forward part
                    m2 = tl.getNextMarkerPosition(t * this.speed, forward);
                    if (m2 !== -1) {
                        m2 = start + nbrOfFullCycles * cycleLength + ceil(m2 / this.speed);
                    }
                } else {
                    // backward part
                    m2 = tl.getNextMarkerPosition((cycleLength - t) * this.backSpeed, !forward);
                    if (m2 !== -1) {
                        m2 = start + nbrOfFullCycles * cycleLength + d1 + ceil((d1 - m2) / this.backSpeed);
                    }
                }
            }
            log("getNextMarkerPosition: d1=", this.d1, "d2=", this.d2, "m1=", m1, "m2=", m2, "doneTime", this.doneTime);
            if (m2 === -1) return m1;
            if (m1 === -1) return m2;
            if (forward) {
                return (m2 < m1) ? m2 : m1;
            } else {
                return (m2 > m1) ? m2 : m1;
            }
        }
    }

    displayFrame(time: number, targetTime: number, forward: boolean) {
        if (this.delayTime <= time) {
            const tl = this.timeLine;
            if (this.duration === -1) {
                // first cycle is not finished
                tl.move((time - this.delayTime) * this.speed, false);
            } else {
                // d1, d2 and duration are defined (cf. doneCb)
                if (time >= this.delayTime && time <= this.doneTime) {
                    const cycleLength = trunc(this.d1 + this.d2);
                    let t = (time - this.delayTime) % cycleLength;
                    if (t === 0 && time !== this.delayTime) {
                        t = cycleLength;
                    }
                    if (t <= this.d1) {
                        // forward part
                        tl.move(t * this.speed, false);
                    } else {
                        // backward part
                        tl.move((cycleLength - t) * this.backSpeed, false);
                    }
                }
            }
        }
        this.checkDoneAndRelease(time, forward);
    }
}
