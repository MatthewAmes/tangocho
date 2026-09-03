import React from "react";

export default function Bi({ en, ja }) {
  return <span className="tc-bi">{en}<small>{ja}</small></span>;
}
