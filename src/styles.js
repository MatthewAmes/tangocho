/* The whole stylesheet. Injected as one <style>{CSS}</style> by the root component — see the note about stray backticks: this is a template literal, so a backtick in a CSS comment ends the string and breaks the build. */

export const CSS = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans:wght@400;500;600&family=Noto+Sans+JP:wght@400;500;600&display=swap");
html,body{margin:0;padding:0;background:#141313;}
html{height:100%;}
body{min-height:100%;overscroll-behavior-y:none;}
.tc-root{
  /* Academic Dark base (DESIGN.md). The shu/washi token NAMES are kept because several
     hundred rules reference them; only the values move, so a retheme is one edit rather
     than a sweep. Tonal layering, not shadow: each surface step is a lighter neutral. */
  --bg:#141313; --surface:#1c1b1b; --surface-2:#201f1f;
  --surface-3:#2b2a2a; --surface-4:#353434; --card:#1e1e1e;
  --ai:#1c1b1b; --ai-deep:#0e0e0e; --shu:#e0655a; --shu-soft:#ef8378;
  --sumi:#0e0e0e; --washi:#e5e2e1; --washi-2:#c4c7c7; --line:#2c2c2c;
  --mut:#c4c7c7; --mut-2:#8e9192; --outline:#8e9192; --outline-2:#444748;
  --violet:#a78bfa;
  /* Semantic accents. Emerald = correct / progress, amber = due & kanji, blue = the
     primary action. Deliberately NOT used for FSRS stability — that keeps its own
     steel-blue-to-gold ramp so "how well do I know this" reads as one continuous scale
     rather than three discrete states. */
  --ok:#10b981; --warn:#f59e0b; --info:#3b82f6;
  /* Type scale */
  --f-ui:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",Roboto,"Helvetica Neue",sans-serif;
  --f-body:"Noto Sans","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --t-xl:700 40px/48px var(--f-ui); --t-lg:600 32px/40px var(--f-ui);
  --t-md:600 24px/32px var(--f-ui); --t-body-lg:400 18px/28px var(--f-body);
  --t-body:400 16px/24px var(--f-body); --t-body-sm:400 14px/20px var(--f-body);
  --t-caps:700 12px/16px var(--f-ui);
  /* 8px grid */
  --sp:8px; --gutter:16px; --card-pad:20px; --edge:24px; --section:40px;
  /* Liquid glass */
  --glass:rgba(255,255,255,.045); --glass-hi:rgba(255,255,255,.08);
  --gloss:inset 0 1px 0 rgba(255,255,255,.10);
  --glass-blur:blur(16px) saturate(140%);
  /* Holographic foil edge — smooth, saturated, wraps back to the start so the sweep has
     no visible seam when it animates. */
  --foil:linear-gradient(115deg,#ff6b6b 0%,#ffa94d 14%,#ffd43b 28%,#69db7c 42%,#38d9a9 56%,#4dabf7 70%,#9775fa 84%,#ff6b6b 100%);
  --mono:ui-monospace,"SF Mono","Roboto Mono","JetBrains Mono",Menlo,monospace;
  --r-s:8px; --r-m:12px; --r-l:16px; --r-xl:24px; --tap:46px;
  font-family:var(--f-body);
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-rendering:optimizeLegibility;
  font-variant-numeric:tabular-nums;
  color:var(--washi);
  background:
    radial-gradient(85% 55% at 15% -10%, rgba(59,130,246,.07) 0%, rgba(59,130,246,0) 60%),
    radial-gradient(70% 50% at 88% 2%, rgba(16,185,129,.05) 0%, rgba(16,185,129,0) 62%),
    radial-gradient(90% 55% at 50% 112%, rgba(245,158,11,.04) 0%, rgba(245,158,11,0) 60%),
    var(--bg);
  position:relative;
  min-height:100vh; padding:24px 16px 40px; box-sizing:border-box;
}
.tc-jp{font-family:"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;}

/* ---- Academic Dark type scale (DESIGN.md). Utility classes so new markup can opt in
   without every existing rule having to be rewritten. ---- */
.tc-t-xl{font:var(--t-xl);letter-spacing:-.02em;color:var(--washi);margin:0;}
.tc-t-lg{font:var(--t-lg);color:var(--washi);margin:0;}
.tc-t-md{font:var(--t-md);color:var(--washi);margin:0;}
.tc-t-body-lg{font:var(--t-body-lg);color:var(--washi-2);margin:0;}
.tc-t-body{font:var(--t-body);color:var(--washi-2);margin:0;}
.tc-t-sm{font:var(--t-body-sm);color:var(--washi-2);margin:0;}
.tc-caps{font:var(--t-caps);letter-spacing:.05em;text-transform:uppercase;color:var(--mut-2);}
.tc-shell{max-width:660px;margin:0 auto;}

.tc-head{display:flex;flex-direction:column;gap:18px;margin-bottom:22px;}
.tc-brandblock{display:flex;align-items:center;gap:14px;}
.tc-seal{
  font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",serif;
  display:grid;place-items:center;width:46px;height:46px;flex:none;
  background:#c2453a;color:#fff;border-radius:8px;font-size:24px;font-weight:700;
  box-shadow:0 2px 0 rgba(0,0,0,.25), inset 0 0 0 2px rgba(255,255,255,.14);
  transform:rotate(-3deg);
}
.tc-wordmark{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  margin:0;font-size:32px;letter-spacing:.06em;line-height:1;color:#fff;}
.tc-sub{margin:8px 0 0;font:var(--t-caps);letter-spacing:.05em;color:var(--mut-2);text-transform:uppercase;}
.tc-count{color:var(--shu-soft);font-weight:600;}

/* Scrolls sideways rather than wrapping. Twelve tabs wrap to two rows, which eats ~50px of
   vertical space on a phone before any content — and the second row is easy to miss entirely.
   A single scrolling row keeps the bar one tap-height tall at any count. */
.tc-tabs{display:flex;gap:4px;background:rgba(255,255,255,.07);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);
  padding:4px;border-radius:99px;width:fit-content;max-width:100%;flex-wrap:nowrap;
  overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;
  scroll-snap-type:x proximity;}
.tc-tabs::-webkit-scrollbar{display:none;}
/* The shell is capped at 660px because that is a comfortable reading measure for CARD
   content — but a tab strip is not prose, and obeying that cap was forcing 13 tabs to
   scroll inside a 668px box on a 1280px screen, with ~600px sitting empty beside it. On
   anything wide enough, the strip breaks out of the column and centres on it instead, so
   every tab is simply visible and there is nothing to scroll. Narrow screens keep the
   scroll-plus-fade behaviour, which is the right answer when the tabs genuinely cannot fit. */
@media (min-width:720px){
  .tc-tabs{max-width:min(94vw,1040px);position:relative;left:50%;transform:translateX(-50%);}
}
/* Fade whichever edge still has tabs behind it. mask-image rather than an overlay element so
   it works over the strip's own translucent background without painting a hard rectangle. */
.tc-tabs.has-right{-webkit-mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 34px),transparent 100%);
                           mask-image:linear-gradient(90deg,#000 0,#000 calc(100% - 34px),transparent 100%);}
.tc-tabs.has-left{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 34px,#000 100%);
                          mask-image:linear-gradient(90deg,transparent 0,#000 34px,#000 100%);}
.tc-tabs.has-left.has-right{-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 34px,#000 calc(100% - 34px),transparent 100%);
                                    mask-image:linear-gradient(90deg,transparent 0,#000 34px,#000 calc(100% - 34px),transparent 100%);}
.tc-tab{scroll-snap-align:center;flex:0 0 auto;}
.tc-tab{appearance:none;border:0;background:transparent;color:var(--mut-2);
  font:inherit;font-size:14px;font-weight:600;letter-spacing:.01em;min-height:42px;padding:8px 15px;border-radius:99px;cursor:pointer;transition:background .15s,color .15s,transform .1s;white-space:nowrap;}
.tc-tab:hover{color:#fff;}
.tc-tab:active{transform:scale(.96);}
.tc-tab.is-on{background:var(--surface-3);color:var(--washi);font-weight:600;}

.tc-eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--mut-2);margin:0 0 14px;}
.tc-card2 .tc-eyebrow{color:rgba(255,255,255,.5);}

/* setup */
.tc-study-setup{background:transparent;border:0;border-radius:0;padding:6px 2px;display:flex;flex-direction:column;gap:10px;}
.tc-study-setup > *{margin-top:0;margin-bottom:0;}
.tc-hero{text-align:center;margin:6px 0 22px;}
.tc-heronum{font-size:96px;font-weight:200;letter-spacing:-.03em;line-height:1;color:#fff;font-family:-apple-system,"SF Pro Display",BlinkMacSystemFont,sans-serif;text-shadow:0 0 44px rgba(124,92,255,.4);}
.tc-herolabel{font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--mut-2);margin:8px 0 0;}
.tc-herosub{font-size:13px;color:rgba(255,255,255,.55);margin:6px 0 0;}
.tc-controls{display:flex;flex-direction:column;gap:20px;margin-bottom:24px;}
.tc-field{border:0;margin:0;padding:0;}
.tc-field legend{font-size:13px;color:var(--mut-2);margin-bottom:9px;padding:0;}
.tc-segbtn{appearance:none;border:0;background:rgba(255,255,255,.07);color:var(--washi);
  font:inherit;font-size:14px;font-weight:500;min-height:40px;padding:9px 16px;border-radius:var(--r-s);cursor:pointer;transition:border-color .15s,background .15s,transform .1s;}
.tc-segbtn:active{transform:scale(.96);}
.tc-segbtn:hover{background:rgba(255,255,255,.14);}
/* The armed state once asked for border-color on a rule that sets border:0, so it came
   down to a background that reads DARKER than the translucent unarmed one. The token it
   wanted is drawn as an inset ring instead — no layout box, no new colour. */
.tc-segbtn.is-on{background:var(--surface-3);box-shadow:inset 0 0 0 1px var(--info);color:var(--washi);font-weight:600;}
.tc-toggle{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--washi);cursor:pointer;}
.tc-toggle input{width:17px;height:17px;accent-color:var(--shu);}
.tc-start{width:100%;}
.tc-review-btn{margin-top:10px;}
.tc-batchhead{display:flex;align-items:center;justify-content:space-between;margin:20px 0 10px;}
.tc-batchhead>span{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--mut-2);}
.tc-sizesel{display:flex;gap:4px;background:rgba(255,255,255,.06);padding:3px;border-radius:8px;}
.tc-szbtn{appearance:none;border:0;background:transparent;color:var(--mut-2);font:inherit;font-size:12px;font-weight:600;padding:4px 11px;border-radius:8px;cursor:pointer;}
.tc-szbtn.is-on{background:var(--washi);color:var(--ai);}
/* ── mission chips ──
   A stack, not a grid: each row is one sentence plus its count, and two of them side by
   side on a 375px screen would truncate the label — which is the only part that says what
   to go and do. Not buttons and not focusable, because none of them is an action: they are
   completed by studying, and the study buttons are directly below. */
.tc-missions{margin:0 0 4px;}
.tc-missionrow{display:flex;flex-direction:column;gap:6px;}
.tc-mission{position:relative;overflow:hidden;display:flex;align-items:center;gap:9px;
  min-height:40px;padding:9px 13px;border-radius:var(--r-m);
  background:var(--glass);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);
  box-shadow:var(--gloss);font:var(--t-body-sm);color:var(--washi);}
.tc-missionmark{flex:none;font-size:12px;color:var(--mut-2);}
.tc-missionlabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}
.tc-missioncount{flex:none;font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--mut-2);}
/* The progress read sits UNDER the row rather than beside it — a bar competing for the
   same line as the label is what forced the label to truncate in the first place. */
.tc-missionbar{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(255,255,255,.06);}
.tc-missionbar>i{display:block;height:100%;background:var(--info);transition:width .3s ease;}
.tc-mission.is-done{color:var(--mut-2);}
.tc-mission.is-done .tc-missionmark{color:var(--ok);}
.tc-mission.is-done .tc-missionlabel{text-decoration:line-through;text-decoration-color:var(--outline-2);}
.tc-mission.is-done .tc-missionbar>i{background:var(--ok);}
@media (prefers-reduced-motion:reduce){ .tc-missionbar>i{transition:none;} }

.tc-batchgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;}
.tc-batchchip{appearance:none;text-align:left;border:0;position:relative;overflow:hidden;
  color:var(--washi);font:inherit;min-height:62px;padding:0;border-radius:16px;cursor:pointer;
  transition:box-shadow .15s,transform .1s;}
.tc-batchchip:active{transform:scale(.97);}
.tc-batchchip:hover{box-shadow:0 0 30px -8px rgba(255,255,255,.28);}
.tc-batchglass{position:relative;z-index:1;height:100%;box-sizing:border-box;min-height:62px;
  display:flex;flex-direction:column;gap:3px;justify-content:center;padding:12px 40px 12px 14px;
  background:linear-gradient(155deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,.05) 55%, rgba(255,255,255,.02) 100%);
  backdrop-filter:blur(9px) saturate(150%);-webkit-backdrop-filter:blur(9px) saturate(150%);
  border:1px solid rgba(255,255,255,.16);border-radius:16px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.3), inset 0 -14px 20px -14px rgba(0,0,0,.25);}
