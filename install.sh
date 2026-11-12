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

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="desktop"
HOME_DIR=""
APPLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="${2:-desktop}"; shift 2 ;;
    --home)    HOME_DIR="${2:-}"; shift 2 ;;
    --apply)   APPLY=1; shift ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

say() { printf '  %s\n' "$*"; }

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
