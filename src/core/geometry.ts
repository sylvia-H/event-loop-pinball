// 機器的幾何。場景照這裡畫出靜態的機器，viewAt 照這裡算出彈珠的位置，兩邊才會對得上。
// 座標：x 往右、y 往上，整台機器落在 x ∈ [-7.2, 7.2]、y ∈ [-4.2, 4.2]。

import type { Lane } from './types.ts';

export interface Pt {
  x: number;
  y: number;
}

/** 彈珠的半徑 */
export const BALL_R = 0.34;

/** event loop 的中心，也是機械臂的軸心 */
export const HUB: Pt = { x: 1.4, y: -0.2 };

/** 主管（call stack）：直立的透明管子，彈珠從上面進、從上面出 */
export const STACK = {
  x: -5.2,
  bottom: -3.0,
  top: 3.0,
  width: 1.1,
  /** 相鄰兩顆彈珠的間距 */
  gap: 0.86,
  /** 管口上方：彈珠進出時經過的點 */
  mouth: { x: -5.2, y: 3.6 } as Pt,
};

/** 內圈快軌（microtask）：繞著 HUB 的圓 */
export const MICRO = { r: 1.55 };

/** 超車道（process.nextTick）：比內圈更裡面的小圓 */
export const TICK = { r: 0.85 };

/** 外圈輸送帶（macrotask）：繞著 HUB 的橢圓 */
export const MACRO = { rx: 4.5, ry: 3.0 };

/** setImmediate 的支線：外圈下緣外側的一段弧 */
export const IMMEDIATE = { rx: 5.2, ry: 3.7, from: 250, to: 320 };

/** 計時器架：右上角的一排掛勾 */
export const TIMERS = { x: 6.2, y: 3.7, gap: 0.86 };

/** 各條隊伍的「取球點」角度（度）：機械臂從這裡夾球；隊伍從這個角度往順時針方向排 */
export const PICKUP_DEG = 180;
/** 隊伍裡相鄰兩顆彈珠在各軌道上相隔的角度（度） */
export const SLOT_DEG: Record<'micro' | 'macro' | 'tick', number> = { micro: 30, macro: 13, tick: 52 };

const rad = (deg: number) => (deg * Math.PI) / 180;
const onEllipse = (rx: number, ry: number, deg: number): Pt => ({
  x: HUB.x + rx * Math.cos(rad(deg)),
  y: HUB.y + ry * Math.sin(rad(deg)),
});

/** 主管裡由下往上第 i 顆（0 是最底） */
export const stackSlot = (i: number): Pt => ({ x: STACK.x, y: STACK.bottom + BALL_R + 0.12 + i * STACK.gap });

/** 內圈隊伍第 i 顆（0 是下一個被夾走的） */
export const microSlot = (i: number): Pt => onEllipse(MICRO.r, MICRO.r, PICKUP_DEG - i * SLOT_DEG.micro);

/** 超車道第 i 顆 */
export const tickSlot = (i: number): Pt => onEllipse(TICK.r, TICK.r, PICKUP_DEG - i * SLOT_DEG.tick);

/** 外圈輸送帶第 i 顆 */
export const macroSlot = (i: number): Pt => onEllipse(MACRO.rx, MACRO.ry, PICKUP_DEG - i * SLOT_DEG.macro);

/** setImmediate 支線第 i 顆 */
export const immediateSlot = (i: number): Pt => onEllipse(IMMEDIATE.rx, IMMEDIATE.ry, IMMEDIATE.from + 8 + i * 12);

/** 計時器架第 i 個掛勾（由右往左排） */
export const timerSlot = (i: number): Pt => ({ x: TIMERS.x - i * TIMERS.gap, y: TIMERS.y });

/** 計時器到期時，彈珠掉上輸送帶的落點角度（度） */
export const TIMER_DROP_DEG = 38;

/**
 * 機械臂閒置時夾爪停的位置：超車道圓的內側、軸心的下方。
 * 各條隊伍都從 180° 往順時針（經過上方）排，下半圈不會有彈珠；夾爪收小之後（ARM_IDLE_GRIP_R）
 * 整個落在軸心與超車道之間，不壓到任何軌道。
 */
export const ARM_REST: Pt = onEllipse(0.55, 0.55, 260);
/** 閒置時夾爪收小後的半徑（張開夾球時是 BALL_R + 0.15） */
export const ARM_IDLE_GRIP_R = 0.2;

/** 各管線的中文名與一句說明，場景的標籤與 UI 的圖例共用 */
export const LANE_INFO: Record<Lane, { name: string; what: string }> = {
  stack: { name: 'call stack', what: '正在執行的函式，一次只能跑最上面那一個' },
  micro: { name: 'microtask 內圈', what: 'Promise.then、await 之後、queueMicrotask' },
  macro: { name: 'macrotask 外圈', what: 'setTimeout、事件、I/O' },
  timers: { name: '計時器架', what: 'setTimeout 先掛在這裡倒數，時間到才掉上外圈' },
  tick: { name: 'nextTick 超車道', what: '只有 Node：process.nextTick，比內圈更早' },
  immediate: { name: 'setImmediate 支線', what: '只有 Node：這一輪的 I/O 之後' },
};
