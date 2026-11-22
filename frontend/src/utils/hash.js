// SHA-256 computed locally in the browser: the file never leaves the machine.
// Returns 64 lowercase hex chars.
export async function sha256Hex(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const isHash = (v) => /^[0-9a-f]{64}$/i.test(v);
export const shortHash = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '');
