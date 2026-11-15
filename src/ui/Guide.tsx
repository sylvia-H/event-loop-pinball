import { LANE_INFO } from '../core/geometry.ts';
import { LANES, type BallKind } from '../core/types.ts';
import { S } from './strings.ts';

const BALL_KINDS: readonly BallKind[] = ['sync', 'micro', 'macro', 'tick', 'immediate'];

export const GUIDE_ID = 'guide';
const BODY_ID = 'guide-body';

/** 左欄最上面的可收合區塊：收起時只剩一列標題，機器永遠不被擋 */
export function Guide({ open, onToggle }: { open: boolean; onToggle(): void }) {
  return (
    <section id={GUIDE_ID} class={'guide' + (open ? ' is-open' : '')} aria-label={S.guide.title}>
      <h2 class="guide-head">
        <button type="button" class="guide-toggle" aria-expanded={open} aria-controls={BODY_ID} onClick={onToggle}>
          <span class="panel-title">{S.guide.title}</span>
          <span class="guide-state">{open ? S.guide.hide : S.guide.show}</span>
        </button>
      </h2>
      <div id={BODY_ID} class="guide-body" hidden={!open}>
        {S.guide.intro.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
        <h3 class="guide-sub">{S.guide.lanes}</h3>
        <ul class="guide-lanes">
          {LANES.map((lane) => (
            <li key={lane}>
              <span class={`dot dot-lane-${lane}`} aria-hidden="true" />
              <span class="guide-name">{LANE_INFO[lane].name}</span>
              <span class="guide-what">{LANE_INFO[lane].what}</span>
            </li>
          ))}
        </ul>
        <h3 class="guide-sub">{S.guide.balls}</h3>
        <ul class="guide-balls">
          {BALL_KINDS.map((kind) => (
            <li key={kind}>
              <span class={`dot dot-${kind}`} aria-hidden="true" />
              {S.guide.ballKinds[kind]}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
