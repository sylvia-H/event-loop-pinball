import { useMemo, useState } from 'preact/hooks';
import { S } from './strings.ts';

interface Props {
  /** 正確的輸出，依印出的順序 */
  output: readonly string[];
  /** 打散籌碼用的種子（卡匣的 slug）：同一個卡匣每次都是同一種亂法 */
  seed: string;
  hidden: boolean;
  onSubmit(predicted: string[]): void;
}

/** 輸出只有一行或每行相同時沒有順序可猜。 */
export const guessable = (output: readonly string[]): boolean => new Set(output).size > 1;

/** 回傳打散後的索引。保證文字的順序跟原本不同（呼叫前已確認不是每行都相同）。 */
function shuffled(output: readonly string[], seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const order = output.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) + i;
    const j = (h >>> 0) % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  // 剛好排回正確答案就輪轉一格
  if (order.every((id, i) => output[id] === output[i])) order.push(order.shift()!);
  return order;
}

export function Guess({ output, seed, hidden, onSubmit }: Props) {
  const chips = useMemo(() => shuffled(output, seed), [output, seed]);
  const [picks, setPicks] = useState<number[]>([]);
  const rest = chips.filter((id) => !picks.includes(id));

  return (
    <section class="guess" hidden={hidden} aria-label={S.guess.title}>
      <div class="panel-head">
        <h2 class="panel-title">{S.guess.title}</h2>
      </div>
      <div class="guess-body">
        <p class="guess-hint">{S.guess.hint}</p>
        <ol class="guess-picked" aria-label={S.guess.picked}>
          {output.map((_, i) => {
            const id = picks[i];
            return (
              <li key={i} class="guess-slot">
                <span class="guess-no" aria-hidden="true">
                  {i + 1}
                </span>
                {id !== undefined && (
                  <button
                    type="button"
                    class="chip is-picked"
                    aria-label={S.guess.remove(output[id] ?? '')}
                    onClick={() => setPicks(picks.filter((p) => p !== id))}
                  >
                    {output[id]}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <div class="guess-pool" role="group" aria-label={S.guess.pool}>
          {rest.map((id) => (
            <button key={id} type="button" class="chip" onClick={() => setPicks([...picks, id])}>
              {output[id]}
            </button>
          ))}
        </div>
        <div class="guess-actions">
          <button
            type="button"
            class="btn btn-main"
            disabled={rest.length > 0}
            onClick={() => onSubmit(picks.map((id) => output[id] ?? ''))}
          >
            {S.guess.submit}
          </button>
          <button type="button" class="btn" disabled={picks.length === 0} onClick={() => setPicks([])}>
            {S.guess.reset}
          </button>
          <span class="guess-skip">{S.guess.skip}</span>
        </div>
      </div>
    </section>
  );
}
