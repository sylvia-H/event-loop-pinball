import type { RefObject } from 'preact';
import type { Step } from '../core/types.ts';
import { S } from './strings.ts';

interface Props {
  steps: number;
  /** 目前步驟索引；-1 是還沒開始 */
  idx: number;
  step: Step | undefined;
  /** t 為 0 時的引導語 */
  idle: string;
  playing: boolean;
  sliderRef: RefObject<HTMLInputElement | null>;
  onScrub(t: number): void;
  onRelease(): void;
  onPrev(): void;
  onNext(): void;
  onTogglePlay(): void;
}

const STRIDES = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const MAX_TICKS = 20;

export function Timeline(p: Props) {
  const done = p.idx + 1;
  // 步數多時刻度變疏：最多畫 MAX_TICKS 個間隔
  const stride = STRIDES.find((s) => p.steps / s <= MAX_TICKS) ?? 1000;
  const ticks: number[] = [];
  for (let k = 0; k <= p.steps; k += stride) ticks.push(k);

  return (
    <section class="timeline" aria-label={S.timeline.label}>
      <div class="caption" aria-live="polite">
        {p.step ? (
          <p class="cap">
            {p.step.rule && <span class="cap-rule">{p.step.rule}</span>}
            {p.step.caption}
          </p>
        ) : (
          <p class="cap cap-idle">{p.idle}</p>
        )}
      </div>
      <div class="transport">
        <div class="transport-buttons">
          <button type="button" class="btn" onClick={p.onPrev} disabled={p.idx < 0} aria-label={S.timeline.prev}>
            ‹
          </button>
          <button
            type="button"
            class="btn btn-play"
            onClick={p.onTogglePlay}
            disabled={p.steps === 0}
            aria-pressed={p.playing}
          >
            {p.playing ? S.timeline.pause : S.timeline.play}
          </button>
          <button
            type="button"
            class="btn"
            onClick={p.onNext}
            disabled={done >= p.steps}
            aria-label={S.timeline.next}
          >
            ›
          </button>
        </div>
        <div class="scrub">
          <input
            ref={p.sliderRef}
            class="slider"
            type="range"
            min={0}
            max={p.steps}
            step={0.001}
            disabled={p.steps === 0}
            aria-label={S.timeline.label}
            aria-valuetext={S.timeline.valueText(done, p.steps)}
            onInput={(e) => p.onScrub(Number(e.currentTarget.value))}
            onChange={p.onRelease}
          />
          <div class="ticks" aria-hidden="true">
            {ticks.map((k) => (
              <span
                key={k}
                class={'tick' + (k <= done ? ' is-done' : '')}
                style={`left:${p.steps > 0 ? (k / p.steps) * 100 : 0}%`}
              >
                {k}
              </span>
            ))}
          </div>
        </div>
        <p class="step-count">{S.timeline.count(done, p.steps)}</p>
      </div>
    </section>
  );
}
