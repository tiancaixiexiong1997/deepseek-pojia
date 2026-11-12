/**
 * 清洗页回归：不装 React 也能跑。
 *
 * 从 client.js 抽出真实的 statusKind / statusLabel / patchLabelOf / patchRowsOf /
 * tallyPatches / Pill / PatchGroups，用 hooks 垫片渲染两遍，断言：
 *   · 状态文案说真话（不再把 off / missing_file / skipped 混成一个「跳过」）
 *   · 补丁名三级回退（语言包 → 后端 patch_names → 键名），整表不出现 patch.85
 *   · 筛选、搜索、空态、全展开
 *
 * 用法：node --test test/
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "client.js"), "utf8");

const slice = (start, end) => {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `cannot slice ${start}`);
  return src.slice(a, b);
};

const zh = (() => {
  const a = src.indexOf("const zh = {");
  const open = src.indexOf("{", a);
  const close = src.indexOf("\n\t\t};", open);
  return new Function("return {" + src.slice(open + 1, close) + "}")();
})();

function makeT(table) {
  return function t(key, vars) {
    let s = table[key];
    if (s === undefined) return key;
    if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
    return s;
  };
}

const code = slice("function statusKind(st) {", "function HooksDenySection({ onSaved }) {");
const harness = `
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) });
let HOOKS = []; let slot = 0;
const useState = (v) => { const i = slot++; if (!(i in HOOKS)) HOOKS[i] = v; return [HOOKS[i], (nv) => { HOOKS[i] = typeof nv === "function" ? nv(HOOKS[i]) : nv; }]; };
const useRef = (v) => { const i = slot++; if (!(i in HOOKS)) HOOKS[i] = { current: v }; return HOOKS[i]; };
const useCallback = (fn) => fn;
const EFFECTS = [];
const useEffect = (fn) => { EFFECTS.push(fn); };
const useT = () => globalThis.__DSHP_T;
${code}
export { patchLabelOf, statusLabel, statusKind, patchRowsOf, tallyPatches };
export function reset() { HOOKS = []; slot = 0; EFFECTS.length = 0; }
export function render(state, checks) { slot = 0; EFFECTS.length = 0; const tree = PatchGroups({ state, checks }); EFFECTS.splice(0).forEach((f) => f()); return tree; }
`;

const tmp = path.join(os.tmpdir(), `dshp-test-${process.pid}.mjs`);
fs.writeFileSync(tmp, harness);
const t = makeT(zh);
globalThis.__DSHP_T = t;
const M = await import(pathToFileURL(tmp).href);
test.after(() => { try { fs.unlinkSync(tmp); } catch { /* ignore */ } });

/* ---------- 树工具 ---------- */
const walk = (node, out) => {
  if (node === null || node === undefined || node === false) return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return; }
  if (typeof node !== "object") { out.push(String(node)); return; }
  if (typeof node.type === "function") { walk(node.type(node.props), out); return; }
  if (node.props && typeof node.props.title === "string" && node.props.title) out.push(node.props.title);
  (node.children || []).forEach((c) => walk(c, out));
};
const textOf = (node) => { const out = []; walk(node, out); return out.join("|"); };
const findAll = (node, pred, out = []) => {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, pred, out)); return out; }
  if (typeof node.type === "function") { findAll(node.type(node.props), pred, out); return out; }
  if (pred(node)) out.push(node);
  (node.children || []).forEach((c) => findAll(c, pred, out));
  return out;
};
const hasCls = (cls) => (n) => String((n.props || {}).className || "").split(" ").includes(cls);

const state = {
  ai_base: "/Applications/DeepSeek Harness.app/Contents/Resources/app/dsh/node_modules/@deepseek-ai",
  patch_status: {},
  patches: [
    { id: 1, status: "applied", layer: "提示词" },
    { id: 5, status: "pending", layer: "提示词" },
    { id: 32, status: "skipped", layer: "提示词" },
    { id: 85, status: "applied", layer: "代码" },
    { id: 87, status: "skipped", layer: "代码" },
    { id: 999, status: "applied", layer: "代码" },
  ],
  patch_names: { 85: "SESSION_PROMPT_ALWAYS_FOLLOWUP", 87: "HUNG_PROMPT_LF_NEEDLE", 999: "BACKEND_ONLY_NAME" },
};

test("状态文案说真话", () => {
  M.reset();
  assert.equal(M.statusLabel("off", t), "已关闭");
  assert.equal(M.statusLabel("missing_file", t), "本机无此文件");
  assert.equal(M.statusLabel("skipped", t), "跳过");
  assert.equal(M.statusLabel("pattern_not_found", t), "锚点没找到");
  assert.equal(M.statusLabel("weird_internal_state", t), "未知");
  assert.equal(new Set([M.statusLabel("missing_file", t), M.statusLabel("skipped", t), M.statusLabel("off", t)]).size, 3);
});

