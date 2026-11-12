/**
 * 宿主健康基线（升级感知）回归。
 * 重点：没有 ai_base 时不许瞎报，版本没变不许报"已升级"。
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = await import(pathToFileURL(path.join(root, "lib", "core.js")).href);

test("空 ai_base + 空状态：签名全是 0，不炸", () => {
  const sig = core.hostSignature("", {});
  assert.equal(sig.version, "");
  assert.equal(sig.applied, 0);
  assert.equal(sig.drift, 0);
  assert.equal(sig.total, 0, "没有状态就没有展示行");
  assert.deepEqual(sig.drift_ids, []);
});

test("计数跟面板同一口径（展示行，不是原始 82 条）", () => {
  const applied = [1, 2, 3, 4, 5, 6, 85, 86];
  const st = {};
  for (const id of applied) st[id] = "applied";
  st[32] = "skipped";
  const sig = core.hostSignature("", st);
  const display = core.groupPatchesForDisplay(core.ALL_PATCHES, st);
  const tally = core.tallyDisplayPatches(display);
  assert.equal(sig.total, tally.total);
  assert.equal(sig.applied, tally.applied);
  assert.ok(sig.total < core.ALL_PATCHES.length, "展示行必须比原始条数少");
  assert.equal(sig.drift, 0, "没有目标文件时不许报漂移");
});

test("版本变了才算升级", () => {
  const same = core.compareHealth({ version: "0.2.1", applied: 60, total: 82, drift: 0 }, { version: "0.2.1" });
  assert.equal(same.upgraded, false);
  const up = core.compareHealth({ version: "0.2.2", applied: 60, total: 82, drift: 0 }, { version: "0.2.1" });
  assert.equal(up.upgraded, true);
  assert.equal(up.fromVersion, "0.2.1");
  assert.equal(up.toVersion, "0.2.2");
});

test("没有基线 / 版本读不到时不许报升级", () => {
  assert.equal(core.compareHealth({ version: "0.2.1" }, null).upgraded, false);
  assert.equal(core.compareHealth({ version: "" }, { version: "0.2.1" }).upgraded, false);
  assert.equal(core.compareHealth({ version: "0.2.1" }, { version: "" }).upgraded, false);
});

test("漂移数原样透出，界面据此变红", () => {
  const cmp = core.compareHealth({ version: "0.2.1", applied: 3, total: 5, drift: 2 }, { version: "0.2.1" });
  assert.equal(cmp.drift, 2);
  assert.equal(cmp.applied, 3);
  assert.equal(cmp.total, 5);
});
