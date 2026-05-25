// ---------------------------------------------------------------------------
// worldSnapshot.js
//
// Serializes a player's church "save" (localStorage keys that affect the
// rendered world / progression) and applies a snapshot to localStorage when
// visiting someone else's church.
//
// Why localStorage round-trip + page reload, instead of a live re-init?
// The game's modules each read their own localStorage key during init() and
// don't expose a clean "rebuild from data" path. Reusing the existing init
// flow by overwriting localStorage and reloading is simpler, less error-prone,
// and keeps every module's load logic in one place (its own init function).
// ---------------------------------------------------------------------------

import { db, firebaseEnabled } from "./firebase.js";
import { ref, set, get, onValue, query, orderByChild, limitToLast } from "firebase/database";

// Keys that describe the church + progression. Everything else (settings,
// audio prefs, etc.) stays local to the visiting player.
export const SNAPSHOT_KEYS = [
  "clw_character",
  "clw_xp",
  "clw_members",
  "clw_sanctuary_upgraded",
  "clw_garden",
  "clw_garden_harvests",
  "clw_aesthetics",
  "clw_outfit",
  "clw_pet",
  "clw_unbaptized_names",
  "clw_baptized_count",
  "clw_active_quest",
  "clw_faith_last_level",
];

// Identity keys — these belong to the PLAYER, not the church. They're still
// published in the snapshot (so the visit panel can show the host's name +
// shirt color), but they must NOT overwrite the visitor's identity when
// applying a remote snapshot, or the visitor would briefly "become" the
// host (same name, same outfit) for the duration of the visit.
const IDENTITY_KEYS = new Set([
  "clw_character",   // name, church name, appearance, hand item
  "clw_outfit",      // equipped outfit
]);

// Session-storage keys used by the visit flow
const VISIT_FLAG_KEY    = "clw_visiting";        // { hostUid, hostName, churchName }
const VISIT_BACKUP_KEY  = "clw_visit_backup";    // map of original localStorage values

// -------- Local read/write helpers ----------------------------------------

