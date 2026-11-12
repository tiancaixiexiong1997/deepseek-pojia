# AGENT.md — 给智能体的安装说明

本文件供自动化智能体阅读。人类看 [README.md](README.md)。

## 一句话

把本仓库复制到 `$DSH_HOME/plugins/dsh-purge`，再跑
`node scripts/link-profile.mjs --profile <desktop|web>`，装完让用户自己点「应用」。

## 硬约束

1. **只动 `$DSH_HOME`**。不要改宿主程序目录（`.../DeepSeek Harness/resources/**`）、不要改 `~/.dsh` 以外的用户文件。
2. **不要全盘搜索**、不要扫 `node_modules`、不要读会话历史。
3. **不要重启宿主**，**不要代用户点「应用」**。除非用户在当前对话里明确说「直接应用」。
4. `dsh` 已经在跑就提醒用户先完全退出（桌面端托盘右键 → 退出），不要杀进程。
5. 任一 profile 不存在就跳过那一条，另一个照装；两个都没有就让用户先启动一次宿主。

## 步骤

```bash
# 1. 前置：Node >= 18（Windows 无闪黑窗用 >= 22）
node -v

# 2. 定位 DSH_HOME（按顺序取第一个含 profiles/<profile>/package.json 的）
#    $DSH_HOME → ~/.dsh → $APPDATA/DeepSeek Harness/dsh-home → $LOCALAPPDATA/DeepSeek Harness/dsh-home

# 3. 安装（二选一；批量部署建议钉 tag，当前 v1.1.71）
bash install.sh --profile desktop --ref v1.1.71            # macOS / Linux（钉 tag，可复现）
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop -Ref v1.1.71   # Windows

# 本地没有仓库（无 git 的机器）：直接拉 tag 版脚本
curl -fsSL https://raw.githubusercontent.com/tiancaixiexiong1997/deepseek-pojia/v1.1.71/install.sh | POJIA_REF=v1.1.71 bash

# 4. 打印状态，原样贴给用户
node "$DSH_HOME/plugins/dsh-purge/bin/dsh-purge.js" --status
```

`install.sh` / `install.ps1` 内部就是：复制仓库 → 调 `scripts/link-profile.mjs`。想自己控制流程就只调后者：

```bash
node scripts/link-profile.mjs --profile desktop [--home /path/.dsh]
```

它输出一段 JSON：

```json
{
  "ok": true,
  "home": "/Users/me/.dsh",
  "profile": "desktop",
  "profileDir": "/Users/me/.dsh/profiles/desktop",
  "plugin": "/Users/me/.dsh/plugins/dsh-purge",
  "changed": ["copied …", "backup package.json.bak-…", "dependencies.dsh-purge=file:../../plugins/dsh-purge", "dsh.profile.bundles += dsh-purge"],
  "lock": "removed (pnpm-lock.yaml.bak-…)",
  "inject": "seeded"
}
```

`ok:false` 时看 `error`：
- `找不到 $DSH_HOME` → 宿主没装或没启动过；
- `没有 …/profiles/desktop/package.json` → 让用户启动一次宿主、进主界面、完全退出，再重跑。

## 用户确认「直接应用」之后

```bash
node "$DSH_HOME/plugins/dsh-purge/lib/reapply-cli.js"
```

它等价于点「应用」：必要时解包 `app.asar` → 还原旧补丁 → 按本版补丁重写 → 输出 JSON。
返回 `"ok": true` 后告诉用户：**重启宿主**，重启后新开一轮对话注入才生效。

## 排错速查

| 现象 | 处理 |
|---|---|
| 装完侧栏没有 dsh-purge | profile 的 `dsh.profile.bundles` 里没有 `dsh-purge`；重跑 link-profile |
| 应用后提示词还是官方默认 | `resources/app.asar` 又被封回来了；点一次应用让它重新解包 |
| 应用报 `插件根未找到` | 宿主是密封包且没解包；用 `reapply-cli.js`（它会解包），不要用 `bin/dsh-purge.js --apply` |
| 补丁数字比别处少 | Windows 上 `tool-bash` 被禁、`tool-pwsh` 启用，条数差一两条正常；只认 `pending = 0` |
| pnpm 报 `frozen-lockfile` | `profiles/<profile>/pnpm-lock.yaml` 里没有 dsh-purge；link-profile 会备份并删掉它，重跑一次 |
