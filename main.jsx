/* The mount, and the only file that assumes a browser exists.
     tools/build.mjs bundles THIS, not JpnFlashcards.jsx.

   The split is the whole point of TODO-212. JpnFlashcards.jsx used to mount React on the
   last line, so merely importing it in Node threw on `document` — which meant the app
   could not be imported at all, and its tests had to cut functions out of the source with
   a regex and eval them rather than import them. Loading the module and starting the app
   are now two separate acts, and only this one touches the DOM.

   installBrowserSideEffects() runs synchronously before the first render, so the listeners,
   the stored retention target and the speech voices are all in place exactly as early as
   they were when this happened at import — the ordering has not changed, only where it is
   written down. */
import React from "react";
import ReactDOM from "react-dom/client";
import JpnFlashcards, { Boundary, installBrowserSideEffects } from "./JpnFlashcards.jsx";

installBrowserSideEffects();

ReactDOM.createRoot(document.getElementById("root")).render(
  <Boundary><JpnFlashcards /></Boundary>
);
