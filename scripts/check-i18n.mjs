#!/usr/bin/env node
/**
 * 语言包体检：抓「界面会露出键名」这类问题。
 *
 *  1. ALL_PATCHES 里每条补丁都要有 patch.<id> 中文/英文名（缺了就显示 patch.85）；
 *  2. client.js 里静态写死的 t("key") / tr("key") / hostText(t,"key") 必须在两份语言包里都有；
 *  3. 中英 key 集合必须一致（少一边就是漏翻）。
 *
 * 用法：node scripts/check-i18n.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientPath = path.join(root, "client.js");
const src = fs.readFileSync(clientPath, "utf8");

function localeBlock(startMark) {
  const a = src.indexOf(startMark);
  if (a < 0) throw new Error("locale block not found: " + startMark);
  const open = src.indexOf("{", a);
  const close = src.indexOf("\n\t\t};", open); // 语言包对象以两 Tab 缩进的 }; 结束
  if (close < 0) throw new Error("locale block not closed: " + startMark);
  const body = src.slice(open + 1, close);
  return new Function("return {" + body + "}")();
}

const zh = localeBlock("const zh = {");
const en = localeBlock("const en = {");

/* ---------- 1. 补丁名 ---------- */
const core = await import(pathToFileURL(path.join(root, "lib", "core.js")).href);
const ids = core.ALL_PATCHES.map((p) => p.id);
const missZh = ids.filter((id) => !Object.prototype.hasOwnProperty.call(zh, "patch." + id));
const missEn = ids.filter((id) => !Object.prototype.hasOwnProperty.call(en, "patch." + id));

/* ---------- 2. 静态 key ---------- */
const used = new Set();
for (const re of [/\bt\(\s*"([a-zA-Z0-9_.]+)"/g, /\btr\(\s*"([a-zA-Z0-9_.]+)"/g, /hostText\([^,]+,\s*"([a-zA-Z0-9_.]+)"/g]) {
  for (const m of src.matchAll(re)) {
    const key = m[1];
    if (!key || key.endsWith(".")) continue; // 动态拼接前缀（patch./group./surface. 等）
    used.add(key);
  }
}
const missKeyZh = [...used].filter((k) => !(k in zh)).sort();
const missKeyEn = [...used].filter((k) => !(k in en)).sort();

/* ---------- 3. 中英对齐 ---------- */
const zhKeys = Object.keys(zh);
const enKeys = Object.keys(en);
const onlyZh = zhKeys.filter((k) => !(k in en));
const onlyEn = enKeys.filter((k) => !(k in zh));

const lines = [];
let bad = 0;
const report = (title, list, sample = 8) => {
  if (!list.length) return;
  bad += list.length;
  lines.push(`✗ ${title}（${list.length}）：${list.slice(0, sample).join(", ")}${list.length > sample ? " …" : ""}`);
};

report("补丁缺少中文名", missZh.map((id) => "patch." + id));
report("补丁缺少英文名", missEn.map((id) => "patch." + id));
report("界面用到的 key 在中文包里缺失", missKeyZh);
report("界面用到的 key 在英文包里缺失", missKeyEn);
report("只有中文（英文漏翻）", onlyZh);
report("只有英文（中文漏翻）", onlyEn);

const summary = `补丁 ${ids.length} 条 · 静态 key ${used.size} 个 · 中文 ${zhKeys.length} 项 · 英文 ${enKeys.length} 项`;
if (bad) {
  console.error(lines.join("\n"));
  console.error("\n" + summary);
  process.exit(1);
}
console.log("✓ 语言包一致：" + summary);
