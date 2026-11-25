@echo off
chcp 65001 >nul
cd /d D:\A\html\mie-app
set GIT=C:\Users\Administrator\.qoder\bin\git\cmd\git.exe

echo ============================================
echo  第 1 步：登录并推送到 GitHub
echo  会弹一个 GitHub 登录窗口，选「浏览器登录」最省事
echo ============================================
echo.
"%GIT%" -c credential.helper=manager -c http.sslBackend=openssl -c http.sslCAInfo=D:\A\html\mie-app\.git\steamtools-ca.pem push origin main

echo.
echo ============================================
echo  看到上面出现 main -^> main 就是推成功了
echo  第 2 步：打开下面这个页面等云端编译（约 10-20 分钟）
echo  https://github.com/fxq134679a/mie-app/actions
echo  跑完后在本页最底部 Artifacts 下载 Oto-unsigned-ipa
echo  第 3 步：用 Sideloadly 签名安装（见 安装指南.md 阶段 3）
echo ============================================
echo.
pause
