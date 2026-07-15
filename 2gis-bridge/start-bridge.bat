@echo off
cd /d "%~dp0"
node bridge.mjs >> bridge.log 2>&1
