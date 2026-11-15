import { useEffect, useRef } from 'preact/hooks';
import type { CartridgeEntry } from '../core/types.ts';
import { S } from './strings.ts';

interface Props {
  entries: readonly CartridgeEntry[];
  selected: string;
  onSelect(slug: string): void;
}

const optionId = (slug: string) => `cart-${slug}`;

export function CartridgeList({ entries, selected, onSelect }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  // 選中的那一列保持在清單的可視範圍內（只捲清單自己，不動整個左欄）
  useEffect(() => {
    const list = listRef.current;
    const el = document.getElementById(optionId(selected));
    if (!list || !el) return;
    const top = el.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top + el.offsetHeight - list.clientHeight;
  }, [selected]);

  const onKeyDown = (e: KeyboardEvent) => {
    const i = entries.findIndex((c) => c.slug === selected);
    let j = i;
    if (e.key === 'ArrowDown') j = Math.min(i + 1, entries.length - 1);
    else if (e.key === 'ArrowUp') j = Math.max(i - 1, 0);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = entries.length - 1;
    else return;
    e.preventDefault();
    const next = entries[j];
    if (next && j !== i) onSelect(next.slug);
  };

  return (
    <ul
      ref={listRef}
      class="carts"
      role="listbox"
      tabIndex={0}
      aria-label={S.list.label}
      aria-activedescendant={optionId(selected)}
      onKeyDown={onKeyDown}
    >
      {entries.map((c, i) => (
        <li
          key={c.slug}
          id={optionId(c.slug)}
          class={'cart' + (c.slug === selected ? ' is-selected' : '')}
          role="option"
          aria-selected={c.slug === selected}
          onClick={() => onSelect(c.slug)}
        >
          <span class="cart-no" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <span class="cart-body">
            <span class="cart-title">
              {c.title}
              {c.nodeOnly && (
                <span class="badge" title={S.list.nodeTitle}>
                  {S.list.node}
                </span>
              )}
            </span>
            <span class="cart-teaser">{c.teaser}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
