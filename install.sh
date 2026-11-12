#!/usr/bin/env bash
# dsh-purge 一键安装（macOS / Linux）
#
#   bash install.sh                      # 挂进 desktop 这个 profile
#   bash install.sh --profile web        # 挂进 web 这个 profile
#   bash install.sh --apply              # 装完直接洗一遍（等价于点「应用」，会解包 asar）
#   bash install.sh --home /path/.dsh    # 手动指定 DSH_HOME
#
# 只动 $DSH_HOME，不碰宿主程序目录。真实安装动作全在 scripts/link-profile.mjs，
# Windows 的 install.ps1 是同一份逻辑。
set -uo pipefail

# 被 curl | bash 时没有 BASH_SOURCE，退到当前目录
_SRC="${BASH_SOURCE[0]:-}"
if [ -n "$_SRC" ] && [ -f "$_SRC" ]; then
  HERE="$(cd "$(dirname "$_SRC")" && pwd)"
else
  HERE="$(pwd)"
fi
PROFILE="desktop"
HOME_DIR=""
APPLY=0
POJIA_REF="${POJIA_REF:-main}"

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="${2:-desktop}"; shift 2 ;;
    --home)    HOME_DIR="${2:-}"; shift 2 ;;
    --apply)   APPLY=1; shift ;;
    --ref)     POJIA_REF="${2:-main}"; shift 2 ;;
    -h|--help)
      cat <<'USAGE'
用法：bash install.sh [选项]

  --profile <desktop|web>   装进哪个 profile（默认 desktop）
  --home <DSH_HOME>         手动指定 .dsh 目录
  --apply                   装完直接应用补丁（等价于点「应用」）
  --ref <main|v1.1.71>      装哪个版本（默认 main；钉版本用 tag）
  -h, --help                这段帮助
USAGE
      exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

say() { printf '  %s\n' "$*"; }

# 装哪个版本：默认 main（跟最新提交）；POJIA_REF=v1.1.71 则钉到 tag
if [ "$POJIA_REF" = "main" ]; then
  TARBALL="https://github.com/tiancaixiexiong1997/deepseek-pojia/archive/refs/heads/main.tar.gz"
else
  TARBALL="https://github.com/tiancaixiexiong1997/deepseek-pojia/archive/refs/tags/${POJIA_REF}.tar.gz"
fi

# curl | bash 时本地没有仓库文件：先落一份 tarball 到临时目录再继续
if [ ! -f "$HERE/scripts/link-profile.mjs" ]; then
  echo "== 本地没有仓库文件，先下载一份"
  TMPDIR_PJ="$(mktemp -d)"
  if ! curl -fsSL "$TARBALL" | tar xz -C "$TMPDIR_PJ"; then
    echo "下载失败：$TARBALL" >&2
    exit 1
  fi
  HERE="$(find "$TMPDIR_PJ" -maxdepth 1 -type d -name 'deepseek-pojia-*' | head -1)"
  [ -n "$HERE" ] || { echo "解压后没找到仓库目录" >&2; exit 1; }
  trap 'rm -rf "$TMPDIR_PJ"' EXIT
fi

if ! command -v node >/dev/null 2>&1; then
  echo "需要 Node.js >= 18（推荐 22 LTS）。装完重开终端再跑。" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node 版本太低（$(node -v)），需要 >= 18。" >&2
  exit 1
fi

echo "== dsh-purge 一键安装"
say "插件：$HERE"
say "profile：$PROFILE"
say "Node：$(node -v)"

ARGS=(--profile "$PROFILE")
[ -n "$HOME_DIR" ] && ARGS+=(--home "$HOME_DIR")

OUT="$(node "$HERE/scripts/link-profile.mjs" "${ARGS[@]}")"
CODE=$?

printf '%s' "$OUT" | node -e '
let raw = "";
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
  let r;
  try { r = JSON.parse(raw); } catch { console.log(raw.trim()); process.exit(1); }
  if (!r.ok) { console.error("  X  " + (r.error || "未知错误")); process.exit(1); }
  console.log("  DSH_HOME  " + r.home);
  console.log("  profile   " + r.profileDir);
  console.log("  插件      " + r.plugin);
  for (const c of r.changed) console.log("  · " + c);
  console.log("  锁文件    " + r.lock);
  console.log("  提示词    " + r.inject);
});
'
FMT_CODE=$?
[ $CODE -ne 0 ] && exit $CODE
[ $FMT_CODE -ne 0 ] && exit $FMT_CODE

if [ "$APPLY" -eq 1 ]; then
  echo ""
  echo "== 直接应用补丁（等价于点「应用」）"
  say "官方包是密封的会先解包 app.asar，需要几百 MB 空间与一点时间"
  DSH_HOME_NOW="$(printf '%s' "$OUT" | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).home')"
  DSH_HOME="$DSH_HOME_NOW" node "$DSH_HOME_NOW/plugins/dsh-purge/lib/reapply-cli.js"
  echo "  上面若 ok:true，重启宿主即可生效（桌面端托盘右键 → 退出再开）"
fi

echo ""
echo "== 下一步"
echo "  1. 完全退出宿主（桌面端托盘右键 → 退出；Web 端 Ctrl-C 停掉 dsh web）"
echo "  2. 重新打开，会话标题旁点 dsh-purge → 清洗 → 应用（没加 --apply 时）"
echo "  3. 应用成功会自己重启一次；重启后新开一轮对话，注入才进当前会话"
echo "  4. 验收： node \"\$DSH_HOME/plugins/dsh-purge/bin/dsh-purge.js\" --status   → pending = 0"
