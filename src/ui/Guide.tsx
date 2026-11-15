import { LANE_INFO } from '../core/geometry.ts';
import { LANES, type BallKind } from '../core/types.ts';
import { S } from './strings.ts';

const BALL_KINDS: readonly BallKind[] = ['sync', 'micro', 'macro', 'tick', 'immediate'];

export const GUIDE_ID = 'guide';

export function Guide({ onClose }: { onClose(): void }) {
  return (
    <aside id={GUIDE_ID} class="guide" aria-label={S.guide.title}>
      <div class="panel-head">
        <h2 class="panel-title">{S.guide.title}</h2>
        <button type="button" class="btn btn-close" onClick={onClose} aria-label={S.guide.close}>
          ×
        </button>
      </div>
      <div class="guide-body">
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
    </aside>
  );
}
