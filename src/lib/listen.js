/* ── speech input ──
   A thin wrapper over the browser's own SpeechRecognition. No API, no key, no quota: the
   recognition happens in the browser (or, on some platforms, through the vendor's own
   service) and this file never sees audio, only the transcript.

   Deliberately small, because the honest description of what this buys is small. It turns
   speech into TEXT and nothing more. It cannot tell you your pitch accent was wrong, or
   that you said と where you meant ど — the tutor downstream only ever sees the transcript,
   so a mispronunciation that transcribes correctly is invisible and one that transcribes
   wrongly looks like a vocabulary error. Real pronunciation feedback needs the audio, which
   is a different and much larger project. Nothing here should imply otherwise.

   MODULE-LEVEL WINDOW ACCESS IS GUARDED. tools/test-modules.mjs imports every module in
   Node with no DOM and RUNS something in it, and a bare `window.foo` at import time would
   throw there — see the trap note in HANDOFF.md about the bundle hiding this class of
   mistake. Hence the typeof checks. */

const Recognition = typeof window !== "undefined"
  ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
  : null;

/* Whether a mic button should be offered at all. False on Firefox, on older iOS, and in
   Node — and the caller must hide the control rather than show one that cannot work. */
export const MIC_OK = !!Recognition;

/* Start listening. Returns a handle with stop(); the caller gets text through callbacks
   rather than a promise because interim results arrive before the final one and showing
   them is most of what makes dictation feel responsive.

   onPartial(text)  — best guess so far, may change
   onFinal(text)    — the settled transcript for this utterance
   onError(kind)    — 'denied' | 'no-speech' | 'unsupported' | 'failed'
   onEnd()          — recognition stopped, for any reason */
export function listenJa({ lang = "ja-JP", onPartial, onFinal, onError, onEnd } = {}) {
  if (!Recognition) {
    if (onError) onError("unsupported");
    if (onEnd) onEnd();
    return { stop() {} };
  }

  let rec = null;
  try {
    rec = new Recognition();
  } catch (e) {
    if (onError) onError("failed");
    if (onEnd) onEnd();
    return { stop() {} };
  }

  rec.lang = lang;
  /* Interim results on, continuous OFF. Continuous recognition keeps the mic open until it
     is stopped, which on a phone means it is still listening while the learner reads the
     reply — recording the room, and eventually the tutor's own voice. One utterance per
     press is both more predictable and less alarming. */
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let settled = "";
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      const text = (r[0] && r[0].transcript) || "";
      if (r.isFinal) settled += text; else interim += text;
    }
    if (interim && onPartial) onPartial((settled + interim).trim());
    if (settled && onFinal) onFinal(settled.trim());
  };
  rec.onerror = (ev) => {
    const e = (ev && ev.error) || "";
    /* 'aborted' is what a deliberate stop() raises, and reporting it as a failure would
       make every normal end of dictation look like something went wrong. */
    if (e === "aborted") return;
    if (onError) onError(e === "not-allowed" || e === "service-not-allowed" ? "denied"
      : e === "no-speech" ? "no-speech" : "failed");
  };
  rec.onend = () => { if (onEnd) onEnd(); };

  try {
    rec.start();
  } catch (e) {
    /* start() throws if it is already running — treat it as already listening rather than
       as an error, since the visible state is the same. */
    if (onError) onError("failed");
  }

  return {
    stop() { try { rec.stop(); } catch (e) { try { rec.abort(); } catch (e2) {} } },
  };
}