.tc-batchicon{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:26px;
  line-height:1;opacity:.75;pointer-events:none;user-select:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4));}
.tc-batchnum{font-size:14px;font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.4);}
.tc-batchmeta{font-size:12px;color:rgba(255,255,255,.82);text-shadow:0 1px 2px rgba(0,0,0,.35);}
.tc-rate-low{color:var(--shu-soft);}
.tc-rate-new{color:var(--mut-2);}
.tc-setupfoot{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;}
.tc-hintline{text-align:center;font-size:12px;color:var(--mut-2);margin:14px 0 0;}

/* buttons */






.tc-btn-wide{width:100%;}
.tc-btn-sm{min-height:38px;padding:8px 16px;border-radius:var(--r-s);}
/* The caps treatment is for short action labels ("ADD WORD"). Buttons that carry a
   sentence and live counts — "Smart Review · 19 cards · 6 new" — read worse shouted, and
   digits are harder to scan at 12px, so they keep sentence case at body size. */
.tc-btn-wide,.tc-btn-got,.tc-btn-miss{font-size:14px;}
.tc-start,.tc-btn-got,.tc-btn-miss{text-transform:none;letter-spacing:.01em;}
.tc-start{font-size:16px;font-weight:600;}
.tc-btn-danger{border-color:rgba(216,72,47,.5);color:var(--shu-soft);}
.tc-btn-danger:hover{background:rgba(216,72,47,.16);}
.tc-btn-got{flex:1;background:var(--ok);border-color:var(--ok);color:#04231a;box-shadow:0 6px 16px -8px rgba(16,185,129,.6);}
.tc-btn-got:hover{filter:brightness(1.08);background:#3d9150;}
.tc-btn-good{background:var(--ok) !important;border-color:var(--ok) !important;color:#04231a !important;box-shadow:0 6px 16px -8px rgba(16,185,129,.6);}
.tc-btn-bad{background:var(--shu) !important;border-color:var(--shu) !important;box-shadow:0 6px 16px -8px rgba(224,101,90,.55);}
.tc-btn-miss{flex:1;}

/* progress */
.tc-progress{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap;}
.tc-progtrack{flex:1;height:4px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden;}
.tc-progfill{height:100%;background:var(--shu);border-radius:99px;transition:width .3s;}
.tc-progtext{font-size:12px;color:var(--mut-2);font-variant-numeric:tabular-nums;}
/* Segmented session rail. Colours are outcome, not score: a miss is a muted slate, never a
   red slap — the design rule for this whole app is that failing a card is a normal event in
   a retrieval system, not a punishment. Fast+correct earns the gold that stability uses
   elsewhere, so the two reward languages agree. */
.tc-segrail{flex:1;display:flex;gap:2px;align-items:center;min-width:120px;}
.tc-seg2{flex:1;height:4px;border-radius:99px;background:rgba(255,255,255,.10);
  transition:background .25s ease,transform .25s ease;transform-origin:center;}
.tc-seg2.is-ok{background:rgba(201,156,92,.85);}
.tc-seg2.is-fast{background:rgba(232,191,90,.95);}
.tc-seg2.is-miss{background:rgba(154,160,166,.45);}
.tc-seg2.is-now{background:rgba(255,255,255,.85);transform:scaleY(2.2);}
.tc-seg2.is-back{background:rgba(105,219,124,.95);}   /* recovered: the one green in the app */
.tc-rescue{display:flex;align-items:center;gap:9px;margin:0 0 14px;padding:10px 14px;
  border-radius:12px;font-size:14px;font-weight:600;letter-spacing:.01em;
  color:var(--washi);background:rgba(255,255,255,.04);
  backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);
  box-shadow:var(--gloss);animation:tc-rescue-in .32s cubic-bezier(.2,.8,.3,1);}
.tc-rescueicon{color:rgb(105,219,124);font-size:11px;}
.tc-xp{font-family:var(--mono);font-size:12px;font-weight:700;color:rgb(232,191,90);
  letter-spacing:.04em;animation:tc-xp-bump .3s ease;}
.tc-xp i{font-style:normal;opacity:.6;margin-left:2px;font-size:10px;}
@keyframes tc-xp-bump{from{transform:scale(1.35);}to{transform:scale(1);}}
.tc-award{display:flex;align-items:center;gap:7px;margin:0 0 12px;font-family:var(--mono);
  font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut-2);
  animation:tc-award-in .4s cubic-bezier(.2,.8,.3,1);}
.tc-award b{font-size:14px;color:rgb(232,191,90);letter-spacing:0;}
.tc-award span{padding:2px 7px;border-radius:99px;background:rgba(255,255,255,.05);}
@keyframes tc-award-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
.tc-memcheck{display:flex;align-items:center;gap:9px;margin:0 0 12px;padding:10px 14px;
  border-radius:12px;font-size:14px;font-weight:600;color:var(--washi);
  background:linear-gradient(135deg,rgba(151,117,250,.18),rgba(77,171,247,.10));
  backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);
  box-shadow:var(--gloss);animation:tc-award-in .4s cubic-bezier(.2,.8,.3,1);}
/* Announced BEFORE the answer, so it is deliberately quieter than the payoff banner above:
   an outline rather than a fill, because it is a question being asked and not a result. */
.tc-memahead{display:flex;align-items:center;gap:9px;margin:0 0 12px;padding:10px 14px;
  border-radius:var(--r-m);font:var(--t-body-sm);font-weight:600;color:var(--washi-2);
  border:1px solid rgba(167,139,250,.32);background:rgba(167,139,250,.06);
  animation:tc-award-in .4s cubic-bezier(.2,.8,.3,1);}

/* One line, one moment. Sits where the award row does and reads as part of the same strip:
   the award says what an answer was worth, this says what it meant. */
.tc-reward{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:9px 14px;
  border-radius:var(--r-m);font:var(--t-body-sm);color:var(--washi);
  background:var(--glass);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);
  box-shadow:var(--gloss);animation:tc-award-in .4s cubic-bezier(.2,.8,.3,1);}
.tc-reward b{font-weight:700;letter-spacing:.01em;}
.tc-rewardsub{color:var(--mut-2);font-size:13px;}
.tc-rewardmark{font-size:12px;}
.tc-reward.is-comeback .tc-rewardmark{color:var(--ok);}
.tc-reward.is-speed-pr .tc-rewardmark{color:var(--warn);}
.tc-reward.is-no-hint .tc-rewardmark{color:var(--info);}
.tc-reward.is-mission .tc-rewardmark{color:var(--ok);}

.tc-stopnote{margin:-6px auto 16px;max-width:34ch;font-size:14px;line-height:1.5;color:var(--mut-2);}
/* The offer to stop, above the next card. Deliberately quieter than .tc-memcheck and
   .tc-award: those celebrate something that happened, this asks a question, and a nudge
   that shouts is a nudge that gets resented by the third time it appears. Amber because
   it is the "worth your attention" accent, not an error and not a reward. */
.tc-stopoffer{margin:0 0 14px;padding:12px 14px;border-radius:12px;
  color:var(--washi);background:rgba(245,158,11,.10);
  box-shadow:inset 0 0 0 1px rgba(245,158,11,.30),var(--gloss);
  backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);
  animation:tc-rescue-in .32s cubic-bezier(.2,.8,.3,1);}
.tc-stoptitle{margin:0;font-family:var(--mono);font-size:11px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--warn);}
.tc-stoptext{margin:6px 0 0;font-size:14px;line-height:1.5;color:var(--mut);}
/* Keep going is the wider button, and it comes first. The system is guessing; the learner
   is not, and the layout should say which of the two the app trusts more. */
.tc-stopacts{display:flex;gap:8px;margin-top:11px;}
.tc-stopacts .tc-btn{flex:1 1 40%;min-height:40px;}
.tc-stopacts .tc-btn-primary{flex:1 1 60%;}
@media (prefers-reduced-motion:reduce){ .tc-stopoffer{animation:none;} }
.tc-donexp{margin:-10px 0 14px;font-family:var(--mono);font-size:15px;font-weight:700;
  color:rgb(232,191,90);letter-spacing:.04em;}
.tc-donexp span{font-size:11px;font-weight:600;opacity:.65;letter-spacing:.14em;text-transform:uppercase;}
@media (prefers-reduced-motion:reduce){
  .tc-xp,.tc-award,.tc-memcheck,.tc-memahead,.tc-reward{animation:none;}
}
@keyframes tc-rescue-in{from{opacity:0;transform:translateY(-5px);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion:reduce){ .tc-rescue{animation:none;} }
@media (prefers-reduced-motion:reduce){ .tc-seg2{transition:none;} }


/* card flip */
.tc-card{perspective:1400px;cursor:pointer;margin-bottom:18px;}
.tc-card-inner{position:relative;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,0,.2,1);min-height:340px;}
.tc-card.is-flipped .tc-card-inner{transform:rotateY(180deg);}
.tc-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;
  background:radial-gradient(130% 120% at 30% -12%, rgba(124,92,255,.22) 0%, rgba(64,84,168,.12) 45%, rgba(255,255,255,.05) 80%);
  backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%);
  color:#fff;border-radius:24px;
  display:flex;flex-direction:column;align-items:center;gap:10px;
  padding:34px 28px;box-sizing:border-box;overflow-y:auto;overscroll-behavior:contain;
  box-shadow:0 24px 54px -22px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.14);}
/* "safe center" centres normally but falls back to flex-start when the content is taller
   than the box, so a long back scrolls instead of escaping above the card. The previous
   fix used auto margins, which looked fine until you noticed the chip and the flip cue
   are absolutely positioned — so only the top margin ever applied and every card sat low
   with a band of dead space above it. (No backticks in here: this whole stylesheet lives
   inside a template literal, and one closes it.) */
.tc-face{justify-content:center;justify-content:safe center;}
.tc-back{transform:rotateY(180deg);}
.tc-kindchip{position:absolute;top:16px;right:18px;font-family:"Yu Gothic","Noto Sans JP",sans-serif;
  font-size:12px;color:rgba(255,255,255,.7);letter-spacing:.1em;border:0;
  padding:4px 11px;border-radius:99px;background:rgba(255,255,255,.12);}
