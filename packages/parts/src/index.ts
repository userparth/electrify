import { analogParts } from './parts/analog';
import { arduinoParts } from './parts/arduino';
import { rpiParts } from './parts/rpi';
import { picoParts } from './parts/pico';
import { powerParts } from './parts/power';
import { icParts } from './parts/ics';
import { battery, breadboard, led, resistor } from './parts/core';
import { digitalParts } from './parts/digital';
import { instrumentParts } from './parts/instruments';
import { scopeParts } from './parts/scope';
import type { PartDef } from './types';

export * from './types';
export * from './units';
export * from './draw';

export const PARTS: PartDef<any>[] = [breadboard, battery, resistor, led, ...analogParts, ...digitalParts, ...instrumentParts, ...scopeParts, ...arduinoParts, ...rpiParts, ...picoParts, ...powerParts, ...icParts];
const byType = new Map(PARTS.map(p => [p.type, p]));
export const getPart = (type: string): PartDef<any> | undefined => byType.get(type);
export { prunePicos } from './parts/pico';
export type { FirmwareHost, PicoFirmware } from './mcu/rp2040';
