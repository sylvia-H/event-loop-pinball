import { useEffect, useRef } from 'preact/hooks';
import type { BallKind } from '../core/types.ts';
import { S } from './strings.ts';

interface Props {
  /** 完整的輸出，依印出的順序 */
  lines: readonly string[];
  /** 這個時間點已經印出幾行 */
  count: number;
  /** 每一行是哪一種彈珠印的（自己發球用：行首畫一顆同色的點）；不畫就是 null */
  kinds: readonly BallKind[] | null;
  /** 讀者按「放球驗證」時送出的順序；沒猜就是 null */
  predicted: readonly string[] | null;
  /** 把時間軸帶到印出第 i 行（0 起算）的那一步 */
  onJump(i: number): void;
  onGuessAgain(): void;
}

export function OutputPanel({ lines, count, kinds, predicted, onJump, onGuessAgain }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  // 自己發球時輸出會很長：新印出的那一行保持看得到
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count]);

  const firstDiff = predicted ? lines.findIndex((text, i) => predicted[i] !== text) : -1;
  const allPrinted = count >= lines.length;

  return (
    <section class="output" aria-label={S.output.title}>
      <div class="panel-head">
        <h2 class="panel-title">{S.output.title}</h2>
        {predicted && !allPrinted && <span class="panel-note">{S.output.checking(count, lines.length)}</span>}
      </div>
      {count === 0 ? (
        <p class="output-empty">{S.output.empty}</p>
      ) : (
        <ol class="output-lines" ref={listRef}>
          {lines.slice(0, count).map((text, i) => {
            const ok = predicted ? predicted[i] === text : null;
            const kind = kinds?.[i];
            return (
              <li key={i} class={'out' + (ok === true ? ' is-right' : ok === false ? ' is-wrong' : '')}>
                <span class="ln" aria-hidden="true">
                  {i + 1}
                </span>
                {kind && (
                  <span class={`dot dot-${kind}`} role="img" aria-label={S.output.by(kind)} title={S.output.by(kind)} />
                )}
                <code>{text}</code>
                {ok !== null && (
                  <span class="out-mark">
                    <span class="mark" role="img" aria-label={ok ? S.output.right : S.output.wrong} />
                    {!ok && <span class="out-said">{S.output.youSaid(predicted?.[i] ?? '')}</span>}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {predicted && (
        <div class="verdict" role="status">
          {allPrinted && (
            <p class={'verdict-text' + (firstDiff < 0 ? ' is-right' : ' is-wrong')}>
              {firstDiff < 0 ? S.output.allRight : S.output.diffFrom(firstDiff + 1)}
            </p>
          )}
          {allPrinted && firstDiff >= 0 && (
            <button type="button" class="btn" onClick={() => onJump(firstDiff)}>
              {S.output.jump}
            </button>
          )}
          <button type="button" class="btn" onClick={onGuessAgain}>
            {S.output.again}
          </button>
        </div>
      )}
    </section>
  );
}
