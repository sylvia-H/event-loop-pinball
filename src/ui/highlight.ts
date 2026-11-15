// 極小的 JavaScript 上色器：卡匣都是十行以內的教學程式碼，不值得載一個 highlighter。
// 一次處理一行；跨行的區塊註解與樣板字串不處理（卡匣不會用到）。

export type TokenType = 'com' | 'str' | 'num' | 'kw' | 'ty' | 'fn' | 'txt';

export interface Token {
  type: TokenType;
  text: string;
}

const KEYWORDS: ReadonlySet<string> = new Set(
  (
    'async await break case catch class const continue default do else export extends false finally for from ' +
    'function if import in instanceof let new null of return switch this throw true try typeof undefined var ' +
    'void while yield'
  ).split(' '),
);

// 分組：1 註解、2 字串、3 數字、4 識別字、5 其他
const PATTERN =
  /(\/\/.*$|\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+|.)/g;

export function tokenize(line: string): Token[] {
  const out: Token[] = [];
  const push = (type: TokenType, text: string) => {
    const last = out[out.length - 1];
    if (last && type === 'txt' && last.type === 'txt') last.text += text;
    else out.push({ type, text });
  };
  for (const m of line.matchAll(PATTERN)) {
    if (m[1] !== undefined) push('com', m[1]);
    else if (m[2] !== undefined) push('str', m[2]);
    else if (m[3] !== undefined) push('num', m[3]);
    else if (m[4] !== undefined) {
      const word = m[4];
      const rest = line.slice((m.index ?? 0) + word.length);
      if (KEYWORDS.has(word)) push('kw', word);
      else if (/^[A-Z]/.test(word)) push('ty', word);
      else if (/^\s*\(/.test(rest)) push('fn', word);
      else push('txt', word);
    } else push('txt', m[0]);
  }
  return out;
}