test("补丁名三级回退", () => {
  M.reset();
  assert.equal(M.patchLabelOf(1, {}, t), "全局免责 → 强指令");
  assert.equal(M.patchLabelOf(4242, { patch_names: { 4242: "BACKEND_ONLY" } }, t), "BACKEND_ONLY");
  assert.equal(M.patchLabelOf(4243, {}, t), "patch.4243");
});

test("表格渲染：不露键名、带筛选与计数", () => {
  M.reset();
  M.render(state);
  let tree = M.render(state);
  let flat = textOf(tree);

  assert.ok(flat.includes("全局免责 → 强指令"), "有 pending 的分组应默认展开");
  assert.ok(!flat.includes("{n}"), "占位符必须被替换");
  assert.match(flat, /1\/3/);

  const chips = findAll(tree, hasCls("dshp-chip"));
  assert.equal(chips.length, 4);
  assert.equal(textOf(chips[0]), "全部 6");
  assert.equal(textOf(chips[1]), "已应用 3");
  assert.equal(textOf(chips[3]), "跳过 2");

  const expandAll = findAll(tree, hasCls("dshp-linkbtn")).find((n) => textOf(n) === "全展开");
  assert.ok(expandAll, "应有全展开");
  expandAll.props.onClick();
  tree = M.render(state);
  flat = textOf(tree);

  assert.ok(flat.includes("UI 消息一律新 turn（消 steer 竞态）"));
  assert.ok(flat.includes("挂起提示词按 LF 比对头尾"));
  assert.ok(flat.includes("BACKEND_ONLY_NAME"));
  assert.doesNotMatch(flat, /(^|\|)patch\.\d+(\||$)/, "整表不应出现裸键名");

  const heads = findAll(tree, (n) => n.type === "th");
  assert.ok(heads.length >= 6);
  assert.ok(heads.every((n) => n.props.scope === "col"));
});

