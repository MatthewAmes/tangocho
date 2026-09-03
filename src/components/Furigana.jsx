import React from "react";

export default function Furigana({ tokens }) {
  if (!Array.isArray(tokens)) return <>{tokens}</>;   // string fallback (no furigana)
  return tokens.map((tk, i) => {
    if (!tk || tk.t == null) return null;
    if (tk.t === "___" || tk.t === "＿＿＿") return <span key={i} className="tc-blank">＿＿＿</span>;
    if (tk.r) return <ruby lang="ja" key={i}>{tk.t}<rt>{tk.r}</rt></ruby>;
    return <span key={i}>{tk.t}</span>;
  });
}