.tc-term{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:54px;line-height:1.15;font-weight:600;text-align:center;color:#fff;}
.tc-term-sm{font-size:46px;}
/* Size by length instead of one size for everything. A lone kanji at the shared 54px read
   as small and cramped — and the strokes separating it from a near neighbour are exactly
   what you are being asked to see — while a ten-character phrase needs to stay on the
   card. The steps below keep every length filling roughly the same width. */
.tc-term-1{font-size:132px;line-height:1;}
.tc-term-2{font-size:104px;line-height:1.02;}
.tc-term-3{font-size:84px;line-height:1.05;}
.tc-term-4{font-size:72px;line-height:1.08;}
.tc-term-5{font-size:62px;line-height:1.1;}
.tc-frontromaji{font-family:var(--mono);font-size:13px;letter-spacing:.14em;color:rgba(255,255,255,.55);font-style:normal;}
.tc-prompt-en{font-size:26px;font-weight:600;text-align:center;color:#fff;line-height:1.3;}
.tc-flipcue{position:absolute;bottom:14px;font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.4);}
.tc-reading{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:34px;font-weight:600;color:#fff;}
.tc-romaji{font-family:var(--mono);font-size:14px;letter-spacing:.14em;color:var(--shu-soft);font-style:normal;}
.tc-meaning{font-size:20px;color:#fff;text-align:center;margin-top:4px;font-weight:500;}
.tc-meaning-lg{font-size:26px;font-weight:600;}
.tc-reading-front{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:24px;color:rgba(255,255,255,.72);font-weight:500;}
.tc-emoji{font-size:64px;line-height:1;margin-bottom:4px;}
.tc-emoji-lg{font-size:80px;}
/* ── the non-flashcard exercises ──
   These are plain blocks rather than 3D faces: there is nothing to flip, and giving them
   the card's absolute-positioned faces is what would reintroduce the overflow problem. */
.tc-learn,.tc-mcwrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;
  background:radial-gradient(130% 120% at 30% -12%, rgba(124,92,255,.22) 0%, rgba(64,84,168,.12) 45%, rgba(255,255,255,.05) 80%);
  backdrop-filter:blur(22px) saturate(150%);-webkit-backdrop-filter:blur(22px) saturate(150%);
  border-radius:24px;padding:34px 28px 30px;margin-bottom:18px;min-height:340px;box-sizing:border-box;
  justify-content:center;color:#fff;
  box-shadow:0 24px 54px -22px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.14);}
.tc-learn-tap{cursor:pointer;}
.tc-learn-tap:focus-visible{outline:2px solid rgba(201,184,255,.85);outline-offset:3px;}
.tc-learn-tap:hover{background:radial-gradient(140% 130% at 30% -12%, rgba(124,92,255,.3) 0%, rgba(64,84,168,.16) 45%, rgba(255,255,255,.06) 80%);}
.tc-learnchip{background:rgba(120,220,170,.2);color:#c8f5df;}
/* The other side of the card from the new-word chip, because both are absolute and both
   want the top edge. Amber: this is a heads-up about where the word came from, not a
   correctness signal. */
.tc-enrichchip{right:auto;left:18px;background:rgba(245,158,11,.2);color:#ffdda8;}
.tc-mcchip{background:rgba(140,170,255,.2);color:#d3e0ff;}
.tc-listenchip{background:rgba(255,200,120,.2);color:#ffe2b8;}
.tc-learnnote{margin:6px 0 0;font-size:13px;color:rgba(255,255,255,.6);text-align:center;}
.tc-mcprompt{display:flex;flex-direction:column;align-items:center;gap:3px;margin-bottom:10px;}
.tc-mcfurigana{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:19px;letter-spacing:.06em;color:rgba(255,255,255,.66);}
.tc-mcterm{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:44px;line-height:1.15;font-weight:600;text-align:center;color:#fff;}
.tc-mcterm.tc-term-1{font-size:104px;line-height:1;}
.tc-mcterm.tc-term-2{font-size:84px;line-height:1.02;}
.tc-mcterm.tc-term-3{font-size:70px;line-height:1.05;}
.tc-mcterm.tc-term-4{font-size:60px;line-height:1.08;}
.tc-mcterm.tc-term-5{font-size:52px;line-height:1.1;}
.tc-listenprompt{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:6px;}
.tc-listenprompt .tc-speakbtn{font-size:34px;padding:16px 20px;}
.tc-noaudio{appearance:none;margin-top:4px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);
  color:rgba(255,255,255,.75);border-radius:99px;font:inherit;font-size:12px;padding:6px 13px;cursor:pointer;}
.tc-noaudio:hover{background:rgba(255,255,255,.13);color:#fff;}
.tc-listenreveal{margin-top:10px;font-family:"Hiragino Sans","Noto Sans JP",sans-serif;font-size:22px;color:rgba(255,255,255,.8);}
.tc-mcopts{display:flex;flex-direction:column;gap:9px;width:min(100%,380px);}

/* Kana options are compared character by character, so they need to be big, monospaced-ish
   and generously spaced — the whole task is spotting a one-kana difference. */
.tc-mcopt-kana{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:21px;letter-spacing:.14em;text-align:center;font-weight:500;}
.tc-mcopt{appearance:none;text-align:left;font:inherit;font-size:16px;line-height:1.4;color:#fff;
  background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.16);border-radius:12px;
  padding:12px 15px;cursor:pointer;transition:background .12s,border-color .12s;}
.tc-mcopt:hover:not(:disabled){background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.3);}
.tc-mcopt:focus-visible{outline:2px solid rgba(201,184,255,.85);outline-offset:2px;}
.tc-mcopt:disabled{cursor:default;opacity:.55;}
.tc-mcopt.is-answer{background:rgba(90,220,150,.2);border-color:rgba(90,220,150,.65);color:#d6ffe9;opacity:1;}
.tc-mcopt.is-wrongpick{background:rgba(255,110,90,.18);border-color:rgba(255,110,90,.6);color:#ffd5cf;opacity:1;}
.tc-clozechip{background:rgba(120,200,255,.2);color:#cfe9ff;}
.tc-clozeen{margin:0 0 4px;font-size:15px;line-height:1.5;color:var(--mut-2);text-align:center;max-width:34ch;}
.tc-clozesent{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:30px;line-height:1.5;text-align:center;color:#fff;margin-bottom:12px;max-width:22ch;}
.tc-clozeblank{color:#8fd0ff;border-bottom:2px solid rgba(143,208,255,.5);padding:0 2px;}
.tc-clozeblank.is-right{color:#b8f0d0;border-color:rgba(90,220,150,.7);}
.tc-clozeblank.is-wrong{color:#ffc2bb;border-color:rgba(255,120,100,.7);}
.tc-clozesrc{margin:10px 0 0;font-family:var(--mono);font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:rgba(255,255,255,.4);}
.tc-mchint{margin:0;font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.45);}
/* ── cue, explanation, session summary ── */
.tc-reading-masked{letter-spacing:.1em;color:rgba(255,255,255,.55);}
.tc-cuehint{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;
  font-size:26px;letter-spacing:.12em;color:#c9b8ff;background:rgba(124,92,255,.14);
  border-radius:8px;padding:5px 14px;}
.tc-whywrap{display:flex;justify-content:center;margin:-6px 0 14px;}
.tc-whybtn{appearance:none;background:none;border:0;cursor:pointer;font:inherit;font-size:12px;
  color:var(--mut-2);text-decoration:underline;text-underline-offset:3px;padding:4px 8px;}
.tc-whybtn:hover{color:#fff;}
.tc-whytext{margin:0;max-width:46ch;text-align:center;font-size:13px;line-height:1.6;color:var(--mut-2);
  background:rgba(255,255,255,.05);border-radius:8px;padding:9px 14px;}
.tc-sessum{margin:18px auto 0;max-width:340px;text-align:left;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:14px 16px;}
.tc-sessumh{margin:0 0 9px;font-family:var(--mono);font-size:11px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--mut-2);}
.tc-sessumlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;}
.tc-sessumlist li{display:flex;justify-content:space-between;gap:12px;font-size:14px;color:#fff;}
.tc-sessumlist b{font-variant-numeric:tabular-nums;color:#c9b8ff;}
.tc-sessumnote{margin:11px 0 0;font-size:12px;line-height:1.5;color:var(--mut-2);}
.tc-sessumnote b{color:#ffd0c8;}
/* ── study plan ── */
.tc-plan{display:flex;flex-direction:column;gap:26px;padding-bottom:40px;}
.tc-plansec{display:flex;flex-direction:column;gap:11px;background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:20px 20px 22px;}
.tc-planh{margin:0;font-size:19px;font-weight:650;color:#fff;display:flex;align-items:baseline;gap:9px;}
.tc-planh-sub{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut-2);font-weight:400;}
.tc-planhint{margin:0;font-size:14px;line-height:1.6;color:var(--mut-2);max-width:62ch;}

.tc-checkq{font-size:28px;font-weight:600;text-align:center;margin:18px 0 14px;line-height:1.3}
.tc-checkin{display:block;width:100%;box-sizing:border-box;font-size:26px;text-align:center;
  padding:12px 14px;border-radius:12px;border:2px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.06);color:inherit;font-family:inherit}
.tc-checkin:focus{outline:none;border-color:rgba(255,255,255,.45)}
.tc-prod{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);text-align:center}
.tc-prodprompt{font-size:17px;opacity:.85;margin:6px 0 12px}
.tc-prodsent{font-size:24px;line-height:1.6;margin:10px 0;min-height:36px}
.tc-prodblank{opacity:.4;font-size:16px}
.tc-prodtiles{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:12px 0}
.tc-fchip.is-used{opacity:.25}
.tc-prodresult{margin-top:12px}
.tc-prodok{color:#7fd88f;font-weight:600}
.tc-prodbad{color:#ffb3a7;font-weight:600}
.tc-kctx{display:flex;gap:10px;align-items:baseline;justify-content:center;margin-bottom:6px;opacity:.8}
.tc-kctxk{font-size:26px;font-weight:700}
.tc-kctxm{font-size:13px;opacity:.75}
.tc-kchit{color:#8fd0ff}
.tc-mine{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}
.tc-minelist{display:flex;flex-direction:column;gap:5px;margin:10px 0}
.tc-minerow{display:grid;grid-template-columns:auto auto auto 1fr auto;gap:8px;align-items:baseline;
  padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.05);cursor:pointer}
.tc-minerow.is-on{background:rgba(120,200,255,.14)}
.tc-mineterm{font-size:18px;font-weight:600}
.tc-mineread{opacity:.7;font-size:13px}
.tc-minemean{opacity:.75;font-size:13px}
.tc-minecount{opacity:.55;font-size:12px}
.tc-minesent{grid-column:1/-1;opacity:.55;font-size:12px;line-height:1.5}
.tc-checkkana{text-align:center;font-size:26px;min-height:34px;margin-top:10px;opacity:.85;letter-spacing:.02em}
.tc-checkrow{display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap}
.tc-btn-quiet{opacity:.6}
.tc-checkmiss{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.tc-checkmissrow{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;
  padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.05)}
.tc-checkterm{font-size:19px;font-weight:600}
.tc-checkread{opacity:.75}
.tc-checken{opacity:.6;flex:1 1 120px}
.tc-checkgot{opacity:.5;font-size:13px}
.tc-checkgot.is-near{opacity:.85}
.tc-planfield{display:flex;flex-direction:column;gap:5px;}
.tc-planfield span{font-size:13px;color:rgba(255,255,255,.75);}
.tc-planfield textarea{width:100%;box-sizing:border-box;resize:vertical;font:inherit;font-size:14px;line-height:1.5;
  background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 12px;color:#fff;}
.tc-planfield textarea:focus{outline:2px solid rgba(124,92,255,.6);outline-offset:1px;}
.tc-goals{display:flex;flex-direction:column;gap:8px;}
.tc-goal{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.1);
  border-radius:12px;padding:9px 11px;}
.tc-goal.is-done .tc-goaltext{text-decoration:line-through;color:var(--mut-2);}
.tc-goalcheck{flex:none;width:22px;height:22px;border-radius:8px;border:1.5px solid rgba(255,255,255,.3);
  background:rgba(255,255,255,.06);color:#8ef0bd;font-size:13px;cursor:pointer;}
.tc-goal.is-done .tc-goalcheck{background:rgba(90,220,150,.22);border-color:rgba(90,220,150,.6);}
.tc-goaltext{flex:1;font-size:14px;color:#fff;line-height:1.4;}
.tc-goalarea,.tc-goaldrop{flex:none;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);
  color:#fff;border-radius:8px;font:inherit;font-size:12px;padding:5px 7px;cursor:pointer;}
.tc-goaldrop{width:26px;font-size:15px;line-height:1;color:var(--mut-2);}
.tc-goaladd{display:flex;gap:8px;}
.tc-goaladd input{flex:1;min-width:0;font:inherit;font-size:14px;background:rgba(0,0,0,.22);
  border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:9px 11px;color:#fff;}
.tc-prios{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:9px;}
.tc-prio{display:flex;align-items:center;justify-content:space-between;gap:10px;
  background:rgba(0,0,0,.18);border-radius:8px;padding:8px 10px;}
.tc-prioname{font-size:14px;color:#fff;}
.tc-priobtns{display:flex;gap:4px;}
.tc-priobtn{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);
  color:var(--mut-2);border-radius:8px;font:inherit;font-size:12px;padding:4px 9px;cursor:pointer;}
.tc-priobtn.is-on{background:rgba(124,92,255,.3);border-color:rgba(124,92,255,.65);color:#fff;}
.tc-paces{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;}
.tc-pace{display:flex;flex-direction:column;gap:4px;text-align:left;cursor:pointer;
  background:rgba(0,0,0,.2);border:1.5px solid rgba(255,255,255,.12);border-radius:12px;padding:13px 14px;color:#fff;font:inherit;}
.tc-pace.is-on{border-color:rgba(124,92,255,.7);background:rgba(124,92,255,.16);}
.tc-pacelabel{font-size:16px;font-weight:650;}
.tc-pacemins{font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:var(--shu-soft);}
.tc-pacenote{font-size:12px;line-height:1.45;color:var(--mut);}
/* The north-star number. Display size from the type scale, because if it is not the
   biggest thing in the section it is not a north star. */
.tc-gainhead{display:flex;align-items:baseline;gap:12px;margin:4px 0 10px;}
.tc-gainnum{font:var(--t-xl);letter-spacing:-.02em;color:var(--ok);font-variant-numeric:tabular-nums;}
.tc-gainunit{font:var(--t-caps);letter-spacing:.05em;text-transform:uppercase;color:var(--mut-2);line-height:1.35;}
.tc-cover{display:flex;flex-direction:column;gap:7px;}
.tc-coverrow{display:grid;grid-template-columns:130px 1fr 38px;align-items:center;gap:10px;}
.tc-covername{font-size:14px;color:rgba(255,255,255,.85);}
.tc-coverbar{position:relative;}
/* The credible interval, drawn behind the estimate. A wide band is the honest way to say
   "we do not know yet" — far better than a number that looks equally confident at four
   observations and at ninety. */
.tc-coverband{position:absolute;top:0;bottom:0;background:rgba(255,255,255,.13);border-radius:99px;}
.tc-coverfill{position:relative;}
.tc-coverbar{height:9px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden;}
.tc-coverfill{height:100%;background:linear-gradient(90deg,rgba(124,92,255,.85),rgba(180,150,255,.85));border-radius:99px;min-width:2px;}
.tc-coverfill.is-gap{background:rgba(255,110,90,.6);}
.tc-covernum{font-family:var(--mono);font-size:12px;color:var(--mut-2);text-align:right;}
.tc-covergap{margin:12px 0 0;font-size:14px;line-height:1.6;color:#ffd0c8;background:rgba(255,110,90,.12);
  border-radius:8px;padding:10px 13px;}
/* ── lesson mastery, by act-scene ──
   The bar itself is the profile bar reused verbatim: tc-coverband is the credible interval,
   tc-coverfill the estimate. Same posteriors, same drawing, so the two panels read as one
   claim rather than as two competing scores. Only the frame around them is new. */
.tc-scenes{display:flex;flex-direction:column;gap:10px;}
.tc-scene{display:flex;flex-direction:column;gap:9px;background:rgba(0,0,0,.2);
  border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:12px 13px;}
.tc-scenehead{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 10px;}
.tc-scenename{font-size:15px;font-weight:650;color:#fff;}
/* Progress and mastery sit on one line and must never look like one number, so the pair is
   set in the mono caps used for every other measured quantity on this page. */
.tc-scenemeta{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut-2);}
.tc-scenebars{display:flex;flex-direction:column;gap:6px;}
.tc-scenerow{display:grid;grid-template-columns:92px 1fr 36px;align-items:center;gap:9px;}
.tc-scenesk{font-size:13px;color:rgba(255,255,255,.8);}
.tc-scenebar{position:relative;height:8px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden;}
.tc-scenenum{font-family:var(--mono);font-size:11px;color:var(--mut-2);text-align:right;}
.tc-scenenote{margin:0;font-size:13px;line-height:1.55;color:var(--mut-2);}
.tc-scenenote b{color:#fff;font-weight:600;}
.tc-scenemore{align-self:flex-start;}
.tc-planlist{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.6;color:var(--mut-2);}
.tc-planlist b{color:#fff;font-weight:600;}
@media(max-width:560px){.tc-coverrow{grid-template-columns:110px 1fr 32px;}
  .tc-scenerow{grid-template-columns:84px 1fr 32px;gap:8px;}}
.tc-setupline{font-size:14px;color:var(--mut-2);line-height:1.6;margin:0 0 22px;max-width:48ch;}
.tc-rpill{appearance:none;border:1px solid var(--outline-2);background:var(--surface-2);
  color:var(--mut-2);font:inherit;font-size:12px;font-weight:600;padding:5px 12px;border-radius:99px;
  cursor:pointer;transition:all .15s;white-space:nowrap;flex:none;}
.tc-rpill:hover{color:#fff;}
.tc-rpill.is-on{background:var(--surface-3);border-color:var(--info);color:var(--washi);font-weight:600;}

.tc-grade{display:flex;gap:10px;}

/* done */
.tc-done,.tc-empty,.tc-add,.tc-browse{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);
  border-radius:16px;padding:30px;}
.tc-done{text-align:center;}
.tc-bignum{font-size:82px;font-weight:300;letter-spacing:-.02em;color:#fff;line-height:1;font-family:-apple-system,"SF Pro Display",BlinkMacSystemFont,"Segoe UI",sans-serif;}
.tc-bignum span{font-size:30px;color:var(--shu-soft);}
.tc-donesub{color:var(--mut-2);font-size:14px;margin:8px 0 22px;}
.tc-donemove{margin:-14px 0 20px;font-size:14px;font-weight:600;color:rgb(232,191,90);letter-spacing:.01em;}
.tc-donerate{margin:6px 0 0;font-size:14px;color:var(--mut);}
.tc-donerate b{color:var(--ok);}
.tc-donebtns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}

.tc-empty{text-align:center;color:var(--mut-2);display:flex;flex-direction:column;gap:16px;align-items:center;}

/* browse */
.tc-browsebar{display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap;}
.tc-search{flex:1;min-width:160px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);
  border-radius:8px;padding:10px 14px;color:#fff;font:inherit;font-size:14px;}
.tc-search::placeholder{color:var(--mut-2);}
.tc-confirm{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--mut-2);}
.tc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;}
.tc-row{display:grid;grid-template-columns:auto 1.3fr 1.3fr 1.4fr auto auto;gap:12px;align-items:center;
  padding:11px 8px;border-bottom:1px solid rgba(255,255,255,.07);font-size:14px;}
.tc-rowkind{font-family:"Yu Gothic","Noto Sans JP",sans-serif;font-size:10px;color:var(--ai);
  background:var(--washi-2);border-radius:4px;padding:3px 6px;text-align:center;white-space:nowrap;}
.tc-rowterm{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:19px;color:#fff;}
.tc-rowread{display:flex;flex-direction:column;color:var(--washi);}
.tc-rowread em{font-style:italic;color:var(--shu-soft);font-size:12px;letter-spacing:.08em;}
.tc-rowmean{color:var(--mut-2);}
.tc-rowstat{font-size:12px;color:var(--mut-2);font-variant-numeric:tabular-nums;text-align:right;}
.tc-del{appearance:none;border:0;background:transparent;color:var(--mut-2);cursor:pointer;font-size:14px;min-width:32px;min-height:32px;border-radius:8px;
  padding:4px 6px;border-radius:8px;transition:all .15s;}
.tc-del:hover{color:var(--shu-soft);background:rgba(216,72,47,.12);}

/* add */
.tc-addhelp{font-size:14px;color:var(--mut-2);line-height:1.6;margin:0 0 14px;}
.tc-addhelp code{display:inline-block;margin-top:6px;background:rgba(0,0,0,.25);color:var(--washi);
  padding:4px 10px;border-radius:8px;font-size:13px;}
.tc-textarea{width:100%;box-sizing:border-box;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.14);
  border-radius:8px;padding:14px;color:#fff;font:inherit;font-size:15px;line-height:1.7;resize:vertical;}
.tc-textarea::placeholder{color:var(--mut-2);}
.tc-addrow{display:flex;align-items:center;gap:14px;margin-top:14px;}
.tc-addmsg{font-size:14px;color:var(--shu-soft);}
.tc-addnote{font-size:12px;color:var(--mut-2);margin:18px 0 0;line-height:1.6;border-top:1px solid rgba(255,255,255,.08);padding-top:14px;}

.tc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}

.tc-btn:focus-visible,.tc-tab:focus-visible,.tc-segbtn:focus-visible,.tc-card:focus-visible,
.tc-search:focus-visible,.tc-textarea:focus-visible,.tc-del:focus-visible{
  outline:2px solid var(--shu-soft);outline-offset:2px;}

@media (max-width:560px){
  .tc-term{font-size:46px;}
  .tc-prow-top{flex-wrap:wrap;}
  .tc-prow-top .tc-rowread{flex-basis:100%;order:3;}
  .tc-prow-top .tc-del{margin-left:auto;}
}
@media (prefers-reduced-motion:reduce){
  .tc-card-inner{transition:none;}
}
/* ── mastery colour ──
   --mastery (an "r,g,b" triplet) and --mastery-w (0..1) are set per card in masteryStyle().
   Both faces read them, so the warmth survives the flip. Deliberately restrained: the tint
   lives in the rim, the glow and a rail, never behind the Japanese itself — a wash under
   36px kanji costs more legibility than the signal is worth. The default keeps unstyled
   uses (Kanji tab's own .tc-card-inner) looking exactly as before. */
.tc-card{--mastery:107,122,148; --mastery-w:0;}
.tc-card .tc-face{
  border:1px solid rgba(var(--mastery), calc(.20 + .45 * var(--mastery-w)));
  box-shadow:
    0 24px 54px -22px rgba(0,0,0,.7),
    inset 0 1px 0 rgba(255,255,255,.14),
    0 0 calc(18px + 46px * var(--mastery-w)) calc(-14px + 2px * var(--mastery-w)) rgba(var(--mastery), calc(.10 + .38 * var(--mastery-w)));
  transition:border-color .6s ease, box-shadow .6s ease;
}
/* The rail is the actual readable scale — a bar that fills and warms with stability, so
   "how well do I know this" is answerable at a glance without reading a number. */
.tc-card .tc-face::after{
  content:"";position:absolute;left:26px;right:26px;bottom:14px;height:3px;border-radius:2px;
  background:linear-gradient(90deg,
    rgba(var(--mastery),.95) 0%,
    rgba(var(--mastery),.95) calc(var(--mastery-w) * 100%),
    rgba(255,255,255,.09) calc(var(--mastery-w) * 100%),
    rgba(255,255,255,.09) 100%);
  transition:background .6s ease;
}
@media (prefers-reduced-motion:reduce){
  .tc-card .tc-face,.tc-card .tc-face::after{transition:none;}
}
/* The other exercise formats (learn / mc / listen / cloze) are flat panels rather than
   flip cards, so they take the same warmth as a rim + rail without the 3D face rules. */
.tc-mcwrap,.tc-learn{--mastery:107,122,148; --mastery-w:0; position:relative;}
.tc-mcwrap::after,.tc-learn::after{
  content:"";position:absolute;left:0;right:0;bottom:-10px;height:3px;border-radius:2px;
  background:linear-gradient(90deg,
    rgba(var(--mastery),.95) 0%,
    rgba(var(--mastery),.95) calc(var(--mastery-w) * 100%),
    rgba(255,255,255,.09) calc(var(--mastery-w) * 100%),
    rgba(255,255,255,.09) 100%);
  transition:background .6s ease;
}
@media (prefers-reduced-motion:reduce){
  .tc-mcwrap::after,.tc-learn::after{transition:none;}
}



/* focus + insights */
.tc-focus-btn{margin-top:10px;border-color:var(--shu);color:var(--shu-soft);}
.tc-focus-btn:hover{background:rgba(216,72,47,.12);}
.tc-smart-btn{background:linear-gradient(130deg,#4054a8 0%,#7c5cff 55%,#b0543f 125%);color:#fff;border:none;font-weight:600;box-shadow:0 10px 26px -12px rgba(124,92,255,.65);}
.tc-smart-btn:hover{filter:brightness(1.12);}
/* The practice-mode picker that sits above Smart Review. It borrows every colour from
   .tc-segbtn so the three modes read as the same control as the pickers on Sentences and
   Scripts, and keeps that rule's 40px touch target. (The dead flex .tc-seg row rule and
   the border-color-on-border:0 armed state this block once worked around are fixed at the
   source now — the 20x4px pip in Browse is the only .tc-seg left.) */
.tc-modeseg{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px;}
.tc-modeseg .tc-segbtn{flex:1 1 28%;min-width:96px;padding:9px 10px;font-size:13px;text-align:center;}
/* The minutes a pace buys, set inside its own button. Said quietly: the label is the
   choice ("Short"), the number is only the evidence for it. */
.tc-modeseg .tc-segbtn i{font-style:normal;font-family:var(--mono);font-size:11px;opacity:.6;}
/* The act override on the Plan tab. Borrows the goal dropdown's colours; only the size
   changes, because that one sits inline in a goal row and this one is a settings control
   with a thumb aimed at it. */
.tc-actsel{font-size:14px;padding:9px 11px;min-height:40px;}
.tc-smarthint{margin:8px 0 0;font-size:12px;color:var(--mut-2);line-height:1.5;text-align:center;}
.tc-kind-prod{background:rgba(216,72,47,.16);border-color:rgba(216,72,47,.4);color:var(--shu-soft);}
/* Production cards read as a different exercise on purpose — the visual break is part of
   what stops the session settling into one mode. */
.tc-prodchip{background:rgba(124,92,255,.2);border-color:rgba(124,92,255,.45);color:#c9b8ff;}
.tc-prodprompt{font-size:26px;font-weight:600;line-height:1.3;color:#fff;text-align:center;padding:0 14px;max-width:340px;}
.tc-prodanswer{color:#c9b8ff;}
/* Typed spelling on a production card. The kana line under the box echoes the conversion
   live, so a mistyped reading is visible as kana before it is committed — the point is to
   test the spelling, not to punish an unfamiliar rōmaji convention. */
.tc-spellbox{margin-top:14px;display:flex;flex-direction:column;gap:7px;align-items:center;width:100%;}
.tc-spellinput{width:min(100%,300px);box-sizing:border-box;background:rgba(255,255,255,.94);border:1.5px solid rgba(201,184,255,.55);border-radius:8px;padding:9px 12px;font:inherit;font-size:15px;text-align:center;color:var(--sumi);}
.tc-spellinput:focus{outline:2px solid rgba(201,184,255,.8);outline-offset:1px;}
.tc-spellkana{min-height:22px;font-size:19px;letter-spacing:.04em;color:#c9b8ff;}
.tc-spellbox .tc-btn{width:min(100%,300px);}
.tc-spellverdict{font-family:var(--mono);font-size:12px;letter-spacing:.06em;padding:5px 11px;border-radius:8px;margin-bottom:8px;}
.tc-spellverdict.is-right{color:#b8f0d0;background:rgba(90,220,150,.13);}
.tc-spellverdict.is-wrong{color:#ffc2bb;background:rgba(255,120,100,.13);}
.tc-spellverdict b{font-weight:700;letter-spacing:.02em;}
.tc-retention{display:flex;flex-direction:column;gap:7px;align-items:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:11px 12px;}
.tc-retlabel{font-size:12px;color:var(--mut-2);letter-spacing:.04em;text-transform:uppercase;}
.tc-retention .tc-smarthint{margin:0;}
.tc-mnbox{margin-top:10px;display:flex;flex-direction:column;gap:6px;align-items:center;width:100%;}
.tc-mnin{width:min(100%,300px);box-sizing:border-box;background:rgba(255,255,255,.9);border:1.5px solid rgba(230,162,60,.5);border-radius:8px;padding:8px 11px;font:inherit;font-size:14px;color:var(--sumi);}
.tc-mnshow{margin:8px 0 0;font-size:13px;line-height:1.5;color:#ffd9a0;background:rgba(255,190,90,.1);border-radius:8px;padding:6px 11px;max-width:300px;}
.tc-leechtag{margin-top:10px;font-size:12px;color:#e6a23c;background:rgba(230,162,60,.12);border:1px solid rgba(230,162,60,.35);padding:3px 10px;border-radius:99px;}
.tc-leechpill{font-size:11px;font-weight:600;color:#e6a23c;background:rgba(230,162,60,.13);border:1px solid rgba(230,162,60,.35);padding:2px 8px;border-radius:99px;}
.tc-coachcard{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:14px 16px;margin-bottom:10px;}
.tc-coachhead{margin:0 0 8px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut-2);}
.tc-coachplan{margin:0;padding-left:20px;color:var(--washi);font-size:14px;line-height:1.65;}
.tc-coachplan li{margin-bottom:6px;}
.tc-coachline{margin:0;color:var(--washi);font-size:15px;line-height:1.6;}
.tc-coachbtns{display:flex;gap:8px;margin:14px 0 6px;}
.tc-coachbtns .tc-btn-primary{flex:1;}
.tc-coacherr{font-size:13px;color:#e6a23c;line-height:1.5;}
.tc-coachai{border-color:rgba(216,72,47,.35);}
.tc-pre{white-space:pre-wrap;}
.tc-kanabar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
.tc-kanaseg{display:flex;gap:6px;flex-wrap:wrap;}   /* must wrap: the set row is 6 chips and overflowed the screen on phones */
.tc-kanaprog{margin:0 0 12px;font-size:12px;color:var(--mut-2);}
.tc-kanagrid{display:flex;flex-direction:column;gap:6px;}
.tc-kanarow{display:flex;gap:6px;}
.tc-kanacell{appearance:none;border:0;background:rgba(255,255,255,.055);border-radius:var(--r-s);flex:1;min-width:0;min-height:56px;padding:8px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;font:inherit;color:#fff;transition:transform .1s,border-color .15s;}
.tc-kanacell:active{transform:scale(.94);}
.tc-kanach{font-size:24px;line-height:1.15;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;}
.tc-kanar{font-family:var(--mono);font-size:10px;letter-spacing:.06em;color:var(--mut-2);}
.kn-untouched{opacity:.55;}
.kn-good{background:radial-gradient(120% 130% at 50% -10%, rgba(80,200,120,.38) 0%, rgba(80,200,120,.08) 70%);border-color:rgba(95,185,106,.45);}
.kn-mid{background:radial-gradient(120% 130% at 50% -10%, rgba(230,162,60,.32) 0%, rgba(230,162,60,.06) 70%);border-color:rgba(230,162,60,.4);}
.kn-weak{background:radial-gradient(120% 130% at 50% -10%, rgba(226,88,62,.36) 0%, rgba(226,88,62,.07) 70%);border-color:rgba(216,72,47,.45);}
.tc-kanadrill{text-align:center;}
.tc-kanaprompt{font-size:44px;font-weight:600;color:#fff;margin:2px 0 12px;letter-spacing:.02em;}
.tc-kananote{font-size:15px;font-weight:400;color:rgba(255,255,255,.55);}
.tc-kanaempty{font-size:16px;line-height:1.5;color:var(--washi,#efeae2);margin:2px 0 14px;max-width:34ch;}
.tc-kanalen{align-items:center;margin:0 0 12px;}
.tc-kanalenlabel{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut-2);margin-right:2px;}
.tc-kanaweak{margin-top:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;}
.tc-kanaweakrow{display:flex;align-items:center;gap:10px;}
.tc-kanaweakch{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:24px;line-height:1;min-width:2.2ch;color:#fff;}
.tc-kanaweakr{font-size:14px;color:var(--washi,#efeae2);min-width:4.5ch;}
.tc-kanaweakmeta{margin-left:auto;font-size:12px;color:var(--mut-2);font-variant-numeric:tabular-nums;}
.kn-ghost{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:150px;line-height:1;color:rgba(31,45,84,.15);pointer-events:none;user-select:none;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;}
.kn-ghost-strong{color:rgba(216,72,47,.5);}
.tc-build{font-size:11px;font-weight:600;color:var(--mut-2);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);padding:2px 7px;border-radius:99px;vertical-align:middle;letter-spacing:.04em;}
.tc-verfoot{margin:28px 0 10px;text-align:center;font-size:10.5px;letter-spacing:.08em;color:var(--mut-2);opacity:.55;user-select:none;}
.tc-backbtn{border-color:rgba(255,255,255,.3);font-weight:600;min-width:84px;}
.tc-hookbtn{appearance:none;margin-top:10px;border:0;background:rgba(255,255,255,.12);color:rgba(255,255,255,.75);font:inherit;font-size:13px;font-weight:500;min-height:34px;padding:6px 14px;border-radius:99px;cursor:pointer;transition:background .15s,transform .1s;}
.tc-hookbtn:active{transform:scale(.95);}
.tc-hookbtn:hover{background:rgba(43,38,32,.06);}
.tc-hooktext{margin:10px 0 0;font-size:14px;line-height:1.55;color:rgba(255,255,255,.92);background:rgba(216,72,47,.18);border:0;border-radius:12px;padding:9px 13px;max-width:34ch;cursor:default;}
.tc-debrief{margin:14px auto 0;font-size:14px;line-height:1.6;color:var(--washi);background:rgba(255,255,255,.05);border:1px solid rgba(216,72,47,.35);border-radius:12px;padding:12px 16px;max-width:52ch;text-align:left;}
.tc-debrief-busy{border-color:rgba(255,255,255,.15);color:var(--mut-2);}
.tc-wscols-solo{grid-template-columns:1fr;}
.tc-wsromaji{font-family:var(--mono);font-style:normal;font-size:12px;letter-spacing:.03em;color:rgba(255,255,255,.5);}
.tc-bkpnudge{margin:10px 0 0;font-size:12px;color:#e6a23c;line-height:1.5;}
.tc-restore{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 14px;margin-bottom:12px;}
.tc-restorehint{margin:0 0 8px;font-size:12px;color:var(--mut-2);line-height:1.5;}
.tc-restorebox{width:100%;box-sizing:border-box;min-height:88px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.15);border-radius:8px;color:#fff;font-family:ui-monospace,monospace;font-size:12px;padding:8px;}
.tc-restorebtns{display:flex;gap:8px;margin-top:8px;}
.tc-restoremsg{font-size:13px;color:#e6a23c;line-height:1.5;margin:8px 0 0;}
.tc-voicerow{display:flex;gap:6px;margin:10px 0 2px;}
.tc-voicenote{margin:8px 0 0;font-size:12px;color:var(--mut-2);}
.tc-rehnav{display:flex;gap:8px;align-items:center;margin-top:14px;}
.tc-rehnav .tc-btn-primary{flex:1;}
.tc-rehnav .tc-btn-sm:disabled{opacity:.35;cursor:default;}
.tc-summary{display:flex;gap:8px;margin-bottom:12px;}
.tc-sumitem{flex:1;background:transparent;border:0;border-radius:0;padding:8px 4px;text-align:center;display:flex;flex-direction:column;gap:2px;}
.tc-sumitem b{font-size:30px;font-weight:300;letter-spacing:-.02em;color:#fff;font-variant-numeric:tabular-nums;}
.tc-sumitem span{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut-2);}
.tc-sum-good b{color:#5fb96a;}
.tc-sum-need b{color:var(--shu-soft);}
.tc-sum-new b{color:#e6a23c;}
.tc-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;}
.tc-fchip{appearance:none;border:1px solid transparent;background:var(--surface-2);color:var(--mut);font:inherit;font-size:14px;font-weight:500;min-height:36px;padding:6px 14px;border-radius:99px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,color .15s,transform .1s;}
@media (max-width:460px){.tc-fchip{font-size:12px;padding:6px 11px;}.tc-kanabar{gap:7px;}}
.tc-fchip:active{transform:scale(.95);}
.tc-fchip.is-on{background:var(--surface-3);border-color:var(--info);color:var(--washi);font-weight:600;}
.tc-fchip-sort{margin-left:auto;}
.tc-fchip-sort.is-on{background:var(--surface-3);border-color:var(--outline-2);color:var(--washi);}
.tc-prow{list-style:none;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;flex-direction:column;gap:6px;}
.tc-prow-top{display:flex;align-items:baseline;gap:10px;}
.tc-prow-top .tc-rowterm{font-size:18px;font-weight:600;color:#fff;}
.tc-prow-top .tc-rowread{font-size:13px;color:var(--mut-2);}
.tc-prow-top .tc-rowread em{margin-left:6px;font-style:italic;opacity:.8;}
.tc-prow-top .tc-del{margin-left:auto;}
.tc-prow-mean{font-size:14px;color:var(--washi);}
.tc-prow-stats{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.tc-meter{display:flex;gap:3px;}
.tc-seg{width:20px;height:4px;border-radius:2px;background:rgba(255,255,255,.14);}
.tc-seg.on{background:linear-gradient(90deg,#7c5cff,#4dc2a8,#5fb96a);}
.tc-prow-num{font-size:12px;color:var(--mut-2);font-variant-numeric:tabular-nums;}
.tc-needpill{font-size:11px;font-weight:600;color:var(--shu-soft);background:rgba(216,72,47,.14);border:1px solid rgba(216,72,47,.35);padding:2px 8px;border-radius:99px;}
.tc-donepill{font-size:11px;font-weight:600;color:#5fb96a;background:rgba(95,185,106,.13);border:1px solid rgba(95,185,106,.3);padding:2px 8px;border-radius:99px;}
.tc-insights{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:16px;margin-top:16px;}
.tc-masterystrip{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--mut-2);margin-bottom:14px;}
.tc-masterystrip>span:first-child{letter-spacing:.14em;text-transform:uppercase;font-size:11px;}
.tc-mbar{flex:1;height:6px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden;}
.tc-mfill{height:100%;background:linear-gradient(90deg,var(--shu),#e6a23c);border-radius:99px;transition:width .4s;}
.tc-mpct{color:#fff;font-weight:600;font-variant-numeric:tabular-nums;}
.tc-wscols{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.tc-wslabel{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut-2);margin:0 0 8px;}
.tc-wsword{display:block;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:15px;color:var(--washi);margin-bottom:4px;}

/* sentences */
.tc-sent{display:flex;flex-direction:column;gap:16px;}
.tc-sentmodes{display:flex;gap:8px;}
.tc-senterr{background:rgba(216,72,47,.14);border:1px solid rgba(216,72,47,.4);color:var(--shu-soft);padding:12px 14px;border-radius:8px;font-size:14px;}
.tc-sentempty{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:30px;text-align:center;display:flex;flex-direction:column;gap:16px;align-items:center;color:var(--mut-2);}
.tc-sentloading{text-align:center;color:var(--shu-soft);padding:40px 20px;font-size:15px;}

.tc-sentgoal{margin:0;font-size:15px;color:rgba(255,255,255,.6);font-style:italic;}
.tc-sentbig{font-size:20px;font-style:normal;font-weight:600;color:var(--sumi);}
.tc-sentjp{margin:0;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:26px;line-height:2.1;color:#fff;font-weight:500;}
.tc-sentjp ruby rt{font-size:.42em;color:var(--shu);font-weight:600;letter-spacing:.02em;}
.tc-sentans ruby rt{font-size:.5em;color:var(--shu);font-weight:600;}
.tc-blank{display:inline-block;min-width:3.2em;border-bottom:2px solid var(--shu);text-align:center;color:var(--shu);}
.tc-sentfull{font-size:24px;}
/* A white box with near-black text — the one rule the dark retheme missed, because it
   hardcoded #fff instead of going through a token. It is on nine inputs across Sentences,
   Scripts and Input, so all of them were glowing white slabs in a dark app. */
.tc-sentinput{width:100%;box-sizing:border-box;background:var(--surface-2);
  border:1px solid var(--outline-2);border-radius:var(--r-s);padding:12px 14px;
  font:inherit;font-size:18px;color:var(--washi);}
.tc-sentinput::placeholder{color:var(--mut-2);}
.tc-sentinput:focus-visible{outline:2px solid var(--info);outline-offset:1px;border-color:var(--info);}
.tc-sentbtns{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}
.tc-idk{border-color:rgba(216,72,47,.45);color:var(--shu-soft);}
.tc-idk:hover{background:rgba(216,72,47,.12);}
.tc-senthint{margin:0;font-size:14px;color:var(--mut);background:var(--washi-2);padding:10px 12px;border-radius:8px;}
.tc-sentresult{margin:0;font-size:18px;font-weight:700;}
.tc-sentresult.ok{color:#2e7d32;}
.tc-sentresult.no{color:var(--shu);}
.tc-sentresult.mid{color:#c77b1e;}
.tc-sentans{margin:0;font-family:var(--mono);font-size:14px;letter-spacing:.06em;color:rgba(255,255,255,.65);font-weight:500;}
.tc-sentfeedback{margin:0;font-size:15px;line-height:1.55;color:var(--sumi);background:var(--washi-2);padding:12px 14px;border-radius:8px;}
.tc-rehhead{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.tc-rehname{font-size:15px;font-weight:600;color:#fff;}
.tc-scriptlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}
.tc-scriptrow{display:flex;align-items:stretch;gap:6px;}
.tc-scriptopen{flex:1;appearance:none;text-align:left;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:var(--washi);font:inherit;padding:14px 16px;border-radius:12px;cursor:pointer;transition:all .15s;display:flex;justify-content:space-between;align-items:center;}
.tc-scriptopen:hover{border-color:var(--shu);background:rgba(216,72,47,.1);}
.tc-scriptname{font-size:16px;font-weight:600;color:#fff;}
.tc-scriptmeta{font-size:12px;color:var(--mut-2);}
.tc-cue{margin:0;font-size:15px;color:rgba(255,255,255,.6);font-style:italic;}
.tc-ladder{margin:0;font-size:12px;color:var(--mut-2);line-height:1.5;}
.tc-offnote{margin:0;font-size:12px;color:var(--mut-2);background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);padding:9px 12px;border-radius:8px;}

/* ---- script listening (MP-14). Mobile first: the replay button is the biggest thing on
   the card because it is the control the learner uses most, and the options are on the
   46px tap floor even when their text is one word long. ---- */
.tc-listenstart{appearance:none;width:100%;box-sizing:border-box;text-align:left;font:inherit;cursor:pointer;
  display:flex;flex-direction:column;gap:4px;padding:14px 16px;min-height:var(--tap);
  border:1px solid var(--outline-2);border-radius:var(--r-m);color:var(--washi);
  background:linear-gradient(180deg,rgba(59,130,246,.14),rgba(59,130,246,.05));
  transition:border-color .15s,background .15s,transform .1s;}
.tc-listenstart:hover{border-color:var(--info);}
.tc-listenstart:active{transform:scale(.99);}
.tc-listenstart-h{font-size:16px;font-weight:600;color:#fff;}
.tc-listenstart-s{font-size:12px;color:var(--mut-2);line-height:1.45;}
/* Wraps, because a script Matthew pasted in himself can be named anything and the chip
   next to the voice controls must not push the row off a 375px screen. */
.tc-listenbar{flex-wrap:wrap;align-items:center;}
/* The provenance chip (spec 3, 10): where in NihonGO NOW! this line comes from. */
.tc-provchip{display:inline-flex;align-items:center;font-family:var(--mono);font-size:11px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--mut);
  background:var(--surface-2);border:1px solid var(--outline-2);border-radius:99px;padding:6px 12px;
  white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;}
.tc-listenq{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:14px;}
.tc-replay{appearance:none;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);
  color:#fff;font-size:38px;line-height:1;width:96px;height:96px;border-radius:50%;cursor:pointer;
  transition:background .15s,border-color .15s,transform .1s;}
.tc-replay:hover{background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.35);}
.tc-replay:active{transform:scale(.95);}
.tc-listensrc{margin:2px 0 0;font-family:var(--mono);font-size:10px;letter-spacing:.14em;
  text-transform:uppercase;color:rgba(255,255,255,.38);}
/* The escape hatch, and what it costs: the line is on screen, so the answer is no longer
   evidence about hearing it. */
.tc-listenshown{margin:8px 0 0;font-size:24px;line-height:1.6;color:rgba(255,255,255,.85);text-align:center;}
.tc-listenopts .tc-mcopt{min-height:var(--tap);display:flex;align-items:center;}
.tc-listenrev{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;margin-top:14px;
  padding-top:14px;border-top:1px solid rgba(255,255,255,.12);}
.tc-listenjp{margin:0;font-size:26px;line-height:1.65;color:#fff;text-align:center;}
.tc-listenen{margin:0;font-size:15px;line-height:1.5;color:var(--mut);text-align:center;max-width:34ch;}
.tc-listentally{list-style:none;margin:12px auto 0;padding:0;width:min(100%,300px);display:flex;flex-direction:column;gap:6px;}
.tc-listentally li{display:flex;justify-content:space-between;gap:10px;font-size:14px;color:var(--mut);
  background:var(--surface-2);border-radius:var(--r-s);padding:8px 12px;}
.tc-listentally b{color:var(--washi);}
.tc-listennote{margin:10px 0 0;font-size:12px;color:var(--mut-2);}
@media (max-width:460px){.tc-replay{width:88px;height:88px;font-size:34px;}.tc-listenjp{font-size:23px;}}

/* ---- dialogue mode (MP-16). Mobile first: the picker is a single column of rows, the
   part buttons stack under the name rather than beside it, and the transcript above the
   options is trimmed to three lines so the answers stay above the fold on a 375px screen.
   Emerald marks the learner's own lines throughout - the same semantic accent the rest of
   the app uses for "yours / correct". ---- */
.tc-modestart{display:flex;flex-direction:column;gap:10px;}
.tc-listenstart.is-dialogue{background:linear-gradient(180deg,rgba(16,185,129,.14),rgba(16,185,129,.05));}
.tc-listenstart.is-dialogue:hover{border-color:var(--ok);}
.tc-diallist{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:10px;}
.tc-dialrow{display:flex;flex-direction:column;gap:8px;padding:12px 14px;
  background:var(--surface-2);border:1px solid var(--outline-2);border-radius:var(--r-m);}
.tc-dialrow.is-off{opacity:.5;}
.tc-dialmeta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}
.tc-dialname{font-size:16px;font-weight:600;color:var(--washi);display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;}
.tc-bosschip{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;
  color:rgb(232,191,90);background:rgba(232,191,90,.12);border:1px solid rgba(232,191,90,.35);
  border-radius:99px;padding:3px 9px;}
.tc-dialparts{display:flex;flex-wrap:wrap;gap:8px;}
.tc-dialparts .tc-segbtn{flex:1 1 140px;min-height:var(--tap);display:flex;flex-direction:column;
  align-items:flex-start;justify-content:center;gap:2px;}
.tc-dialparts .tc-segbtn i{font-style:normal;font-size:11px;opacity:.65;}
.tc-dialwhy{margin:0;font-size:12px;color:var(--mut-2);line-height:1.45;}
.tc-dialpart{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ok);}
/* Already said. Faded and single-line, because it is context rather than content. */
.tc-dialpast{margin:0 0 6px;font-size:13px;line-height:1.5;color:var(--mut-2);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tc-dialpast b{color:var(--mut);font-weight:600;margin-right:6px;}
.tc-dialpast.is-mine b{color:var(--ok);}
.tc-dialsaid{margin:6px 0 14px;padding:12px 14px;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.09);border-radius:var(--r-m);}
.tc-dialwho{margin:0 0 6px;font-family:var(--mono);font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--mut-2);display:flex;align-items:center;gap:8px;}
.tc-dialjp{margin:0;font-size:22px;line-height:1.65;color:#fff;}
.tc-dialen{display:block;margin:6px 0 0;font-size:14px;line-height:1.5;color:var(--mut);}
/* The downshift. Shown only after a miss, and it gives the sound rather than the meaning. */
.tc-dialcue{margin:10px 0 0;font-size:14px;line-height:1.5;color:var(--warn);
  background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:var(--r-s);padding:9px 12px;}
.tc-dialcue b{font-family:var(--mono);color:#ffd76e;}
.tc-dialsay{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;}
.tc-dialbrag{margin:8px 0 0;font-size:16px;line-height:1.5;color:var(--washi);}
.tc-dialbrag b{color:var(--ok);}
/* tc-donexp carries a negative top margin for the study done screen, where it sits under a
   headline. Here it follows a tally, and the pull-up closed the gap to nothing. */
.tc-listentally + .tc-donexp{margin-top:10px;}
/* The conversation, whole, on the end screen. This is the payoff, so it is the one place
   the Japanese and the English sit together with nothing withheld. */
.tc-dialscript{list-style:none;margin:16px auto 0;padding:0;width:min(100%,420px);
  display:flex;flex-direction:column;gap:8px;text-align:left;}
.tc-dialline{display:flex;flex-direction:column;gap:2px;padding:9px 12px;border-radius:var(--r-s);
  background:var(--surface-2);border-left:2px solid var(--outline-2);}
.tc-dialline.is-mine{border-left-color:var(--ok);background:rgba(16,185,129,.08);}
.tc-dialline .tc-dialjp{font-size:18px;}
.tc-dialline .tc-dialen{font-size:13px;}
@media (max-width:460px){.tc-dialjp{font-size:20px;}.tc-dialparts .tc-segbtn{flex:1 1 100%;}}
.tc-write{display:flex;flex-direction:column;gap:14px;}
.tc-canvaswrap{position:relative;width:100%;height:240px;background:#f7f3ea;border:0;border-radius:16px;overflow:hidden;box-shadow:inset 0 2px 10px rgba(0,0,0,.12);}
.tc-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair;display:block;}
.tc-ghost{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;color:rgba(43,38,32,.13);pointer-events:none;user-select:none;line-height:1.1;text-align:center;padding:8px;box-sizing:border-box;}
.tc-writetools{justify-content:center;}
.tc-writereveal{display:flex;flex-direction:column;gap:10px;align-items:center;}
.tc-writeanswer{margin:0;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:40px;color:#fff;font-weight:600;text-align:center;}
.tc-gradebtns{display:flex;gap:10px;width:100%;}
.tc-gradebtns .tc-btn{flex:1;}

/* a11y + motion */
.tc-conj{display:flex;flex-direction:column;gap:14px;}
.tc-conjintro{display:flex;flex-direction:column;gap:14px;align-items:stretch;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:20px;}
.tc-conjtitle{margin:0;font-size:20px;font-weight:600;color:#fff;}
.tc-conjsub{margin:0;font-size:13px;line-height:1.55;color:var(--mut-2);}
.tc-conjchips{display:flex;flex-wrap:wrap;gap:8px;}
.tc-conjchip{appearance:none;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.07);color:var(--washi,#efeae2);
  padding:9px 15px;border-radius:99px;font-size:14px;cursor:pointer;transition:background .15s,color .15s;}
.tc-conjchip:hover{color:#fff;background:rgba(255,255,255,.12);}
.tc-conjchip.is-on{background:rgba(255,255,255,.94);color:#141a33;font-weight:600;border-color:transparent;}
.tc-conjmode{align-self:flex-start;}
.tc-speakbtn{appearance:none;border:0;background:var(--surface-3);border-radius:99px;font-size:14px;line-height:1;padding:5px 9px;cursor:pointer;vertical-align:middle;margin-left:6px;}
.tc-speakbtn:active{background:rgba(255,255,255,.25);}
.tc-timetag{display:inline-block;margin-top:8px;font-size:12px;color:var(--mut-2);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);padding:4px 10px;border-radius:99px;font-variant-numeric:tabular-nums;}
.tc-btn[disabled]{opacity:.5;cursor:default;}
.tc-oral{display:flex;flex-direction:column;gap:12px;}
.tc-oralchat{display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow-y:auto;padding:4px 2px;}
.tc-bubble{max-width:85%;padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.55;white-space:pre-wrap;}
.tc-bubble-you{align-self:flex-end;background:rgba(230,90,70,.22);border:1px solid rgba(230,90,70,.35);color:#fff;border-bottom-right-radius:4px;}
.tc-bubble-kanda{align-self:flex-start;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:var(--washi,#efeae2);border-bottom-left-radius:4px;}
.tc-bubblewho{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.55;margin-bottom:3px;}
.tc-oralbar{display:flex;gap:8px;align-items:stretch;}
.tc-input{appearance:none;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#fff;padding:10px 12px;font-size:15px;}
.tc-input:focus{outline:2px solid rgba(230,90,70,.5);}
.tc-oralinput{flex:1;min-width:0;}
.tc-oraldebrief{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px;}
.tc-oraldebrief h3{margin:0;font-size:16px;color:#fff;}
.tc-debrieftext{margin:0;font-size:14px;line-height:1.6;color:var(--washi,#efeae2);white-space:pre-wrap;}
.tc-conjask{margin-top:10px;font-size:15px;color:rgba(255,255,255,.65);font-style:italic;}
.tc-conjanswer{font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif;font-size:32px;font-weight:600;color:#fff;text-align:center;line-height:1.3;}
.tc-conjhow{font-size:15px;color:var(--shu-soft,#ff8a7a);font-variant-numeric:tabular-nums;}
.tc-conjrule{font-size:12px;color:var(--mut-2);}
.tc-conjnote{margin:6px 12px 0;font-size:12px;line-height:1.5;color:#ffd9a0;background:rgba(255,190,90,.08);border:1px solid rgba(255,190,90,.2);padding:8px 12px;border-radius:8px;}
/* ── study buddy ── */
.tc-buddy{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:12px 14px;margin:0 0 12px;}
/* Combo counts instant recalls, not correct answers — under 3 seconds means the word is
   actually there, and that is what predicts remembering it tomorrow. */
.tc-combo{margin-left:auto;font-size:15px;font-weight:700;color:#8fd6a0;font-variant-numeric:tabular-nums;animation:tc-pop .28s cubic-bezier(.3,1.4,.5,1);}
.tc-combo i{font-style:normal;font-size:11px;opacity:.7;margin-left:1px;}
.tc-combo.is-warm{color:#ffd76e;}
.tc-combo.is-hot{color:#ff9a6e;text-shadow:0 0 12px rgba(255,154,110,.55);}
@keyframes tc-pop{0%{transform:scale(.6);opacity:.3}60%{transform:scale(1.22)}100%{transform:scale(1);opacity:1}}
.tc-donecombo{margin:6px 0 0;font-size:13px;color:var(--mut-2);}
.tc-donecombo b{color:#8fd6a0;font-size:15px;}
@media (prefers-reduced-motion:reduce){.tc-combo{animation:none;}}
.tc-mascot{flex:none;image-rendering:pixelated;image-rendering:crisp-edges;filter:drop-shadow(0 4px 8px rgba(0,0,0,.35));user-select:none;}
.tc-buddytext{min-width:0;display:flex;flex-direction:column;gap:7px;}
.tc-buddyline{margin:0;font-size:14px;line-height:1.45;color:var(--washi,#efeae2);}
.tc-buddystats{display:flex;flex-wrap:wrap;gap:6px;}
.tc-stat{font:var(--t-caps);letter-spacing:.05em;color:var(--mut);background:var(--surface-3);border-radius:99px;padding:4px 10px;white-space:nowrap;}
.tc-stat b{color:#fff;font-weight:600;font-size:12px;}
.tc-stat.is-on{background:rgba(255,140,90,.16);color:#ffcbb0;}
.tc-stat.is-on b{color:#ffb08a;}
.tc-troublebtn{background:rgba(255,190,90,.1);border:1px solid rgba(255,190,90,.28);color:#ffd9a0;}



/* ── oral exam ── */
.tc-talkja{margin:0;font-size:23px;line-height:1.65;color:#fff;font-family:"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif;}
.tc-talkrom{margin:0;font-size:14px;line-height:1.6;color:var(--shu-soft,#ff8a7a);font-style:italic;}
.tc-talkcue{display:flex;flex-direction:column;gap:7px;align-items:center;padding:14px 0;}
.tc-talkcuename{margin:0;font-size:26px;font-weight:600;color:#fff;font-family:"Hiragino Sans","Yu Gothic",sans-serif;}
.tc-talkcueword{font-size:19px;color:#ffd9a0;font-family:"Hiragino Sans","Yu Gothic",sans-serif;}
.tc-talknote{margin:0;font-size:12px;color:var(--mut-2);font-style:italic;}
.tc-talkpitch{margin:0;font-size:13px;line-height:1.6;color:#b6efc4;background:rgba(61,145,80,.12);border-radius:8px;padding:6px 11px;}
.tc-talkpitch b{color:#fff;}
.tc-oral{display:flex;flex-direction:column;gap:12px;padding:0 4px 28px;}
.tc-oralsit{text-align:left;display:flex;flex-direction:column;gap:3px;align-items:flex-start;padding:12px 14px;}
.tc-oralsit b{font-size:15px;font-weight:600;color:#fff;}
.tc-oralsit i{font-style:normal;font-size:12px;color:var(--mut-2);}
.tc-prop{background:#fdfbf5;color:#2b2119;border-radius:12px;padding:14px 16px;text-align:center;
  box-shadow:0 8px 22px -12px rgba(0,0,0,.6);}
.tc-flyer{border-top:5px solid #c23a26;}
.tc-receipt{font-family:"SF Mono",Menlo,Consolas,monospace;text-align:left;}
.tc-budget{text-align:left;background:#f2efe6;}
.tc-propttl{margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
.tc-propbig{margin:2px 0;font-size:19px;font-weight:700;}
.tc-propline{margin:2px 0;font-size:14px;}
.tc-propsmall{margin:6px 0 0;font-size:12px;opacity:.7;}
.tc-oralcard{align-items:stretch;text-align:left;gap:9px;padding:15px;}
.tc-oralwho{margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--shu-soft,#ff8a7a);}
.tc-oralq{margin:0;font-size:22px;line-height:1.5;color:#fff;font-family:"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif;}
.tc-oralcue{margin:4px 0 0;font-size:13px;color:var(--mut-2);font-style:italic;}
.tc-oralen{margin:0;font-size:14px;color:var(--mut-2);}
.tc-orala{margin:0;font-size:19px;line-height:1.6;color:#b6efc4;font-family:"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif;}
.tc-oralg{margin:0;font-size:12px;color:#ffd9a0;background:rgba(255,190,90,.1);border-radius:8px;padding:5px 10px;align-self:flex-start;}

/* ── kanji ── */
.tc-kemoji{font-size:44px;line-height:1;margin-bottom:2px;}
.tc-kaudio{appearance:none;border:0;background:rgba(124,92,255,.2);color:#fff;font-size:38px;
  width:96px;height:96px;border-radius:50%;cursor:pointer;line-height:1;}
.tc-kaudio:active{transform:scale(.95);}
.tc-kaudiosm{appearance:none;border:0;background:transparent;font-size:20px;cursor:pointer;padding:0 6px;}
.tc-kmatch{display:flex;flex-direction:column;align-items:center;gap:14px;padding:6px 0;}
.tc-kmatchgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;width:100%;max-width:400px;}
.tc-kmatchcol{display:flex;flex-direction:column;gap:9px;}
.tc-kmatchbtn{appearance:none;font:inherit;font-size:15px;color:var(--washi,#efeae2);
  background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.14);border-radius:12px;
  padding:12px 8px;min-height:56px;cursor:pointer;transition:background .12s,border-color .12s,opacity .2s;}
.tc-kmatchkanji{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:30px;line-height:1;}
.tc-kmatchbtn.is-sel{border-color:#7c5cff;background:rgba(124,92,255,.2);}
.tc-kmatchbtn.is-done{opacity:.28;border-color:#3d9150;}
.tc-kmatchbtn.is-bad{border-color:#c23a26;background:rgba(194,58,38,.2);}
.tc-kwords{display:flex;flex-direction:column;gap:3px;margin:8px 0 0;align-items:center;}
.tc-kword{font-size:13px;color:var(--mut-2);}
.tc-kword b{color:var(--washi,#efeae2);font-weight:600;margin-right:6px;font-size:15px;}
.tc-kquiz{display:flex;flex-direction:column;align-items:center;gap:14px;padding:6px 0 4px;}
.tc-kprompt{margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut-2);}
.tc-kstem{display:flex;align-items:center;gap:10px;min-height:74px;}
.tc-kstemword{font-size:26px;font-weight:600;color:#fff;text-align:center;max-width:320px;line-height:1.3;}
.tc-kopts{display:grid;grid-template-columns:1fr;gap:9px;width:100%;max-width:340px;}
.tc-kopts.is-tiles{grid-template-columns:1fr 1fr;}
.tc-kopt{appearance:none;font:inherit;font-size:16px;color:var(--washi,#efeae2);background:rgba(255,255,255,.05);
  border:1.5px solid rgba(255,255,255,.14);border-radius:12px;padding:14px 12px;cursor:pointer;min-height:52px;
  transition:background .12s,border-color .12s,transform .08s;}
.tc-kopt:active{transform:scale(.98);}
.tc-kopttile{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:38px;line-height:1;}
.tc-kopt.is-right{background:rgba(61,145,80,.22);border-color:#3d9150;color:#b6efc4;}
.tc-kopt.is-wrong{background:rgba(194,58,38,.2);border-color:#c23a26;color:#ffc0b4;}
.tc-kopt.is-dim{opacity:.4;}
.tc-kcorrect.is-ok{color:#b6efc4;background:rgba(61,145,80,.14);}
.tc-kaudiowrap{display:flex;flex-direction:column;align-items:center;gap:9px;}
.tc-kcorrect{margin:0;font-size:14px;line-height:1.6;color:#ffd9a0;background:rgba(255,190,90,.1);
  border-radius:8px;padding:9px 13px;text-align:center;max-width:340px;}
.tc-kcorrect b{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:22px;margin-right:6px;}
.tc-kanji{display:flex;flex-direction:column;gap:12px;padding:0 4px 28px;}
.tc-kanjihero{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:13px 14px;}
.tc-kanjiheroright{flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;}
.tc-kanjicount{margin:0;font-size:13px;color:var(--mut-2);}
.tc-kanjicount b{font-size:26px;color:#fff;font-weight:600;margin-right:4px;}
.tc-kanjibar{height:9px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden;}
.tc-kanjibarfill{height:100%;border-radius:99px;background:linear-gradient(90deg,#f4805c,#ffd76e);transition:width .6s ease;}
.tc-kanjisub{margin:0;font-size:12px;color:var(--mut-2);}
.tc-kanjibig{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:110px;line-height:1.05;color:#fff;}
.tc-kanjimid{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:56px;line-height:1;color:#fff;margin-bottom:4px;}
.tc-kanjiread{font-size:15px;color:var(--washi,#efeae2);letter-spacing:.02em;}
.tc-kanjiread b{color:var(--shu-soft,#ff8a7a);font-weight:600;margin-right:5px;font-size:13px;}
.tc-kanjinext{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:11px 13px;}
.tc-kanjirow{display:flex;flex-wrap:wrap;gap:7px;margin-top:7px;}
.tc-kanjichip{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:24px;color:#fff;background:rgba(255,255,255,.07);border-radius:8px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;}
.tc-dates{display:flex;flex-direction:column;gap:12px;}
.tc-dhead{display:flex;align-items:center;gap:10px;}
.tc-dtitle{margin:0;font-size:17px;color:#fff;}
.tc-dhero{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 0 2px;}
.tc-dwide{width:100%;max-width:420px;align-self:center;}
.tc-dgroups{display:flex;flex-direction:column;gap:8px;margin-top:4px;}
.tc-dgroup{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;
  background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);}
.tc-dgroupinfo{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0;}
.tc-dgroupinfo b{color:#fff;font-size:14px;}
.tc-dgrouphint{font-size:12px;color:var(--mut-2);}
.tc-dbar{height:4px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:2px;}
.tc-dbarfill{height:100%;background:#3d9150;border-radius:2px;transition:width .3s;}
.tc-dgroupbtns{display:flex;gap:6px;flex-shrink:0;}
.tc-dchart{display:flex;flex-direction:column;gap:4px;max-height:60vh;overflow-y:auto;padding-right:2px;}
.tc-drow{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:baseline;text-align:left;
  padding:8px 12px;border-radius:8px;cursor:pointer;color:#fff;
  border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);}
.tc-drow.is-trap{border-color:rgba(255,120,110,.45);background:rgba(255,120,110,.09);}
.tc-drow.is-solid{border-left:3px solid #3d9150;}
.tc-drowk{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:17px;min-width:62px;}
.tc-drowr{font-size:15px;color:#ffd9a0;}
.tc-drowe{font-size:12px;color:var(--mut-2);}
.tc-dcard,.tc-dq{display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 0;}
.tc-dstem{display:flex;flex-direction:column;align-items:center;gap:4px;margin:4px 0 8px;}
.tc-dbig{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:46px;line-height:1.1;color:#fff;}
.tc-dseqen{font-size:22px;line-height:1.35;color:#fff;text-align:center;max-width:340px;}
.tc-dread{font-size:20px;color:#ffd9a0;}
.tc-den{font-size:14px;color:var(--mut-2);}
.tc-dnote{margin:2px 0;font-size:13px;color:#ffb3ab;text-align:center;max-width:340px;}
.tc-dtype{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;max-width:420px;}
.tc-dinput{width:100%;padding:12px 14px;border-radius:12px;font-size:16px;color:#fff;
  background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.16);outline:none;}
.tc-dinput:focus{border-color:#7c5cff;}
.tc-dkana{min-height:30px;font-size:24px;color:#ffd9a0;letter-spacing:.04em;}
/* Pinned to the bottom of the viewport. In normal flow this sat below the fold on a
   phone, so the correct answer and the Continue button were both invisible and answering
   looked like it did nothing. */
.tc-dfeedwrap{position:fixed;left:0;right:0;bottom:0;z-index:40;
  padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));
  background:#3a1f1f;border-top:2px solid rgba(255,120,110,.55);
  animation:tc-dfeedin .18s ease-out;}
.tc-dfeedwrap.is-ok{background:#16301d;border-top-color:rgba(88,190,110,.6);}
/* Fade only. Sliding it in meant the final resting position depended on the animation
   having finished — a backgrounded tab leaves the transform at its first frame and the
   banner sits low, half off the screen. Opacity cannot strand it anywhere. */
@keyframes tc-dfeedin{from{opacity:0;}to{opacity:1;}}
.tc-dfeed{display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;max-width:420px;margin:0 auto;}
.tc-dfeedhead{display:flex;align-items:center;gap:8px;align-self:flex-start;}
.tc-dfeedmark{font-size:22px;line-height:1;color:#ff8f84;}
.tc-dfeedwrap.is-ok .tc-dfeedmark{color:#7fdc95;}
.tc-dfeedverdict{font-size:16px;font-weight:700;color:#ff8f84;}
.tc-dfeedwrap.is-ok .tc-dfeedverdict{color:#7fdc95;}
.tc-dfeedyours{margin:0;align-self:flex-start;font-size:13px;color:#ffc9c3;}
.tc-dfeedyours b{font-weight:600;text-decoration:line-through;}
.tc-dfeedans{margin:0;align-self:flex-start;display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;}
.tc-dfeedans b{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:21px;color:#fff;}
.tc-dfeedread{font-size:19px;color:#ffd9a0;font-weight:600;}
.tc-dfeedsub{margin:0;align-self:flex-start;font-size:12px;color:#cfd3dc;text-align:left;}
/* the question must be able to scroll clear of the pinned banner */
.tc-dq{padding-bottom:210px;}
.tc-oralinit{border-color:rgba(124,92,255,.55);background:rgba(124,92,255,.09);}
.tc-oralwhoyou{color:#b9a6ff;font-weight:700;}
.tc-oralqinit{font-size:17px;line-height:1.4;color:#fff;}
.tc-oralcheck{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 13px;
  background:rgba(255,255,255,.03);}
.tc-oralcheck summary{cursor:pointer;font-size:14px;color:#ffd9a0;font-weight:600;}
.tc-oralchecklist{margin:9px 0 0;display:flex;flex-direction:column;gap:7px;}
.tc-oralchecklist div{display:flex;flex-direction:column;gap:1px;}
.tc-oralchecklist dt{font-size:13px;font-weight:700;color:#fff;}
.tc-oralchecklist dd{margin:0;font-size:12px;color:var(--mut-2);line-height:1.4;}
.tc-kgrid{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.tc-kcell{appearance:none;font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:24px;line-height:1;
  width:44px;height:44px;border-radius:8px;cursor:pointer;color:#fff;
  border:1.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);transition:transform .08s;}
.tc-kcell:active{transform:scale(.93);}
.tc-kcell.is-new{border-color:rgba(255,255,255,.14);}
.tc-kcell.is-ok{border-color:rgba(255,190,90,.5);background:rgba(255,190,90,.1);}
.tc-kcell.is-solid{border-color:#3d9150;background:rgba(61,145,80,.18);}
.tc-kmodal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;
  justify-content:center;padding:20px;z-index:50;}
.tc-kmodalcard{position:relative;background:#1b2030;border:1px solid rgba(255,255,255,.12);border-radius:16px;
  padding:22px 18px;display:flex;flex-direction:column;align-items:center;gap:8px;max-width:340px;width:100%;
  max-height:82vh;overflow-y:auto;}
.tc-kcloze{display:flex;flex-direction:column;align-items:center;gap:6px;}
.tc-kclozeword{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:40px;
  line-height:1.15;color:#fff;letter-spacing:.02em;}
.tc-kblank{color:#7c5cff;font-weight:400;}
.tc-kclozeen{font-size:14px;color:var(--mut-2);}
.tc-kmark{color:#ffbe5a;font-size:11px;font-weight:700;margin-right:5px;vertical-align:2px;}
.tc-kcontinue{width:100%;max-width:340px;margin-top:4px;}
.tc-kstat{margin:2px 0 0;font-size:12px;color:var(--mut-2);}
.tc-kanjicredit{margin:4px 0 0;font-size:11px;line-height:1.5;color:var(--mut-2);opacity:.75;text-align:center;}
@media (max-width:460px){.tc-kanjibig{font-size:88px;}}

/* ── 入力 / input ── */
.tc-input{display:flex;flex-direction:column;gap:12px;padding:0 4px 28px;}
.tc-inlevels{display:flex;gap:10px;}
.tc-inlevel{flex:1;display:flex;flex-direction:column;gap:5px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:10px 12px;}
.tc-inlevlabel{font-size:12px;color:var(--mut);}
.tc-inlevlabel i,.tc-inband i{font-style:normal;opacity:.55;font-size:.85em;}
.tc-bi{display:inline-flex;flex-direction:column;align-items:center;line-height:1.15;gap:1px;}
.tc-bi small{font-size:10px;opacity:.6;font-weight:400;letter-spacing:.02em;}
.tc-inpickja{display:block;font-style:normal;font-size:13px;font-weight:400;color:var(--mut-2);margin-top:2px;}
.tc-inloading{color:var(--mut-2);font-weight:400;font-size:15px;}
.tc-inloading::after{content:"";display:inline-block;width:1em;text-align:left;animation:tc-dots 1.2s steps(4,end) infinite;}
@keyframes tc-dots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
.tc-inbar{height:5px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden;}
.tc-inbarfill{height:100%;background:linear-gradient(90deg,var(--shu-soft,#ff8a7a),var(--shu));border-radius:99px;transition:width .4s ease;}
.tc-inband{font-size:14px;color:#fff;font-weight:500;}
.tc-inrate{background:rgba(255,190,90,.08);border:1px solid rgba(255,190,90,.22);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px;}
.tc-inrateitem{display:flex;flex-direction:column;gap:8px;}
.tc-inraterow1{display:flex;align-items:center;gap:8px;}
.tc-inratetitle{flex:1;min-width:0;font-size:14px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tc-inx{appearance:none;border:0;background:transparent;color:var(--mut-2);font-size:20px;line-height:1;cursor:pointer;padding:0 4px;min-height:32px;}
.tc-inverdicts{display:flex;gap:6px;flex-wrap:wrap;}
.tc-inpicks{display:flex;flex-direction:column;gap:10px;}
.tc-inpick{align-items:stretch;text-align:left;gap:6px;padding:14px;}
.tc-inpicktop{display:flex;align-items:center;gap:8px;}
.tc-indots{display:inline-flex;gap:3px;}
.tc-indot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.18);}
.tc-indot.is-on{background:var(--shu-soft,#ff8a7a);}
.tc-indotlabel{font-size:12px;color:var(--mut-2);}
.tc-inpicktitle{margin:2px 0 0;font-size:17px;font-weight:600;color:#fff;line-height:1.35;}
.tc-inpickmeta{margin:0;font-size:12px;color:var(--mut-2);}
.tc-inpicknote{margin:4px 0 0;font-size:12px;line-height:1.5;color:rgba(255,255,255,.62);}
.tc-intools{justify-content:center;}
.tc-innote{margin:0;text-align:center;font-size:12px;color:var(--shu-soft,#ff8a7a);}
.tc-inpanel{align-items:stretch;text-align:left;gap:10px;padding:14px;}
.tc-inarea{min-height:120px;resize:vertical;font-size:16px;line-height:1.6;}
.tc-incover{margin:0;font-family:"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif;font-size:17px;line-height:1.7;color:#ffd9a0;}
@media (max-width:460px){.tc-inpicktitle{font-size:16px;}.tc-inlevel{padding:9px 10px;}}
.tc-root::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:99;opacity:.05;mix-blend-mode:soft-light;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
.tc-root :is(button,[role="tab"]):focus-visible{outline:2px solid var(--shu-soft);outline-offset:2px;border-radius:inherit;}
@media (prefers-reduced-motion:reduce){.tc-root *{transition:none !important;animation:none !important;}}

/* ── liquid glass + holographic foil edge ───────────────────────────────────────────────
   The edge is a masked ::before, not a border. A gradient cannot be painted into a real
   border, and border-image kills border-radius — so the pseudo-element is inset:0, filled
   with the foil gradient, and then masked to a 1px rim: two stacked masks, one clipped to
   the content box and one to the whole box, composited with exclude so only the
   difference (the rim) survives. This is the padding-1px trick, done with masks so it
   works on any border-radius and never affects layout.

   pointer-events:none matters — the overlay covers the whole control, and without it the
   rim would eat every click. */
.tc-glass{
  position:relative;
  background:var(--glass);
  backdrop-filter:var(--glass-blur);
  -webkit-backdrop-filter:var(--glass-blur);
  box-shadow:var(--gloss), 0 18px 40px -24px rgba(0,0,0,.9);
  border:0;
}
.tc-glass::before{
  content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;
  background:var(--foil);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
          mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;
          mask-composite:exclude;
  opacity:.55;                       /* foil, not neon: the rim should read as a sheen */
  pointer-events:none;
  transition:opacity .18s ease;
}
.tc-glass:hover::before{opacity:.9;}

/* Buttons: glass by default, foil rim on every one. */
.tc-btn{
  appearance:none;border:0;position:relative;
  background:var(--glass);
  backdrop-filter:var(--glass-blur);
  -webkit-backdrop-filter:var(--glass-blur);
  color:var(--washi);font:var(--t-caps);letter-spacing:.05em;text-transform:uppercase;
  min-height:var(--tap);padding:11px 20px;border-radius:var(--r-m);
  box-shadow:var(--gloss);
  cursor:pointer;transition:background .15s,box-shadow .15s,transform .1s;}
.tc-btn::before{
  content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;
  background:var(--foil);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
          mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;
          mask-composite:exclude;
  opacity:.5;pointer-events:none;transition:opacity .18s ease;}
.tc-btn:hover{background:var(--glass-hi);}
.tc-btn:hover::before{opacity:.95;}
.tc-btn:active{transform:scale(.97);}
.tc-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.tc-btn:disabled::before{opacity:.18;}
/* Primary keeps the accent as a fill wash under the glass rather than a flat slab, so the
   foil rim still reads on top of it. */
.tc-btn-primary{
  background:linear-gradient(135deg,rgba(59,130,246,.32) 0%,rgba(59,130,246,.16) 100%),var(--glass);
  color:#fff;box-shadow:var(--gloss),0 10px 26px -14px rgba(59,130,246,.55);}
.tc-btn-primary::before{opacity:.95;padding:2px;}   /* 2px rim marks the primary action */
.tc-btn-primary:hover{background:linear-gradient(135deg,rgba(59,130,246,.44) 0%,rgba(59,130,246,.24) 100%),var(--glass-hi);}

/* Cards: same glass, foil rim held back so it frames rather than shouts. */
.tc-card2{
  position:relative;
  background:var(--glass);
  backdrop-filter:var(--glass-blur);
  -webkit-backdrop-filter:var(--glass-blur);
  color:var(--washi);border-radius:var(--r-xl);border:0;padding:var(--edge) var(--edge);
  box-shadow:var(--gloss),0 24px 54px -22px rgba(0,0,0,.85);
  display:flex;flex-direction:column;gap:14px;}
.tc-card2::before{
  content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;
  background:var(--foil);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
          mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;
          mask-composite:exclude;
  opacity:.38;pointer-events:none;}

@media (prefers-reduced-motion:reduce){
  .tc-glass::before,.tc-btn,.tc-btn::before{transition:none;}
}
/* backdrop-filter is well supported now, but where it is not the glass would render as a
   nearly invisible 3% white film over the page. Fall back to an opaque surface. */
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
  .tc-glass,.tc-btn,.tc-card2{background:var(--surface);}
  .tc-btn-primary{background:linear-gradient(135deg,#1f4f9c 0%,#2f6bd0 100%);}
}
/* Section chips: bring them into the foil language. The rim goes on an ::after of the
   OUTER button rather than replacing .tc-batchglass's border, so the glass layer keeps its
   own 1px highlight and nothing reflows — a masked pseudo-element costs no layout, whereas
   swapping the real border for one would shrink the chip by 2px.
   z-index 2 clears .tc-batchglass (z-index 1); the parent's overflow:hidden does not clip
   an inset:0 child. The per-section hue behind the glass stays: it encodes WHICH section
   the chip is, so it is information, not decoration. */
.tc-batchchip::after{
  content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;
  background:var(--foil);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
          mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;
          mask-composite:exclude;
  opacity:.45;z-index:2;pointer-events:none;transition:opacity .18s ease;}
.tc-batchchip:hover::after{opacity:.9;}
@media (prefers-reduced-motion:reduce){ .tc-batchchip::after{transition:none;} }

`;
