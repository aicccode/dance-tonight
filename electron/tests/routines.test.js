import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { Store } from "../store.js";

const tmp = () => mkdtempSync(join(tmpdir(), "dt-routines-"));

describe("user routines in the store", () => {
  it("creates, updates, lists and removes", async () => {
    const { cleanRoutine, newRoutine } = await import("../../web/js/core/choreo_edit.js");
    const store = new Store(tmp());
    const draft = { ...newRoutine(), seq: ["clap", "turn_l", "heart"] };
    const saved = store.saveRoutine(cleanRoutine(draft));
    assert.match(saved.id, /^user:[0-9a-f]{12}$/);
    assert.ok(saved.updated_at);
    const edited = store.saveRoutine(cleanRoutine({ ...saved, name: "新名字" }));
    assert.equal(edited.id, saved.id);
    assert.deepEqual(store.listRoutines().map((r) => r.name), ["新名字"]);
    // returned copies are detached from the store
    store.listRoutines()[0].name = "hack";
    assert.equal(store.listRoutines()[0].name, "新名字");
    assert.throws(() => store.saveRoutine(cleanRoutine({ ...saved, id: "user:ffffffffffff" })), /不存在/);
    // persisted
    const again = new Store(store.dir);
    assert.equal(again.listRoutines()[0].id, saved.id);
    assert.equal(again.removeRoutine(saved.id), true);
    assert.equal(again.removeRoutine(saved.id), false);
    assert.deepEqual(again.listRoutines(), []);
  });
});
