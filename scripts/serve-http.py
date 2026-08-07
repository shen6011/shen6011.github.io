#!/usr/bin/env python3
# 桌面本地测试服务器（HTTP）。localhost 属于安全上下文，摄像头/安装/PWA 均可正常工作。
# 仅用于电脑端调试；手机需用 start-server.ps1（HTTPS）才能调用摄像头与安装。
import http.server, os, sys
from pathlib import Path

PORT = 8000
ROOT = Path(__file__).resolve().parent.parent  # 项目根目录（scripts 的上一级）
os.chdir(ROOT)
handler = http.server.SimpleHTTPRequestHandler
try:
    httpd = http.server.HTTPServer(('0.0.0.0', PORT), handler)
    print(f"已启动：在电脑浏览器打开  http://localhost:{PORT}/")
    print("手机如需访问，请改用 start-server.ps1（HTTPS）。Ctrl+C 停止。")
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\n已停止。")
