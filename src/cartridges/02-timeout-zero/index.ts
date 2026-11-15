import { simulate } from '../../core/sim.ts';
import type { Cartridge } from '../../core/types.ts';
import code from './code.js?raw';
import program, { meta } from './program.ts';
import verified from './verified.json';

const cartridge: Cartridge = { ...meta, code, run: simulate(program), verified };

export default cartridge;
