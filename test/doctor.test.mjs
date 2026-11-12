/**
 * 补丁自检（doctor）回归：只测纯逻辑，不依赖真实宿主文件。
 *
 * verifyPatches 在没有 ai_base 时必须返回"判不了"，不能把 82 条误判成漂移；
 * summarizeVerify 要能把 有痕迹 / 漂移 / 判不了 三类分开。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = await import(pathToFileURL(path.join(root, "lib", "core.js")).href);

test("没有宿主目录时全部判不了，绝不误报漂移", () => {
  const rows = core.verifyPatches("", { 1: "applied", 87: "applied" });
  assert.equal(rows.length, core.ALL_PATCHES.length);
  assert.ok(rows.every((r) => r.verified === null), "空 ai_base 下 verified 必须为 null");
  assert.ok(rows.every((r) => r.files === 0));
  const sum = core.summarizeVerify(rows);
  assert.equal(sum.verified, 0);
  assert.equal(sum.drift.length, 0);
  assert.equal(sum.unverified.length, rows.length);
});

test("summarizeVerify 三类分开", () => {
  const sum = core.summarizeVerify([
    { id: 1, status: "applied", verified: true },
    { id: 2, status: "applied", verified: false },
    { id: 3, status: "skipped", verified: null },
    { id: 4, status: "applied", verified: null },
    { id: 5, status: "pending", verified: true },
  ]);
  assert.equal(sum.total, 5);
  assert.equal(sum.verified, 2);
  assert.deepEqual(sum.drift.map((r) => r.id), [2]);
  assert.deepEqual(sum.unverified.map((r) => r.id), [3, 4]);
});

test("每条补丁都带 id / name / status 字段，可直接喂给界面", () => {
  const rows = core.verifyPatches("", { 5: "pending" });
  const row = rows.find((r) => r.id === 5);
  assert.ok(row);
  assert.equal(row.status, "pending");
  assert.equal(typeof row.name, "string");
  assert.ok(row.name.length > 0);
  assert.ok(Object.prototype.hasOwnProperty.call(row, "basis"));
});
