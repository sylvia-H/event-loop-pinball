import { useMemo } from 'preact/hooks';
import { tokenize } from './highlight.ts';
import { S } from './strings.ts';

interface Props {
  code: string;
  /** 標題列右側的小字（Node 實跑的版本） */
  note: string;
  /** 目前這一步對應的行 */
  current: number | null;
  /** 從機器指過來要發亮的行 */
  hot: ReadonlySet<number> | null;
  /** 有對應步驟、可以點的行 */
  pickable: ReadonlySet<number>;
  onEnter(line: number): void;
  onLeave(): void;
  onPick(line: number): void;
}

export function CodePanel({ code, note, current, hot, pickable, onEnter, onLeave, onPick }: Props) {
  const lines = useMemo(
    () =>
      code
        .replace(/\r\n/g, '\n')
        .replace(/\n+$/, '')
        .split('\n')
        .map((text) => ({ tokens: tokenize(text), indent: text.length - text.trimStart().length })),
    [code],
  );

  return (
    <section class="code" aria-label={S.code.label}>
      <div class="panel-head">
        <h2 class="panel-title">{S.code.title}</h2>
        <span class="panel-note">{note}</span>
      </div>
      <ol class="code-lines" onMouseLeave={onLeave}>
        {lines.map(({ tokens, indent }, i) => {
          const line = i + 1;
          const cls = 'line' + (line === current ? ' is-current' : '') + (hot?.has(line) ? ' is-hot' : '');
          const body = (
            <>
              <span class="ln" aria-hidden="true">
                {line}
              </span>
              {/* 折行後的續行比這一行的開頭再縮進 2 格 */}
              <code style={`--hang:${indent + 2}ch`}>
                {tokens.map((tok) =>
                  tok.type === 'txt' ? tok.text : <span class={`tok-${tok.type}`}>{tok.text}</span>,
                )}
              </code>
            </>
          );
          return (
            <li key={line} onMouseEnter={() => onEnter(line)}>
              {pickable.has(line) ? (
                <button
                  type="button"
                  class={cls}
                  aria-current={line === current ? 'step' : undefined}
                  onFocus={() => onEnter(line)}
                  onBlur={onLeave}
                  onClick={() => onPick(line)}
                >
                  {body}
                </button>
              ) : (
                <div class={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
