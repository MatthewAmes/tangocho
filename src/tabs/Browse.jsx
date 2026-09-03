import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { sGet, sSet } from "../lib/storage.js";
import { freqStatsFrom } from "../lib/freq.js";
import { isLeech, masteryScore } from "../lib/schedule.js";
import { cardMergeKey } from "../../tools/merge.mjs";
import { localDayKey } from "../../tools/days.mjs";

export const DEFAULT_SYNC_UI = {
  idle:    { dot: "#3ddc84", label: "Synced automatically." },
  saving:  { dot: "#ffd166", label: "Saving…" },
  saved:   { dot: "#3ddc84", label: "All changes saved to your account." },
  pending: { dot: "#ff8a7a", label: "⚠ Not saved yet — your progress is safe on this device and will upload automatically." },
};

export default function Browse({
  cards,
  onRemove,
  onClear,
  onRestore,
  syncStateNow = () => "idle",
  watchSyncState = () => () => {},
  pushCloudNow = () => {},
  hasSyncPending = () => false,
  googleEmailNow = () => null,
  authStateNow = "signed_out",
  watchAuthState = () => () => {},
  renderGoogleButton = () => {},
  initGoogleAuth = () => () => {},
  signOutGoogle = () => {},
  SYNC_UI = DEFAULT_SYNC_UI,
  SEED = [],
  uid = () => Math.random().toString(36).slice(2, 9),
  setDaysCache = () => {},
}) {
  const [syncState, setSyncState] = useState(syncStateNow);
  useEffect(() => watchSyncState(setSyncState), [watchSyncState]);
  const [showMore, setShowMore] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreText, setRestoreText] = useState("");
  const [backupDone, setBackupDone] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");
  const [lastBk, setLastBk] = useState(null);
  useEffect(() => { (async () => { try { const r = await sGet("jpn101:lastBackup"); setLastBk(r ? Number(r) : 0); } catch (e) { setLastBk(0); } })(); }, []);

  const doBackup = async () => {
    let kana = null, scripts = null, freq = null, days = null, hooks = null, quota = null;
    try { const k = await sGet("jpn101:kana"); if (k) kana = JSON.parse(k); } catch (e) {}
    try { const sc = await sGet("jpn101:scripts"); if (sc) scripts = JSON.parse(sc); } catch (e) {}
    try { const f = await sGet("jpn101:freq"); if (f) freq = JSON.parse(f); } catch (e) {}
    try { const d = await sGet("jpn101:days"); if (d) days = JSON.parse(d); } catch (e) {}
    try { const h = await sGet("jpn101:hooks"); if (h) hooks = JSON.parse(h); } catch (e) {}
    try { quota = await sGet("jpn101:freqQuota"); } catch (e) {}
    let oral = null;
    try { const or = await sGet("jpn101:oralAttempts"); if (or) oral = JSON.parse(or); } catch (e) {}
    const blob = JSON.stringify({ app: "tangocho", v: 2, date: new Date().toISOString(), deck: cards, kana, scripts, freq, days, hooks, quota, oral });
    // save a real file too — clipboard is convenient, a file is permanent
    try {
      const url = URL.createObjectURL(new Blob([blob], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = "tangocho-backup-" + localDayKey() + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {}
    try { await navigator.clipboard.writeText(blob); } catch (e) { setRestoreMsg("Clipboard blocked — but your backup FILE downloaded fine. You can also long-press and copy:"); setShowRestore(true); setRestoreText(blob); }
    sSet("jpn101:lastBackup", String(Date.now())); setLastBk(Date.now());
    setBackupDone(true); setTimeout(() => setBackupDone(false), 2200);
  };

  const doRestore = async () => {
    try {
      const o = JSON.parse(restoreText.trim());
      if (o && o.app === "tangocho-pack") {          // update pack: ADD content, keep all progress
        const have = new Set(cards.map((c) => c.term));
        const maxLesson = cards.reduce((m, c) => Math.max(m, c.lesson || 0), 0);
        const fresh = (o.words || []).filter((w) => w && w.term && !have.has(w.term)).map((w, i) => ({
          id: "p" + Date.now() + "-" + i,
          term: w.term, reading: w.reading || w.term, romaji: w.romaji || "", meaning: w.meaning || "",
          kind: w.kind || "mixed", emoji: w.emoji || "", lesson: w.lesson || maxLesson + 1, sec: w.sec,
          seen: 0, correct: 0, level: 0, streak: 0,
        }));
        if (fresh.length) await onRestore([...cards, ...fresh]);
        let addedScripts = 0;
        if (Array.isArray(o.scripts) && o.scripts.length) {
          let list = [];
          try { const r = await sGet("jpn101:scripts"); if (r) list = JSON.parse(r) || []; } catch (e) {}
          const names = new Set(list.map((x) => x.name));
          o.scripts.forEach((sc) => { if (sc && sc.name && !names.has(sc.name)) { list.push(sc); addedScripts++; } });
          if (addedScripts) await sSet("jpn101:scripts", JSON.stringify(list));
        }
        setRestoreMsg("Pack applied ✓ — added " + fresh.length + " words" + (addedScripts ? " and " + addedScripts + " script" + (addedScripts > 1 ? "s" : "") : "") + ". Your progress is untouched.");
        setRestoreText("");
        return;
      }
      if (!o || o.app !== "tangocho" || !Array.isArray(o.deck)) { setRestoreMsg("That doesn't look like a 単語帳 backup or update pack."); return; }
      if (o.kana) await sSet("jpn101:kana", JSON.stringify(o.kana));
      if (o.scripts) await sSet("jpn101:scripts", JSON.stringify(o.scripts));
      if (o.hooks) await sSet("jpn101:hooks", JSON.stringify(o.hooks));
      if (o.quota) await sSet("jpn101:freqQuota", String(o.quota));
      if (o.oral) await sSet("jpn101:oralAttempts", JSON.stringify(o.oral));
      /* Frequency-list progress. A backup taken before the 10k tab was retired holds an
         ARRAY of full records; one taken since holds a map keyed by term. Both are
         accepted, because refusing the old shape would silently drop every frequency word
         the learner had studied. The words themselves are not restored from the backup —
         freq.json ships all ten thousand, so a backup only needs to carry the progress. */
      if (o.freq) {
        const merged = { ...freqStatsFrom(o.freq) };
        try { Object.assign(merged, freqStatsFrom(JSON.parse((await sGet("jpn101:freq")) || "null"))); } catch (e) {}
        await sSet("jpn101:freq", JSON.stringify(merged));
      }
      if (o.days) {
        // merge day-by-day; keep whichever record shows more reviews for that date
        let cur = {};
        try { const r = await sGet("jpn101:days"); if (r) cur = JSON.parse(r) || {}; } catch (e) {}
        Object.entries(o.days).forEach(([k, v]) => { if (!cur[k] || (v.rev || 0) > (cur[k].rev || 0)) cur[k] = v; });
        await sSet("jpn101:days", JSON.stringify(cur));
        setDaysCache(cur);
      }
      // keep any seed words the backup predates (e.g. scenes added after the backup was taken)
      const merged = [...o.deck];
      const haveKeys = new Set(merged.map(cardMergeKey));
      let addedFromSeed = 0;
      SEED.forEach((s) => {
        const k = cardMergeKey(s);
        if (!haveKeys.has(k)) { merged.push({ id: uid(), seen: 0, correct: 0, ...s }); haveKeys.add(k); addedFromSeed++; }
      });
      await onRestore(merged);
      setRestoreMsg("Restored ✓ — " + o.deck.length + " words with their stats" + (o.kana ? ", kana progress" : "") + (o.scripts ? ", scripts" : "") + (addedFromSeed ? ", plus " + addedFromSeed + " newer course words kept" : "") + ". (Backup from " + (o.date || "?").slice(0, 10) + ")");
      setRestoreText("");
    } catch (e) { setRestoreMsg("Couldn't read that backup: " + e.message); }
  };

  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("all");   // all | review | new | mastered
  const [sortWeak, setSortWeak] = useState(true);

  const [googleEmail, setGoogleEmail] = useState(() => googleEmailNow());
  const [authState, setAuthStateUi] = useState(authStateNow);
  useEffect(() => watchAuthState((s) => { setAuthStateUi(s); setGoogleEmail(googleEmailNow()); }), [watchAuthState, googleEmailNow]);
  const googleBtnRef = useRef(null);
  useEffect(() => {
    if (!googleEmail) renderGoogleButton(googleBtnRef.current);
    return initGoogleAuth(() => setGoogleEmail(googleEmailNow()));
  }, [googleEmail, renderGoogleButton, initGoogleAuth, googleEmailNow]);

  const summary = useMemo(() => {
    let mastered = 0, need = 0, fresh = 0;
    cards.forEach((c) => {
      if (!(c.seen > 0)) fresh++;
      else if ((c.level || 0) >= 4) mastered++;
      else need++;
    });
    return { mastered, need, fresh, total: cards.length };
  }, [cards]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = cards;
    if (t) list = list.filter((c) => [c.term, c.reading, c.romaji, c.meaning].some((f) => (f || "").toLowerCase().includes(t)));
    if (filter === "new") list = list.filter((c) => !(c.seen > 0));
    else if (filter === "mastered") list = list.filter((c) => c.seen > 0 && (c.level || 0) >= 4);
    else if (filter === "review") list = list.filter((c) => c.seen > 0 && (c.level || 0) < 4);
    if (sortWeak) list = list.slice().sort((a, b) => (a.seen > 0 ? masteryScore(a) : 99) - (b.seen > 0 ? masteryScore(b) : 99));
    return list;
  }, [cards, q, filter, sortWeak]);

  const exportText = useCallback(() => {
    const tsv = cards.map((c) => [c.term, c.reading, c.romaji, c.meaning, c.emoji || ""].join("\t")).join("\n");
    navigator.clipboard?.writeText(tsv).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  }, [cards]);

  const activeSyncUi = SYNC_UI[syncState] || SYNC_UI.idle || { dot: "#3ddc84", label: "" };

  return (
    <div className="tc-browse">
      <div className="tc-summary">
        <div className="tc-sumitem"><b>{summary.total}</b><span>words</span></div>
        <div className="tc-sumitem tc-sum-good"><b>{summary.mastered}</b><span>mastered</span></div>
        <div className="tc-sumitem tc-sum-need"><b>{summary.need}</b><span>need work</span></div>
        <div className="tc-sumitem tc-sum-new"><b>{summary.fresh}</b><span>untouched</span></div>
      </div>

      <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <p style={{ margin: "0 0 6px", fontWeight: 600 }}><span aria-hidden="true">🔄</span> Sync across your devices</p>
        {googleEmail ? (
          <>
            <p style={{ margin: 0, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: activeSyncUi.dot, display: "inline-block", boxShadow: "0 0 6px " + activeSyncUi.dot }} />
              Signed in as <b>{googleEmail}</b>
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: activeSyncUi.dot }}>
              {activeSyncUi.label}
            </p>
            {syncState === "pending" && (
              <button className="tc-btn tc-btn-sm" style={{ marginTop: 8 }} onClick={() => pushCloudNow()}>Retry now</button>
            )}
            <button className="tc-btn tc-btn-sm" style={{ marginTop: 8, marginLeft: 8 }} onClick={() => { signOutGoogle(); }}>Sign out</button>
          </>
        ) : (
          <>
            {authState === "expired" && (
              <p className="tc-conjnote" style={{ marginTop: 0 }}>
                ⚠ Your sign-in expired — sign in again to keep syncing. Nothing on this device is lost{hasSyncPending() ? ", and unsaved progress will upload as soon as you do" : ""}.
              </p>
            )}
            <p style={{ margin: "0 0 8px", fontSize: 12.5, opacity: .7 }}>Sign in once per device to keep your progress synced everywhere.</p>
            <div ref={googleBtnRef} style={{ marginBottom: 4 }} />
          </>
        )}
      </div>

      <div className="tc-browsebar">
        <input aria-label="Search words" className="tc-search" placeholder="Search words…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="tc-btn tc-btn-sm" onClick={() => setShowMore((v) => !v)}>{showMore ? "Less ⌃" : "More ⌄"}</button>
      </div>

      {showMore && (
        <div style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
          {lastBk !== null && Date.now() - lastBk > 7 * 86400000 && (
            <p className="tc-conjnote" style={{ marginTop: 0 }}><span aria-hidden="true">💾</span> {lastBk ? "Last backup was " + Math.floor((Date.now() - lastBk) / 86400000) + " days ago" : "No backup yet on this device"} — a backup file has everything: both decks, all stats, think-times, scripts, and exam history.</p>
          )}
          <div className="tc-browsebar" style={{ marginBottom: 0 }}>
            <button className="tc-btn tc-btn-sm" onClick={exportText} disabled={!cards.length}>{copied ? "Copied!" : "Export"}</button>
            <button className="tc-btn tc-btn-sm" onClick={doBackup} disabled={!cards.length}>{backupDone ? "Backed up ✓" : "💾 Backup"}</button>
            <button className="tc-btn tc-btn-sm" onClick={() => { setShowRestore((v) => !v); setRestoreMsg(""); }}>Restore</button>
            {!confirm ? (
              <button className="tc-btn tc-btn-sm tc-btn-danger" onClick={() => setConfirm(true)} disabled={!cards.length}>Clear all</button>
            ) : (
              <span className="tc-confirm" role="alertdialog" aria-label="Delete everything?"
                    onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setConfirm(false); } }}>
                Delete everything?
                <button className="tc-btn tc-btn-sm tc-btn-danger" onClick={() => { onClear(); setConfirm(false); }}>Yes</button>
                <button className="tc-btn tc-btn-sm" autoFocus onClick={() => setConfirm(false)}>No</button>
              </span>
            )}
          </div>

          {showRestore && (
            <div className="tc-restore">
              <p className="tc-restorehint">Paste a 💾 backup (replaces everything) or an update pack from Claude (adds new words & scripts — progress untouched), then Apply.</p>
              <textarea aria-label="Paste a backup to restore" className="tc-restorebox" value={restoreText} onChange={(e) => setRestoreText(e.target.value)} placeholder='{"app":"tangocho", ...}' />
              <div className="tc-restorebtns">
                <button className="tc-btn tc-btn-sm tc-btn-primary" onClick={doRestore} disabled={!restoreText.trim()}>Apply backup</button>
                <button className="tc-btn tc-btn-sm" onClick={() => { setShowRestore(false); setRestoreMsg(""); }}>Close</button>
              </div>
              {restoreMsg && <p className="tc-restoremsg">{restoreMsg}</p>}
            </div>
          )}
          {!showRestore && restoreMsg && <p className="tc-restoremsg">{restoreMsg}</p>}
        </div>
      )}
      <div className="tc-filters">
        {[["all", "All"], ["review", "Needs work"], ["new", "Untouched"], ["mastered", "Mastered"]].map(([id, label]) => (
          <button key={id} className={"tc-fchip" + (filter === id ? " is-on" : "")} onClick={() => setFilter(id)}>{label}</button>
        ))}
        <button className={"tc-fchip tc-fchip-sort" + (sortWeak ? " is-on" : "")} onClick={() => setSortWeak((v) => !v)}>{sortWeak ? "Weakest first ↓" : "By lesson"}</button>
      </div>

      {shown.length === 0 ? (
        <div className="tc-empty">{cards.length === 0 ? "No words yet." : "No matches."}</div>
      ) : (
        <ul className="tc-list">
          {shown.map((c) => {
            const seen = c.seen || 0, correct = c.correct || 0, lvl = Math.min(5, c.level || 0);
            const pct = seen ? Math.round((correct / seen) * 100) : 0;
            const needs = seen > 0 && (lvl < 2 || correct / seen < 0.5);
            return (
              <li key={c.id} className="tc-prow">
                <div className="tc-prow-top">
                  <span className="tc-rowterm">{c.emoji ? c.emoji + " " : ""}{c.term}</span>
                  <span className="tc-rowread">{c.reading}<em>{c.romaji}</em></span>
                  <button className="tc-del" aria-label={"Delete " + c.term} onClick={() => onRemove(c.id)}>✕</button>
                </div>
                <div className="tc-prow-mean">{c.meaning}</div>
                <div className="tc-prow-stats">
                  <div className="tc-meter" title={"Mastery " + lvl + "/5"} aria-label={"Mastery " + lvl + " of 5"}>
                    {[0, 1, 2, 3, 4].map((i) => <span key={i} className={"tc-seg" + (i < lvl ? " on" : "")} />)}
                  </div>
                  <span className="tc-prow-num">{seen ? `seen ${seen} · ✓ ${correct} (${pct}%)` : "not studied yet"}</span>
                  {isLeech(c) ? <span className="tc-leechpill"><span aria-hidden="true">🩹</span> stuck</span> : needs ? <span className="tc-needpill">needs review</span> : null}
                  {!isLeech(c) && seen > 0 && lvl >= 4 && correct / seen >= 0.5 && <span className="tc-donepill">solid</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
