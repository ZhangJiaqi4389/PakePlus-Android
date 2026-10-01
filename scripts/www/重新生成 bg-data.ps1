# 重新生成 bg-data.js（背景图内嵌为 data:URL，逐字节无损）
#
# 为什么需要这个文件：
#   用 file:// 直接打开时，页面和 background.jpg 属于不同源，
#   图片画进 canvas 后画布被标记为"已污染"，于是
#     - getImageData 抛 SecurityError -> 分割线/文字阴影的亮度自适应全失效
#     - texImage2D   抛 SecurityError -> 描边层和 glass-gl 的液态玻璃全失效
#   实测（Edge，file:// 下）：glass-gl 报
#     Failed to execute 'texImage2D' on 'WebGLRenderingContext': Tainted canvases may not be loaded.
#   data:URL 与页面同源，不会污染画布，所以把图原样内嵌进去，本地也能有完整玻璃。
#
# 无损：直接对 background.jpg 的字节做 base64，不做任何重编码。
#   base64 是编码不是压缩，解码回来与源文件逐字节相同，
#   所以 file:// 下看到的画面和 http:// 下完全一样，一个像素都不差。
#   （曾经用 System.Drawing 以 JPEG q90 重编码过，那是 lossy，已废弃。）
#
# 用法：换掉 background.jpg 之后运行一次
#   powershell -NoProfile -ExecutionPolicy Bypass -File "重新生成 bg-data.ps1"
#
# 产物 bg-data.js 是生成物，不要手改；已在 snapshot.ps1 的排除列表里。
# 体积约为源图的 4/3，属于预期内 —— 无损换体积，仅此一次。

param(
  [string]$Src = (Join-Path $PSScriptRoot 'background.jpg'),
  [string]$Out = (Join-Path $PSScriptRoot 'bg-data.js'),
  [int]$Chunk = 4096            # 每行字符数，只为不让某一行长到离谱
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Src)) { throw "找不到背景图：$Src" }

$bytes = [System.IO.File]::ReadAllBytes($Src)

# 按魔数认 MIME，不看扩展名
$mime = 'application/octet-stream'
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8 -and $bytes[2] -eq 0xFF) { $mime = 'image/jpeg' }
elseif ($bytes.Length -ge 8 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47) { $mime = 'image/png' }
elseif ($bytes.Length -ge 6 -and $bytes[0] -eq 0x52 -and $bytes[1] -eq 0x49 -and $bytes[2] -eq 0x46 -and $bytes[3] -eq 0x46) { $mime = 'image/webp' }

$b64 = [System.Convert]::ToBase64String($bytes)
$prefix = 'data:' + $mime + ';base64,'

# 分块写出，避免一行几 MB
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('/* bg-data.js —— 自动生成，勿手改。')
[void]$sb.AppendLine('   由 ' + [System.IO.Path]::GetFileName($Src) + ' 逐字节 base64 内嵌，**无任何重编码**：')
[void]$sb.AppendLine('   base64 是编码不是压缩，解码后与源文件逐字节相同，')
[void]$sb.AppendLine('   所以 file:// 和 http:// 看到的画面完全一致。')
[void]$sb.AppendLine('   作用见同名 .ps1 的注释。换背景图后重新运行本脚本。')
[void]$sb.AppendLine('   MIME: ' + $mime + '   源文件 ' + $bytes.Length + ' 字节 */')
[void]$sb.Append('window.__bgData = "' + $prefix + '"')
for ($i = 0; $i -lt $b64.Length; $i += $Chunk) {
  $len = [Math]::Min($Chunk, $b64.Length - $i)
  if ($i -gt 0) { [void]$sb.AppendLine() }
  [void]$sb.Append('  + "' + $b64.Substring($i, $len) + '"')
}
[void]$sb.AppendLine(';')

[System.IO.File]::WriteAllText($Out, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))

# 自检：把刚写出去的内容解回来，必须和源文件逐字节相同。
# 不能用 IndexOf('"') 之类的粗暴截取 —— 串是分块拼接的，块与块之间隔着 " 和 +，
# 直接去空白会留下这些符号，不是合法 base64。按引号分段取出再拼回去。
$verify = [System.IO.File]::ReadAllText($Out)
$parts  = [regex]::Matches($verify, '"([^"]*)"')
$inner  = -join ($parts | ForEach-Object { $_.Groups[1].Value })
if (-not $inner.StartsWith($prefix)) { throw "回环校验：产物开头不是预期的 $prefix" }
$inner  = $inner.Substring($prefix.Length)
if ($inner -notmatch '^[A-Za-z0-9+/]*={0,2}$') { throw '回环校验：base64 里混进了非法字符' }
$roundtrip = [System.Convert]::FromBase64String($inner)
$same = ($roundtrip.Length -eq $bytes.Length)
if ($same) {
  for ($i = 0; $i -lt $bytes.Length; $i++) {
    if ($roundtrip[$i] -ne $bytes[$i]) { $same = $false; break }
  }
}

$srcMB = [math]::Round($bytes.Length / 1MB, 2)
$outMB = [math]::Round((Get-Item $Out).Length / 1MB, 2)
Write-Host ''
Write-Host ("  {0,-16} {1,10:N2} MB" -f 'background.jpg', $srcMB)
Write-Host ("  {0,-16} {1,10:N2} MB   (无损 base64, MIME {2})" -f 'bg-data.js', $outMB, $mime)
Write-Host ("  逐字节回环校验    {0}" -f $(if ($same) { '通过 —— 解码后与源文件完全相同' } else { '**失败** 解码后与源文件不一致' }))
Write-Host ''
if (-not $same) { exit 1 }
Write-Host '  已更新 bg-data.js' -ForegroundColor Green
Write-Host ''