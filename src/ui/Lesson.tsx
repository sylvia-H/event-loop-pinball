// 題目與解說。題目（teaser）選了卡匣就顯示；解說（takeaway、lead）會講出答案，
// 所以球跑完、或讀者按「直接看解說」才顯示。

import type { RefObject } from 'preact';
import type { Cartridge } from '../core/types.ts';
import { S } from './strings.ts';

interface QuestionProps {
  cart: Cartridge;
  /** 解說已經展開：提示換成「解說在下面」（這一行一直在，展開的那一刻版面才不會跳） */
  revealed: boolean;
  /** 展開解說並捲到它；已經展開就只捲過去 */
  onReveal(): void;
}

export function Question({ cart, revealed, onReveal }: QuestionProps) {
  return (
    <section class="question" aria-label={S.lesson.question}>
      <p class="question-text">{cart.teaser}</p>
      <p class="question-hint">
        {revealed ? S.lesson.shown : S.lesson.hint}
        <button type="button" class="link" onClick={onReveal}>
          {revealed ? S.lesson.jump : S.lesson.reveal}
        </button>
      </p>
    </section>
  );
}

export function Explain({ cart, boxRef }: { cart: Cartridge; boxRef: RefObject<HTMLElement | null> }) {
  return (
    <section ref={boxRef} class="explain" aria-label={S.lesson.title}>
      <div class="panel-head">
        <h2 class="panel-title">{S.lesson.title}</h2>
      </div>
      <div class="explain-body">
        <p class="takeaway">{cart.takeaway}</p>
        {cart.lead.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </section>
  );
}
