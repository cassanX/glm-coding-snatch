@echo off
chcp 65001 >nul
title GLM Coding Plan - Install Dependencies

echo ========================================
echo   GLM Coding Plan - 安装依赖
echo ========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 Node.js，请先安装:
    echo   https://nodejs.org/ (推荐 v18+)
    pause
    exit /b 1
)

echo [1/3] 初始化项目...
call npm init -y >nul 2>&1
echo  完成

echo [2/3] 安装 Playwright...
call npm install playwright
echo  完成

echo [3/3] 安装 Chromium 浏览器...
call npx playwright install chromium
echo  完成

echo.
echo ========================================
echo   安装完成!
echo   现在可以运行: node glm-coding-snatch.js
echo ========================================
pause