/** Read all snapshot keys out of localStorage into a plain object. */
export function serializeFromLocalStorage() {
  const out = {};
  for (const k of SNAPSHOT_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

/**
 * Overwrite localStorage with the given snapshot's keys. By default we
 * iterate every snapshot key (so a key absent from `snap` is REMOVED —
 * needed when restoring a backup so stale leftovers can't linger). Pass
 * `keysToTouch` to limit which keys we read/write/remove; the rest of
 * localStorage is left strictly untouched.
 */
export function applySnapshotToLocalStorage(snap, keysToTouch = SNAPSHOT_KEYS) {
  if (!snap || typeof snap !== "object") return;
  for (const k of keysToTouch) {
    if (k in snap) {
      try { localStorage.setItem(k, snap[k]); } catch {}
    } else {
      try { localStorage.removeItem(k); } catch {}
    }
  }
}

// -------- Visit-mode plumbing ---------------------------------------------

export function getVisitInfo() {
  try {
    const raw = sessionStorage.getItem(VISIT_FLAG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function isVisiting() {
  return !!getVisitInfo();
}

/**
 * Prevent the visitor's gameplay actions from corrupting the host's saved
 * church data. We wrap localStorage.setItem so writes to any SNAPSHOT_KEY
 * are silently dropped while visiting.
 *
 * Reads still work normally, so the host's world continues to render.
 */
export function enableReadOnlyLocalStorage() {
  // Only protect HOST-owned keys. The visitor must always be allowed to
  // write their own identity (clw_character, clw_outfit) \u2014 those belong
  // to the player, not the church being visited.
  const snapshotSet = new Set(
    SNAPSHOT_KEYS.filter(k => !IDENTITY_KEYS.has(k))
  );
  const proto = Object.getPrototypeOf(localStorage) || Storage.prototype;
  const orig = proto.setItem;
  if (proto.__clwVisitPatched) return;
  proto.__clwVisitPatched = true;
  proto.setItem = function (key, value) {
    if (snapshotSet.has(key)) return;          // drop writes to host's save
    return orig.call(this, key, value);
  };
}

// -------- Firebase: publish + browse + visit ------------------------------

/**
 * Write the current player's snapshot up to RTDB so others can visit.
 * Safe to call even when Firebase is disabled or we're in visit mode.
 */
export async function publishMySnapshot(uid, pData) {
  if (!firebaseEnabled || !db || !uid) return;
  if (isVisiting()) return;                    // never publish while visiting
  if (String(uid).startsWith("local-")) return;

  const snap = serializeFromLocalStorage();
  const meta = {
    ownerUid:    uid,
    ownerName:   pData?.name   || "ChurchGoer",
    churchName:  pData?.church || "ChristLife Church",
    shirt:       pData?.shirt  || "#4169E1",
    members:     parseInt(localStorage.getItem("clw_members") || "12", 10),
    xp:          parseInt(localStorage.getItem("clw_xp")      || "0",  10),
    updatedAt:   Date.now(),
  };

  try {
    await set(ref(db, `churches/${uid}`), { meta, state: snap });
  } catch (err) {
    console.warn("[snapshot] publish failed:", err);
  }
}

/**
 * Subscribe to the catalog of churches available to visit.
 * Returns an unsubscribe function. Callback receives an array of
 * { uid, churchName, ownerName, members, shirt, updatedAt }.
 */
export function subscribeToChurchCatalog(callback, max = 30) {
  if (!firebaseEnabled || !db) {
    callback([]);
    return () => {};
  }
  // Pull the most recently updated churches.
  const q = query(ref(db, "churches"), orderByChild("meta/updatedAt"), limitToLast(max));
  return onValue(q, snap => {
    const all = snap.val() || {};
    const list = Object.entries(all)
      .map(([uid, entry]) => ({ uid, ...(entry?.meta || {}) }))
      .filter(c => c.churchName)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    callback(list);
  });
}

/**
 * Fetch a single church snapshot from Firebase.
 */
export async function fetchChurchSnapshot(hostUid) {
  if (!firebaseEnabled || !db) return null;
  try {
    const snap = await get(ref(db, `churches/${hostUid}`));
    return snap.exists() ? snap.val() : null;
  } catch (err) {
    console.warn("[snapshot] fetch failed:", err);
    return null;
  }
}

/**
 * Begin a visit: back up the visitor's local save, overwrite with the host's
 * snapshot, mark visit mode in sessionStorage, then reload the page so every
 * module re-initializes against the new data.
 */
export async function beginVisit(hostUid, hostMetaHint = {}) {
  const remote = await fetchChurchSnapshot(hostUid);
  if (!remote || !remote.state) {
    throw new Error("Could not load that church.");
  }
  // 1. Back up current local save
  const backup = serializeFromLocalStorage();
  sessionStorage.setItem(VISIT_BACKUP_KEY, JSON.stringify(backup));

  // 2. Overwrite localStorage with host snapshot — but never touch the
  //    visitor's identity keys (name, church, appearance, outfit). We
  //    restrict the apply to non-identity keys so the visitor's stored
  //    clw_character / clw_outfit are neither overwritten nor removed.
  const nonIdentityKeys = SNAPSHOT_KEYS.filter(k => !IDENTITY_KEYS.has(k));
  applySnapshotToLocalStorage(remote.state, nonIdentityKeys);

  // 3. Mark visit mode
  const meta = remote.meta || {};
  sessionStorage.setItem(VISIT_FLAG_KEY, JSON.stringify({
    hostUid,
    hostName:   meta.ownerName  || hostMetaHint.ownerName  || "Friend",
    churchName: meta.churchName || hostMetaHint.churchName || "Their Church",
  }));

  // 4. Reload: every module's init() will read the new save and rebuild
  location.reload();
}

/**
 * End a visit: restore the visitor's original save and reload.
 */
export function endVisit() {
  let backup = null;
  try { backup = JSON.parse(sessionStorage.getItem(VISIT_BACKUP_KEY) || "null"); }
  catch { backup = null; }
  if (backup) applySnapshotToLocalStorage(backup);
  sessionStorage.removeItem(VISIT_FLAG_KEY);
  sessionStorage.removeItem(VISIT_BACKUP_KEY);
  location.reload();
}
