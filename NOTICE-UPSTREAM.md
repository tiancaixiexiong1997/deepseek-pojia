# 上游署名 / Upstream attribution

本仓库是下述项目的**再分发 + 安装器封装**，插件本体（`lib/`、`bin/`、`client.js`、`cordis.patch.yml`、`presets/`、`skills/`、`docs/`）来自上游，未改写其许可与署名要求。

| 项 | 内容 |
|---|---|
| 上游仓库 | https://github.com/YuJunZhiXue/dsh-purge |
| 上游作者 | YuJunZhiXue |
| 上游版本 | 1.1.71（作者已公告暂停更新） |
| 许可证 | MIT，见仓库根 `LICENSE` |
| 上游镜像说明 | `docs/upstream/MIRROR-NOTICE.md` |
| 上游原始文档 | `docs/upstream/README.md`、`docs/upstream/README.zh-CN.md` |

## 本仓库相对上游的改动

1. `package.json` 的 `repository` / `homepage` / `bugs` / `dsh.install.*` 指向本仓库；
2. 新增 `scripts/link-profile.mjs` 与 `install.sh` / `install.ps1` / `install.bat`（一条命令安装，逻辑只有一份 JS 实现）；
3. 新增 `prompt-inject.example.md`（提示词示例，只在用户没有 `prompt-inject.md` 时落盘）；
4. `lib/update.js` 与 `client.js` 中保留**冻结补丁**：`checkUpdate` 纯本地返回、`applyUpdate` / `switchChannel` / `switchVersion` 全部封闭，不联网 GitHub —— 这是本仓库能长期复现的关键，升级前请先确认上游是否恢复维护；
5. 上游 README / 镜像说明移入 `docs/upstream/`，根目录换成本仓库的安装向 README。

## 授权边界（沿用上游）

- 仅用于**自己的机器**做模型行为评测、红队演练与宿主策略评估；
- 不针对公网第三方站点，不含木马、未授权渗透脚本或对外攻击载荷；
- 借用名称、思路、代码或提示词必须保留署名与本仓库/上游仓库地址；
- 禁止商业售卖、付费倒卖、黑灰产牟利（上游明确条款）。
