// Bridge to the Kanvana harness server (same origin, same port as the MCP
// endpoint). The browser stays local-first for instant UI; this module keeps it
// in step with the server's authoritative event log:
//
//   • server → browser : SSE /api/stream, applied through EVENT_EMITTED so the
//                        read-model projector + reducer update the board live.
//   • browser → server : local domain events are POSTed to /api/events (skipping
//                        events that came from the server, which prevents loops).
//
// Safe no-op when the app is served without the harness: the /api/harness probe
// fails and nothing connects.

import { emit, on, EVENT_EMITTED } from './events.js';
import { NO_BOARDS_KEY } from './constants.js';
import { observeRemote } from './event-sourcing/hlc.js';
import { getActiveBoardId, hydrateFromSnapshotState } from './storage.js';

const SEQ_KEY = 'kanvana:harness:seq';
const CLIENT_KEY = 'kanvana:harness:clientId';
const DEFAULT_BOARD_ID = '00000000-0000-4000-8000-000000000001';

const remoteIds = new Set();
const appliedLocal = new Set();
const buffered = [];

let started = false;
let active = false;
let source = null;
let queue = Promise.resolve();

let lastSeq = Number(localStorage.getItem(SEQ_KEY) || 0) || 0;
let clientId = localStorage.getItem(CLIENT_KEY);
if (!clientId) {
  clientId = crypto.randomUUID();
  try { localStorage.setItem(CLIENT_KEY, clientId); } catch { /* private mode */ }
}

function setSeq(next) {
  if (Number.isFinite(next) && next > lastSeq) {
    lastSeq = next;
    try { localStorage.setItem(SEQ_KEY, String(next)); } catch { /* ignore */ }
  }
}

function forward(event) {
  fetch(`/api/events?clientId=${encodeURIComponent(clientId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
    keepalive: true
  }).catch(() => { /* offline or no harness — local state stays intact */ });
}

// Registered at module load (before the app emits its first-run scaffold) so no
// local event is missed while the async probe/snapshot is in flight.
on(EVENT_EMITTED, (e) => {
  const event = e.detail;
  if (!event?.id || remoteIds.has(event.id)) return;
  if (!active) { buffered.push(event); return; }
  forward(event);
});

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function boot() {
  let info;
  try { info = await getJson('/api/harness'); } catch { return; }
  if (!info?.harness) return;

  try {
    if (Number.isFinite(info.boards) && info.boards === 0) localStorage.setItem(NO_BOARDS_KEY, '1');
    else localStorage.removeItem(NO_BOARDS_KEY);
  } catch { /* ignore */ }

  const boardId = getActiveBoardId() || info.defaultBoardId || DEFAULT_BOARD_ID;

  // Snapshot first (idempotent hydration), then tail strictly after snapshot.seq
  // so there is no replay gap and no duplicate application. This avoids full-log
  // replay, which is unsafe because `subtask.added` is not idempotent.
  try {
    const snapshot = await getJson(`/api/snapshot?boardId=${encodeURIComponent(boardId)}`);
    if (Number.isFinite(snapshot?.seq)) {
      const serverHasBoard = Array.isArray(snapshot.state?.boards) && snapshot.state.boards.length > 0;
      if (serverHasBoard && (lastSeq === 0 || snapshot.seq > lastSeq)) {
        hydrateFromSnapshotState(boardId, snapshot.state);
      }
      setSeq(snapshot.seq);
    }
  } catch { /* snapshot unavailable — tail only */ }

  active = true;
  for (const event of buffered) forward(event);
  buffered.length = 0;

  openStream();
}

function openStream() {
  if (source) return;
  try {
    source = new EventSource(`/api/stream?since=${lastSeq}&clientId=${encodeURIComponent(clientId)}`);
  } catch { return; }

  source.addEventListener('groups', (e) => {
    let payload;
    try { payload = JSON.parse(e.data); } catch { return; }
    window.dispatchEvent(new CustomEvent('kanvana:groups-changed', { detail: payload }));
  });

  source.onmessage = (e) => {
    let event;
    try { event = JSON.parse(e.data); } catch { return; }
    if (!event?.id) return;
    if (e.lastEventId) setSeq(Number(e.lastEventId));
    // Serialize application: observeRemote() is async, so concurrent handlers
    // could otherwise reorder events.
    queue = queue.then(() => ingest(event)).catch(() => {});
  };
}

async function ingest(event) {
  if (appliedLocal.has(event.id)) return;
  appliedLocal.add(event.id);
  remoteIds.add(event.id);
  try { if (event.hlc) await observeRemote(event.hlc); } catch { /* ignore */ }
  emit(EVENT_EMITTED, event);
}

export function initLocalServer() {
  if (started) return Promise.resolve();
  started = true;
  return boot().catch((err) => {
    console.warn('[kanvana] local server bridge unavailable:', err?.message || err);
  });
}

export function isLocalServerActive() {
  return active;
}
