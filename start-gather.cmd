@echo off
setlocal
cd /d "%~dp0"
echo Starting Gather...
echo Open http://127.0.0.1:3000 in your browser.
echo Keep this window open while using the app. Press Ctrl+C to stop.
node server/index.js
if errorlevel 1 pause
