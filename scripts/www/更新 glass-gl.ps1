# 更新 glass-gl.js（把 glass-gl 拉成本地副本）
#
# 为什么要有本地副本：
#   玻璃完全依赖 import('https://esm.sh/glass-gl@0.4.0') 这一次网络请求。
#   实测这个 CDN 是间歇性慢的 —— 同一份代码有时 2 秒就绪，有时 9 秒还没来；
#   离线、被代理拦、被广告拦截插件挡，玻璃就一直没有。这正是"有时没有玻璃"。
#   改成读本地文件后完全不依赖网络，断网也有完整玻璃。
#
# 为什么必须转成经典脚本（而不是直接 import('./glass-gl.mjs')）：
#   file:// 下模块脚本是 CORS 模式取的，实测动态 import() 本地模块直接 ERR_FAILED
#   （net::ERR_FAILED Script）。经典 <script src> 则正常（实测 onload 通）。
#   所以把 ESM 的 export 语句换成 window.createGlass，再用经典脚本引入。
#
# 用法（要升级 glass-gl 版本时）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File "更新 glass-gl.ps1"
#   powershell -NoProfile -ExecutionPolicy Bypass -File "更新 glass-gl.ps1" -Version 0.4.1
#
# 产物 glass-gl.js 是 vendored 的第三方文件，不要手改；
# 已在 snapshot.ps1 的排除列表里。

param(
  [string]$Version = '0.4.0'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Out = Join-Path $PSScriptRoot 'glass-gl.js'
$Url = "https://esm.sh/glass-gl@$Version/es2022/glass-gl.mjs"

Write-Host ''
Write-Host "  下载 $Url"
$raw = (Invoke-WebRequest -Uri $Url -UseBasicParsing).Content
if (-not $raw) { throw "下载失败：$Url" }
Write-Host ("  取到 {0:N0} 字符" -f $raw.Length)

# ---- 转换 1：去掉 sourcemap 注释（.map 不会一起下） ----
$body = [regex]::Replace($raw, '(?m)^[ \t]*//#\s*sourceMappingURL=.*\r?\n?', '')

# ---- 转换 2：export 语句换成挂到 window 上 ----
# 用正则而不是字面替换：压缩器的变量名可能随版本变（这版是 k），
# 只认 "把某个函数导出成 createGlass" 这件事本身。
$m = [regex]::Match($body, 'export\{\s*(\w+)\s+as\s+createGlass\s*\};?')
if (-not $m.Success) {
  throw "在下载内容里找不到 `export{... as createGlass}` —— 上游格式可能变了，需要人工看一遍。`n" +
        "（不要盲目替换，导出名对不上会让整块玻璃静默失效。）"
}
$fn = $m.Groups[1].Value
Write-Host "  找到导出：$fn as createGlass"
$body = $body.Remove($m.Index, $m.Length) + "window.createGlass = $fn;"

# ---- 转换 3：整体包进 IIFE ----
# 经典脚本里的 var/function 声明会挂到 window 上。
# 这个文件被压成了 I / X / W / k 这类单字母名，放出去既污染命名空间，
# 也可能和页面里的变量撞名。包一层之后全部变成局部作用域。
$thisCount = [regex]::Matches($body, '\bthis\b').Count
if ($thisCount -gt 0) {
  Write-Host ('  注意：代码里出现了 {0} 处 this，包 IIFE 会改变其绑定' -f $thisCount) -ForegroundColor Yellow
} else {
  Write-Host '  代码里没有 this，包 IIFE 不会改变任何绑定'
}

$header = @'
/* glass-gl VERSION_PLACEHOLDER —— 本地副本，自动生成，勿手改。
   来源: CDN_URL_PLACEHOLDER

   与上游 ESM 版的唯一差别：结尾的
       export{k as createGlass};
   换成了
       window.createGlass = k;
   并整体包进一个 IIFE。原因是 file:// 下动态 import() 本地模块会被 CORS 拦掉
   （实测 ERR_FAILED），只有经典 <script src> 能加载，而经典脚本没有 export。
   IIFE 是为了不让压缩后的单字母变量名（I/X/W/k）挂到 window 上。

   升级：powershell -ExecutionPolicy Bypass -File "更新 glass-gl.ps1" -Version <新版本>
   本文件由 esm.sh 分发，遵循其上游许可证。
*/
(function(){
'@

$header = $header.Replace('VERSION_PLACEHOLDER', $Version).Replace('CDN_URL_PLACEHOLDER', $Url)

# 注意变量名：PowerShell 变量名大小写不敏感，$out 和 $Out 是同一个。
# 这里曾经用 $out 存内容，结果把上面 $Out 的文件路径覆盖掉，
# WriteAllText 拿一整段代码当路径去写，抛"路径中有非法字符"。
$content = $header + "`n" + $body.Trim() + "`n})();`n"
[System.IO.File]::WriteAllText($Out, $content, [System.Text.UTF8Encoding]::new($false))

# ---- 自检 ----
# 关键：查的是 $body（转换后的上游代码），不是 $content（成品）。
# 成品头部注释里为了说明改动，正写着 export 和 import 这两个词，
# 拿成品去查必然误报 —— 这个坑踩过一次。
$check = [System.IO.File]::ReadAllText($Out)
$problems = @()
if ([regex]::IsMatch($body, '(^|[^.\w])export[\s{]'))  { $problems += '上游代码里还残留 export 语句' }
if ([regex]::IsMatch($body, '(^|[^.\w])import[\s{(''"]')) { $problems += '上游代码里还残留 import（说明它引了外部依赖，本地副本会缺东西）' }
if (-not [regex]::IsMatch($check, "window\.createGlass\s*=\s*$fn\s*;")) { $problems += "成品里没有找到挂到 window 上的 createGlass = $fn" }
if ([regex]::IsMatch($check, 'sourceMappingURL')) { $problems += '还残留 sourceMappingURL 注释' }
if (-not $check.TrimStart().StartsWith('/*')) { $problems += '成品开头不是注释，文件头可能被写坏' }
if (-not $check.TrimEnd().EndsWith('})();')) { $problems += '成品结尾不是 IIFE 收尾，IIFE 可能没闭合' }
# 泄漏检查：IIFE 之外不能有顶层声明。压缩后的单字母名挂到 window 上会污染命名空间。
$outsideIIFE = $check.Substring($check.IndexOf('})();'))
if ([regex]::IsMatch($outsideIIFE, '(^|[;}\s])(var|let|const|function)\s')) { $problems += 'IIFE 之外还有顶层声明，变量会泄漏到 window' }
if ($problems.Count) {
  Write-Host ''
  Write-Host '  自检未通过：' -ForegroundColor Red
  $problems | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
  exit 1
}

Write-Host ''
Write-Host ('  glass-gl.js  {0:N1} KB   (上游 {1:N1} KB)' -f ((Get-Item $Out).Length / 1KB), ([Text.Encoding]::UTF8.GetByteCount($raw) / 1KB))
Write-Host '  自检通过：无 export / 无 import / window.createGlass 已挂好 / 已包 IIFE' -ForegroundColor Green
Write-Host ''