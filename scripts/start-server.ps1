# 以管理员身份运行：生成本机自签证书并启动 HTTPS 静态服务，供手机安装 PWA
# 用法（推荐用 run-phone.bat 双击启动，会自动提权）：
#   powershell -ExecutionPolicy Bypass -File scripts/start-server.ps1
# 可选端口：
#   powershell -ExecutionPolicy Bypass -File scripts/start-server.ps1 -Port 8443
param([int]$Port = 8443)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $wp = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $wp.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "需要管理员权限。请右键本脚本/run-phone.bat，选择“以管理员身份运行”。"
    exit 1
  }
}
Assert-Admin

# 获取局域网 IPv4（优先私网段，跳过回环/虚拟/ VPN/蓝牙/ Hyper-V 适配器）
$candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
  $_.IPAddress -ne '127.0.0.1' -and
  ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[01])\.') -and
  $_.InterfaceAlias -notmatch 'Loopback|VPN|Virtual|Hyper-V|Bluetooth|vEthernet|Docker'
}
$ip = ($candidates | Select-Object -First 1).IPAddress
if (-not $ip) {
  # 退而求其次：任何非回环 IPv4
  $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
    $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceAlias -notmatch 'Loopback'
  } | Select-Object -First 1).IPAddress
}
if (-not $ip) { $ip = '127.0.0.1' }
Write-Host "检测到局域网 IP: $ip" -ForegroundColor Cyan

# 清理旧的证书端口绑定（避免重跑报错）
try { netsh http delete sslcert ipport="0.0.0.0:$Port" 2>$null } catch { }
try { netsh http delete urlacl url="https://+:$Port/" 2>$null } catch { }

# 自签证书（含 IP SAN），有效期 5 年
$cert = New-SelfSignedCertificate `
  -DnsName "localhost", $ip `
  -CertStoreLocation "Cert:\LocalMachine\My" `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -TextExtension @("2.5.29.17={text}IPAddress=$ip&DNS=localhost") `
  -NotAfter (Get-Date).AddYears(5)
$thumb = $cert.Thumbprint
Write-Host "已创建证书: $thumb"

# 绑定 SSL 证书到端口
netsh http add sslcert ipport="0.0.0.0:$Port" certhash=$thumb appid='{00112233-4455-6677-8899-AABBCCDDEEFF}' | Out-Null
Write-Host "已绑定 sslcert 到端口 $Port"

# 允许 HTTP.SYS 监听该前缀（非管理员或首次运行需要）
try { netsh http add urlacl url="https://+:$Port/" user="Everyone" 2>$null } catch { }

# 放通 Windows 防火墙入站（手机才能连进来）
$fwName = "ExpiryKeeper-HTTPS-In-$Port"
try { netsh advfirewall firewall delete rule name="$fwName" 2>$null } catch { }
try {
  netsh advfirewall firewall add rule name="$fwName" dir=in action=allow protocol=TCP localport=$Port 2>$null
  Write-Host "已放通防火墙入站规则: $fwName"
} catch {
  Write-Warning "未能自动放通防火墙，手机可能连不上。请手动允许端口 $Port 的入站 TCP，或临时关闭防火墙后重试。"
}

# 简易 HTTPS 静态文件服务（.NET HttpListener）
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)  # 项目根目录（scripts 的上一级）
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript'; '.css' = 'text/css';
  '.json' = 'application/json'; '.png' = 'image/png'; '.webmanifest' = 'application/manifest+json';
  '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.txt' = 'text/plain'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add(("https://+:{0}/" -f $Port))
$listener.Start()

# 在电脑上自动打开预览（证书警告点“继续访问”即可）
try { Start-Process ("https://localhost:{0}/" -f $Port) } catch { }

Write-Host "==================================================" -ForegroundColor Yellow
Write-Host "手机连同一 WiFi，浏览器打开：" -ForegroundColor Green
Write-Host ("  https://{0}:{1}/" -f $ip, $Port) -ForegroundColor White
Write-Host "首次打开会有证书警告，点“高级” -> “继续访问”即可。" -ForegroundColor Gray
Write-Host "然后点浏览器菜单“添加到主屏幕”完成安装。" -ForegroundColor Gray
Write-Host "按 Ctrl+C 停止服务（防火墙/证书绑定会保留，下次重跑会自动清理）。" -ForegroundColor Gray
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