test("筛选与搜索", () => {
  M.reset();
  M.render(state);
  let tree = M.render(state);
  const chip = (label) => findAll(tree, hasCls("dshp-chip")).find((c) => textOf(c).startsWith(label));

  // 先全展开，后面按行断言才看得到两个分组的内容
  findAll(tree, hasCls("dshp-linkbtn")).find((n) => textOf(n) === "全展开").props.onClick();
  tree = M.render(state);

  chip("跳过").props.onClick();
  tree = M.render(state);
  let flat = textOf(tree);
  assert.ok(!flat.includes("全局免责"), "筛「跳过」后不应出现已应用行");
  assert.ok(flat.includes("挂起提示词按 LF 比对头尾"));
  assert.ok(flat.includes("Web 表面身份中性化"));

  chip("全部").props.onClick();
  tree = M.render(state);
  const search = findAll(tree, hasCls("dshp-search"))[0];
  assert.ok(search && search.type === "input");
  search.props.onChange({ target: { value: "85" } });
  tree = M.render(state);
  flat = textOf(tree);
  assert.equal((flat.match(/#85/g) || []).length, 1);
  assert.ok(!flat.includes("#87"));

  findAll(tree, hasCls("dshp-search"))[0].props.onChange({ target: { value: "zzz-" } });
  flat = textOf(M.render(state));
  assert.ok(flat.includes("没有符合筛选的条目"));
});

test("补丁行显示自检徽标（有痕迹 / 无痕迹 / 判不了不显示）", () => {
  M.reset();
  const checks = [
    { id: 1, status: "applied", verified: true, basis: "markers" },
    { id: 5, status: "applied", verified: false, basis: "markers" },
    { id: 32, status: "skipped", verified: null, basis: null },
  ];
  M.render(state, checks);
  const tree = M.render(state, checks);
  const flat = textOf(tree);
  assert.ok(flat.includes("已核验"), "有痕迹的行要挂「已核验」");
  assert.ok(flat.includes("无痕迹"), "漂移的行要挂「无痕迹」");
  const badges = findAll(tree, hasCls("dshp-check"));
  assert.equal(badges.length, 2, "判不了的行不挂徽标");
});

/* ---------- 快捷操作 / 状态横幅（傻瓜按钮） ---------- */
const quickCode = slice("function HealthBanner({", "function ruleLabel(");
const harness2 = `
const h = (type, props, ...children) => {
  const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: Object.assign({}, props || {}, { children: kids }), children: kids };
};
const T = globalThis.__DSHP_T;
function Btn(props) { const { children, kind, tiny, className, type, ...rest } = props; return h("button", Object.assign({ type: type || "button", className: ["dshp-btn", kind ? "dshp-btn-" + kind : "", className || ""].filter(Boolean).join(" ") }, rest), children); }
${quickCode}
export { HealthBanner, QuickActions };
`;
const tmp2 = path.join(os.tmpdir(), `dshp-quick-${process.pid}.mjs`);
fs.writeFileSync(tmp2, harness2);
const Q = await import(pathToFileURL(tmp2).href);
test.after(() => { try { fs.unlinkSync(tmp2); } catch { /* ignore */ } });

const noop = () => {};

test("状态横幅：升级了就说升级了，并给「重新应用」", () => {
  const flat = textOf(Q.HealthBanner({
    health: { ok: true, compare: { upgraded: true, fromVersion: "0.2.1", toVersion: "0.2.2", drift: 0 }, current: { applied: 60, total: 82, verified: 61 } },
    busy: false, t, onApply: noop, onCheck: noop,
  }));
  assert.match(flat, /0\.2\.1/);
  assert.match(flat, /0\.2\.2/);
  assert.ok(flat.includes("重新应用"), "升级时要给重新应用按钮");
});

test("状态横幅：有漂移报警，没有就显示已应用", () => {
  const bad = textOf(Q.HealthBanner({
    health: { ok: true, compare: { upgraded: false, drift: 3 }, current: { applied: 60, total: 82, verified: 55 }, baseline: {} },
    busy: false, t, onApply: noop, onCheck: noop,
  }));
  assert.ok(bad.includes("3 条补丁"), bad);

  const ok = textOf(Q.HealthBanner({
    health: { ok: true, compare: { upgraded: false, drift: 0 }, current: { applied: 60, total: 82, verified: 61 }, baseline: {} },
    busy: false, t, onApply: noop, onCheck: noop,
  }));
  assert.ok(ok.includes("已应用 60/82"), ok);
});

test("状态横幅：接口没加载就明说要重启，而不是装作正常", () => {
  const flat = textOf(Q.HealthBanner({ health: { ok: false }, busy: false, t, onApply: noop, onCheck: noop }));
  assert.ok(flat.includes("重启一次宿主"), flat);
  const none = Q.HealthBanner({ health: null, busy: false, t, onApply: noop, onCheck: noop });
  assert.equal(none, null);
});

test("快捷操作：四个按钮，每个都写清后果，还原是危险操作", () => {
  let applied = 0;
  let reverted = 0;
  const tree = Q.QuickActions({ t, busy: false, diagBusy: false, onApply: () => applied++, onRevert: () => reverted++, onCheck: noop, onCopy: noop });
  const flat = textOf(tree);
  const btns = findAll(tree, (n) => String((n.props || {}).className || "").split(" ").includes("dshp-qbtn"));
  assert.equal(btns.length, 4);
  assert.ok(flat.includes("一键应用全部补丁") && flat.includes("会改写宿主 JS 文件"));
  assert.ok(flat.includes("一键还原原版") && flat.includes("撤销全部补丁"));
  assert.ok(flat.includes("一键自检") && flat.includes("只读"));
  assert.ok(flat.includes("复制诊断报告"));
  const danger = btns.find((b) => String(b.props.className).includes("is-danger"));
  assert.ok(danger, "还原必须是危险样式");
  btns[0].props.onClick();
  danger.props.onClick();
  assert.equal(applied, 1);
  assert.equal(reverted, 1);
});

test("快捷操作：忙的时候全部按钮禁用，防止连点", () => {
  const tree = Q.QuickActions({ t, busy: true, diagBusy: true, onApply: noop, onRevert: noop, onCheck: noop, onCopy: noop });
  const btns = findAll(tree, (n) => String((n.props || {}).className || "").split(" ").includes("dshp-qbtn"));
  assert.ok(btns.every((b) => b.props.disabled === true));
});

test("横幅优先报「还在从 app.asar 启动」", () => {
  const flat = textOf(Q.HealthBanner({
    health: {
      ok: true,
      sealed: true,
      compare: { upgraded: true, fromVersion: "0.2.1", toVersion: "0.2.2", drift: 3 },
      current: { applied: 52, total: 66, verified: 50 },
      baseline: {},
    },
    busy: false, t, onApply: noop, onCheck: noop,
  }));
  assert.ok(flat.includes("app.asar"), flat);
  assert.ok(flat.includes("重新应用"), "密封状态要给重新应用按钮");
  assert.ok(!flat.includes("升到"), "密封优先级高于版本变化");
});
