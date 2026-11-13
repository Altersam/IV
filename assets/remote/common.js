/* IV remote protocol v1. No telemetry, storage of notes, or media APIs. */
(() => {
  'use strict';
  const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const options = extra => ({debug:0, secure:true, config:{iceServers:[{urls:'stun:stun.l.google.com:19302'}]}, ...extra});
  const send = (conn, message) => { if (conn?.open && conn.bufferSize < 16) { try { conn.send(message); return true; } catch (_) {} } return false; };
  const preview = value => { try { const u = new URL(value, location.href); return u.origin === location.origin && /\.(jpg|jpeg|png|webp)$/i.test(u.pathname) ? u.href : ''; } catch (_) { return ''; } };
  window.IvRemote = Object.freeze({random, options, send, preview, version:1, heartbeat:2000, timeout:10000});
})();
