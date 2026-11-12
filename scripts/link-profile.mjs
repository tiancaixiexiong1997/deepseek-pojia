#!/usr/bin/env node
/**
 * 把本仓库（dsh-purge 插件）挂进一个 dsh profile。install.sh / install.ps1 都只是它的壳。
 *
 *   node scripts/link-profile.mjs --profile desktop
 *   node scripts/link-profile.mjs --home "C:\Users\me\.dsh" --profile web
 *   node scripts/link-profile.mjs --profile desktop --no-copy     # 仓库已在 plugins/dsh-purge 里
 *
 * 只动 $DSH_HOME，不碰宿主程序目录：
 *   1) 仓库 → $DSH_HOME/plugins/dsh-purge（原地就是那个目录时跳过）
 *   2) profile 的 dependencies 写入 dsh-purge（file: 相对路径）
 *   3) profile 的 dsh.profile.bundles 末尾追加 dsh-purge
 *   4) pnpm-lock.yaml 里没有 dsh-purge 时备份并移除（CI=1 下 frozen-lockfile 会失败）
 *   5) 缺 prompt-inject.md 时放一份示例（已有则不动）
 *
 * 输出 JSON：{ ok, home, profile, profileDir, plugin, changed[], lock, inject, error? }
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLOT = "dsh-purge";
const SKIP_COPY = new Set([".git", "node_modules", ".DS_Store", ".stage"]);

function parseArgs(argv) {
  const out = { profile: "desktop", home: "", plugin: "", copy: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--home") out.home = argv[++i] || "";
    else if (a === "--profile") out.profile = argv[++i] || "desktop";
    else if (a === "--plugin") out.plugin = argv[++i] || "";
    else if (a === "--no-copy") out.copy = false;
  }
  return out;
}

const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(fp, obj) {
  // 无 BOM：带 BOM 的 package.json 会让 node 的 JSON.parse 直接失败
  fs.writeFileSync(fp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function backup(fp) {
  if (!exists(fp)) return "";
  const to = `${fp}.bak-${stamp()}`;
  if (isDir(fp)) fs.cpSync(fp, to, { recursive: true });
  else fs.copyFileSync(fp, to);
  return to;
}

function copyPlugin(from, to) {
  if (exists(to)) {
    const bak = `${to}.bak-${stamp()}`;
    fs.renameSync(to, bak);
  }
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => !SKIP_COPY.has(path.basename(src)),
  });
}

function homeCandidates(explicit) {
  const list = [];
  if (explicit) list.push(path.resolve(explicit));
  if (process.env.DSH_HOME) list.push(path.resolve(process.env.DSH_HOME));
  list.push(path.join(os.homedir(), ".dsh"));
  if (process.env.APPDATA) list.push(path.join(process.env.APPDATA, "DeepSeek Harness", "dsh-home"));
  if (process.env.LOCALAPPDATA) list.push(path.join(process.env.LOCALAPPDATA, "DeepSeek Harness", "dsh-home"));
  for (const root of [process.env.LOCALAPPDATA, process.env.ProgramFiles, os.homedir()]) {
    if (!root) continue;
    list.push(path.join(root, "Programs", "DeepSeek Harness", ".dsh"));
    list.push(path.join(root, "Programs", ".dsh"));
  }
  const seen = new Set();
  return list.filter((p) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function findHome(explicit, profile) {
  const cands = homeCandidates(explicit).filter((p) => isDir(path.join(p, "profiles")));
  for (const p of cands) {
    if (exists(path.join(p, "profiles", profile, "package.json"))) {
      return { home: p, profileDir: path.join(p, "profiles", profile) };
    }
  }
  const first = cands[0] || "";
  return { home: first, profileDir: first ? path.join(first, "profiles", profile) : "" };
}

function fileSpec(fromDir, toDir) {
  let rel = path.relative(fromDir, toDir).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return `file:${rel}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = {
    ok: false,
    home: "",
    profile: args.profile,
    profileDir: "",
    plugin: "",
    changed: [],
    lock: "n/a",
    inject: "n/a",
  };

  const repo = args.plugin ? path.resolve(args.plugin) : REPO;
  if (!exists(path.join(repo, "package.json"))) {
    result.error = `插件目录里没有 package.json：${repo}`;
    return result;
  }

  const { home, profileDir } = findHome(args.home, args.profile);
  if (!home) {
    result.error = "找不到 $DSH_HOME（先装 DeepSeek Harness 并启动一次，或传 --home）";
    return result;
  }
  result.home = home;
  result.profileDir = profileDir;

  const pkgPath = path.join(profileDir, "package.json");
  if (!exists(pkgPath)) {
    result.error = `没有 ${pkgPath}：先启动一次 DeepSeek Harness 让它生成 profile，再跑本脚本`;
    return result;
  }

  const dest = path.join(home, "plugins", SLOT);
  let plugin = dest;
  if (args.copy && !samePath(repo, dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    copyPlugin(repo, dest);
    result.changed.push(`copied ${repo} → ${dest}`);
  } else if (!exists(dest)) {
    result.error = `既没复制也没找到 ${dest}`;
    return result;
  }
  result.plugin = plugin;

  const pkg = readJson(pkgPath);
  const bak = backup(pkgPath);
  if (bak) result.changed.push(`backup ${path.basename(bak)}`);

  if (!pkg.dependencies || typeof pkg.dependencies !== "object") pkg.dependencies = {};
  const spec = fileSpec(profileDir, plugin);
  if (pkg.dependencies[SLOT] !== spec) {
    pkg.dependencies[SLOT] = spec;
    result.changed.push(`dependencies.${SLOT}=${spec}`);
  }

  if (!pkg.dsh || typeof pkg.dsh !== "object") pkg.dsh = {};
  if (!pkg.dsh.profile || typeof pkg.dsh.profile !== "object") pkg.dsh.profile = {};
  const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles.filter(Boolean) : [];
  if (!bundles.includes(SLOT)) {
    bundles.push(SLOT);
    result.changed.push("dsh.profile.bundles += dsh-purge");
  }
  pkg.dsh.profile.bundles = bundles;
  writeJson(pkgPath, pkg);

  // 锁文件里没有 dsh-purge → pnpm 在 frozen-lockfile 下会直接失败，插件装不进来。
  // 锁文件只能由 pnpm 自己重算，所以备份后删掉。
  const lockPath = path.join(profileDir, "pnpm-lock.yaml");
  if (exists(lockPath)) {
    if (fs.readFileSync(lockPath, "utf8").includes(SLOT)) {
      result.lock = "kept";
    } else {
      const lockBak = backup(lockPath);
      fs.rmSync(lockPath, { force: true });
      result.lock = lockBak ? `removed (${path.basename(lockBak)})` : "removed";
    }
  }

  // 提示词槽：只在没有的时候放示例，已有的永不动
  const inject = path.join(home, "prompt-inject.md");
  const example = path.join(plugin, "prompt-inject.example.md");
  if (!exists(inject) && exists(example)) {
    fs.copyFileSync(example, inject);
    result.inject = "seeded";
  } else if (exists(inject)) {
    result.inject = "kept";
  }

  result.ok = true;
  return result;
}

let out;
try {
  out = main();
} catch (error) {
  out = { ok: false, error: String(error && error.message ? error.message : error) };
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
process.exit(out.ok ? 0 : 1);
