/* eslint-disable no-magic-numbers */
"use strict";
// License: MIT

let random = (function() {
try {
  window.crypto.getRandomValues(new Uint8Array(1));
  return function(size: number) {
    let buf = new Uint8Array(size);
    crypto.getRandomValues(buf);
    return buf;
  };
}
catch (ex) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let cr = require("crypto");

  return function(size: number) {
    let buf = new Uint8Array(size);
    cr.randomFillSync(buf);
    return buf;
  };
}
})();

let UUID_BYTES = 16;

let HEX_MAP = new Map(Array.from(new Uint8Array(256)).map((e, i) => {
  return [i, i.toString(16).slice(-2).padStart(2, "0")];
}));

let hex = HEX_MAP.get.bind(HEX_MAP);

export default function uuid() {
  let vals = random(UUID_BYTES);
  vals[6] = (vals[6] & 0x0f) + 64;
  let h = Array.from(vals).map(hex);
  return [
    h.slice(0, 4).join(""),
    h.slice(4, 6).join(""),
    h.slice(6, 8).join(""),
    h.slice(8, 10).join(""),
    h.slice(10).join(""),
  ].join("-");
}
