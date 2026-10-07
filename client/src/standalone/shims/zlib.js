// Browser stand-in for the Node `zlib` calls the controllers make: the two
// the MRMS hail decoder needs, and `deflateSync` for the satellite loop's
// frame payloads (server/goesIrCtrl.js).
//
// `server/mrmsHailCtrl.js` runs unmodified inside the app (see
// `standalone/api.js` for why the real controllers are reused rather than
// reimplemented), and it needs SYNCHRONOUS inflate: the GRIB2 parser walks
// the message section by section and unpacks the PNG payload inline. The
// platform's `DecompressionStream` is async-only, so pako — the same zlib
// port webpack ecosystems have used for a decade — provides the sync path.
//
// Only the functions the controllers actually call are implemented; an
// unimplemented member should fail loudly rather than silently return
// undefined, so nothing else is stubbed.

import { deflate, inflate, ungzip } from "pako";

/**
 * Raw DEFLATE/zlib inflate (PNG IDAT payloads).
 *
 * @param {Uint8Array|Buffer} buf compressed bytes
 * @returns {Buffer} inflated bytes
 */
export function inflateSync(buf) {
  return Buffer.from(inflate(buf));
}

/**
 * gzip member inflate (the `.grib2.gz` MRMS objects).
 *
 * @param {Uint8Array|Buffer} buf gzipped bytes
 * @returns {Buffer} inflated bytes
 */
export function gunzipSync(buf) {
  return Buffer.from(ungzip(buf));
}

/**
 * zlib-wrapped DEFLATE (satellite loop frame payloads).
 *
 * @param {Uint8Array|Buffer} buf bytes to compress
 * @returns {Buffer} deflated bytes
 */
export function deflateSync(buf) {
  return Buffer.from(deflate(buf));
}

export default { inflateSync, gunzipSync, deflateSync };
