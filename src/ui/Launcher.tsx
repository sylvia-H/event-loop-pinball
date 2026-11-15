import { SHOTS } from '../core/freeplay.ts';
import { S } from './strings.ts';

interface Props {
  /** 已經發了幾顆 */
  count: number;
  max: number;
  onFire(kind: string): void;
  onClear(): void;
}

export function Launcher({ count, max, onFire, onClear }: Props) {
  const full = count >= max;
  return (
    <section class="launcher" aria-label={S.free.label}>
      <div class="shots">
        {SHOTS.map((shot) => (
          <button key={shot.kind} type="button" class="shot" disabled={full} onClick={() => onFire(shot.kind)}>
            <span class={`dot dot-${shot.ballKind}`} aria-hidden="true" />
            <span class="shot-body">
              <span class="shot-label">{shot.label}</span>
              <span class="shot-hint">{shot.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <div class="launcher-foot">
        <button type="button" class="btn" disabled={count === 0} onClick={onClear}>
          {S.free.clear}
        </button>
        <p class={'launcher-count' + (full ? ' is-full' : '')} role="status">
          {full ? S.free.full(max) : S.free.count(count, max)}
        </p>
      </div>
    </section>
  );
}
