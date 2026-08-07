# 桌面本地服务器（HTTP，纯 PowerShell，无需 Python）。
# 仅用于本机浏览器（localhost 是安全上下文，摄像头/安装/PWA 均可正常工作）。
# 推荐用 run-desktop.bat 双击启动（会自动提权并打开浏览器）。
param([int]$Port = 8000)

$ErrorActionPreference = 'Stop'

# 项目根目录（scripts 的上一级）
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)

# 允许 HTTP.SYS 监听 localhost（首次需管理员；run-desktop.bat 会自动提权）
try { netsh http add urlacl url="http://localhost:$Port/" user="Everyone" 2>$null } catch { }

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript'; '.css' = 'text/css';
  '.json' = 'application/json'; '.png' = 'image/png'; '.webmanifest' = 'application/manifest+json';
  '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.txt' = 'text/plain'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Error "启动失败：请右键 run-desktop.bat / 本脚本，选择“以管理员身份运行”。错误：$_"
  exit 1
}

# 自动在默认浏览器打开
try { Start-Process "http://localhost:$Port/" } catch { }

Write-Host "==================================================" -ForegroundColor Yellow
Write-Host "已启动！电脑浏览器应已打开：" -ForegroundColor Green
Write-Host "  http://localhost:$Port/" -ForegroundColor White
Write-Host "请勿关闭本窗口；按 Ctrl+C 停止服务。" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Yellow

try {
  while ($true) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    $p = $req.Url.LocalPath
    if ($p -eq '/') { $p = '/index.html' }
    $file = Join-Path $root $p.TrimStart('/')
    if (Test-Path $file -PathType Leaf) {
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [IO.File]::ReadAllBytes($file)
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
    $res.Close()
  }
} finally {
  $listener.Stop()
  Write-Host "服务已停止。"
}
