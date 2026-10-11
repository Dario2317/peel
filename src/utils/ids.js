// Unique ids like "pg_lq3k9x_8f2a91c4d0e7b356".
// (crypto.randomUUID would be nicer, but it only works over https, and the
// dev server on your Wi-Fi is plain http.)
export function newId(prefix) {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}
