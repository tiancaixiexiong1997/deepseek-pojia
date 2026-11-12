#Requires -Version 5.1
<#
  dsh-purge 一键安装（Windows）

    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
    powershell ... -File .\install.ps1 -Profile web
    powershell ... -File .\install.ps1 -Apply            # 装完直接洗一遍（解包 asar）
    powershell ... -File .\install.ps1 -DshHome "D:\dsh-data\.dsh"

  真实安装动作全在 scripts\link-profile.mjs，macOS/Linux 的 install.sh 是同一份逻辑。
#>
[CmdletBinding()]
param(
  [ValidateSet('desktop', 'web')][string]$Profile = 'desktop',
  [string]$DshHome = '',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Say([string]$m) { Write-Host ("  " + $m) }
function Bad([string]$m) { Write-Host ("  X  " + $m) -ForegroundColor Red }

$Here = $PSScriptRoot

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Bad '需要 Node.js >= 18（推荐 22 LTS）。装完重开终端再跑。'
  exit 1
}
$major = 0
$ver = (& $node.Source -v) 2>$null
if ($ver -match '^v(\d+)') { $major = [int]$Matches[1] }
if ($major -lt 18) { Bad ("Node 版本太低（" + $ver + "），需要 >= 18"); exit 1 }

Write-Host '== dsh-purge 一键安装'
Say ("插件：" + $Here)
Say ("profile：" + $Profile)
Say ("Node：" + $ver)

$cmdArgs = @((Join-Path (Join-Path $Here 'scripts') 'link-profile.mjs'), '--profile', $Profile)
if ($DshHome) { $cmdArgs += @('--home', $DshHome) }

$raw = & $node.Source @cmdArgs 2>&1 | Out-String
$code = $LASTEXITCODE

$info = $null
try { $info = $raw | ConvertFrom-Json } catch { }
if (-not $info -or -not $info.ok) {
  if ($info -and $info.error) { Bad $info.error } else { Write-Host $raw }
  exit 1
}

Say ("DSH_HOME  " + $info.home)
Say ("profile   " + $info.profileDir)
Say ("插件      " + $info.plugin)
foreach ($c in $info.changed) { Say ("· " + $c) }
Say ("锁文件    " + $info.lock)
Say ("提示词    " + $info.inject)

if ($Apply) {
  Write-Host ''
  Write-Host '== 直接应用补丁（等价于点「应用」）'
  Say '官方包是密封的会先解包 app.asar，需要几百 MB 空间与一点时间'
  $env:DSH_HOME = $info.home
  & $node.Source (Join-Path (Join-Path $info.plugin 'lib') 'reapply-cli.js')
  if ($LASTEXITCODE -ne 0) { Bad '应用没成功，看上面的输出'; exit 1 }
  Say '应用完成，重启宿主生效'
}

Write-Host ''
Write-Host '== 下一步'
Write-Host '  1. 完全退出宿主（托盘右键 → 退出，不是关窗口）'
Write-Host '  2. 重新打开，会话标题旁点 dsh-purge → 清洗 → 应用（没加 -Apply 时）'
Write-Host '  3. 应用成功会自己重启一次；重启后新开一轮对话，注入才进当前会话'
Write-Host '  4. 验收： node "$env:USERPROFILE\.dsh\plugins\dsh-purge\bin\dsh-purge.js" --status'
