"use strict";
// License: CC0 1.0

var uuid = require("../lib/uuid").default;

function *generateSome() {
  for (let i = 0; i < 1000; ++i) {
    yield uuid();
  }
}

describe("UUID", function() {
  it("form", function() {
    // Check for version 4, which is random except for the version bits
    var form = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    var uuids = Array.from(generateSome());
    expect(uuids.every(e => form.test(e))).to.be.true;
  });
});
