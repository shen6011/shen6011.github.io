# 保质期管家（ExpiryKeeper）— 本地化手机扫码预警

一个**纯本地运行**的保质期 / 生产日期管理工具：用手机扫商品条码快速录入，自动计算到期日，
临期 / 过期主动提醒，支持导出 Excel、整库备份，数据**只存在你自己的设备，不外传**。

## 功能
- 📷 手机摄像头扫码录入（也支持相册图片识别、手动输入条码）
- 🤖 商品库自动学习：同一条码首次手填后，下次自动带出名称 / 规格 / 默认保质期
- 🗓️ 录入方式灵活：生产日期 + 保质期，或直接填到期日，自动算剩余天数
- ⏰ 看板打开即提醒；开启通知后每日本地推送临期摘要（Android 后台推送；iOS 打开即提醒）
- 📦 商品分类（食品 / 药品 / 化妆品 / 其他）、存放位置、数量单位、备注
- 🔍 清单搜索 / 状态筛选 / 排序 / 编辑 / 删除 / 批量删除
- 📊 统计看板（总数、状态分布、按分类、按位置）
- 📤 一键导出 Excel（全部 / 临期清单）；整库 JSON 备份与恢复
- 🌗 深色 / 浅色 / 跟随系统主题
- 🔌 可选在线条码库（默认关闭，需联网；结果仅本地缓存）

## 运行方式（小白请看《使用指南.html》图文版）

> 💡 看不懂下面的命令？直接双击打开 `使用指南.html`，照着图一步步点就行。

### 一键启动（推荐小白，无需懂命令）
- **电脑 + 摄像头**：双击 `scripts/run-desktop.bat` → 弹窗点“是” → 浏览器自动打开 `http://localhost:8000/`。
- **手机扫码**：双击 `scripts/run-phone.bat` → 弹窗点“是” → 屏幕显示 `https://192.168.x.x:8443/` 地址，手机连同一 WiFi 打开它，按提示“添加到主屏幕”即可。

### 方式 A：电脑端调试（HTTP，最简单）
```bash
cd expiry-keeper
python scripts/serve-http.py
```
浏览器打开 `http://localhost:8000/`。localhost 是安全上下文，摄像头与安装均可用。
（等价于一键启动里的 `run-desktop.bat`，后者用纯 PowerShell，不依赖是否装了 Python。）

### 方式 B：安装到手机（HTTPS，推荐日常使用）
手机调用摄像头与“添加到主屏幕”需要 HTTPS。最省事是双击 `scripts/run-phone.bat`（会自动提权）。
也可手动用 **管理员 PowerShell** 运行：
```powershell
cd expiry-keeper
powershell -ExecutionPolicy Bypass -File scripts/start-server.ps1
```
脚本会自动：
1. 生成一张本机自签证书（含你的局域网 IP）；
2. 绑定证书并启动 HTTPS 静态服务；
3. 打印手机访问地址，如 `https://192.168.x.x:8443/`。

手机连同一 WiFi，浏览器打开该地址（首次会有证书警告，点“高级 → 继续访问”），
然后点浏览器菜单“添加到主屏幕”即可像 App 一样离线使用。
停止服务：`Ctrl+C`。
清理证书绑定：`netsh http delete sslcert ipport=0.0.0.0:8443`

> 说明：自签证书仅用于本机局域网，数据不上云。如不想用 HTTPS，也可在手机浏览器直接打开电脑的
> HTTP 地址（方式 A），但摄像头扫码会受限，建议仅用于查看。

## 使用要点
- 首次扫码后手动补全商品名称，系统会记住该条码，下次秒录。
- 在“设置”里调整临期 / 紧急阈值（默认 30 天 / 7 天）。
- 导出 Excel 在“清单”页（导出全部）和“设置”页（全部 / 临期）均可。
- 定期在“设置 → 备份到 JSON”做整机备份，换机时用“恢复 JSON”还原。

## 目录结构
```
expiry-keeper/
├─ index.html  manifest.webmanifest  sw.js  styles.css
├─ vendor/            # 本地化依赖：dexie / xlsx / html5-qrcode
├─ js/                # 应用逻辑（ES Module）
│  ├─ main.js app.js util.js db.js scan.js barcodeLookup.js export.js notify.js
│  └─ views/          # dashboard / add / list / stats / settings
├─ icons/             # PWA 图标（scripts/gen_icons.py 生成）
└─ scripts/           # 一键启动：run-desktop.bat / run-phone.bat / serve-http.ps1 / start-server.ps1；gen_icons.py 生成图标
```

## 隐私
全部数据存放于浏览器 IndexedDB（本机）。在线条码查询默认关闭；开启时也仅用于识别商品名，
不读取你的任何记录，且结果缓存本地。无任何账号、无云端同步、无埋点。
