import { test } from "node:test";
import assert from "node:assert/strict";
import { preparedName } from "../lib/format";

const name = "Prepared support triage · 537ac65e-9904-4b9a-832f-d27935dc8394";
const prepared = { exampleKind: "prepared" };
test("prepared workflow and derived route have concise display labels without mutating identity", () => {
  const record = { ...prepared, name };
  assert.equal(preparedName(record.name, record), "Prepared support triage");
  assert.equal(preparedName(`${name}@prepared:classify-request`, record), "Prepared support triage → classify request");
  assert.equal(record.name, name);
});
test("ordinary or unmarked names are unchanged even when they resemble a prepared namespace", () => {
  for (const record of [{}, null, {exampleKind:null}, {exampleKind:"ordinary"}]) {
    assert.equal(preparedName(name, record), name);
    assert.equal(preparedName(`${name}@prepared:classify-request`, record), `${name}@prepared:classify-request`);
  }
});
test("only a complete UUID namespace suffix is removed", () => {
  for (const value of ["Prepared support triage", name + " extra", name.replace("537ac65e", "not-a-uuid"), `${name}@production:classify-request`]) {
    assert.equal(preparedName(value, prepared), value);
  }
});
