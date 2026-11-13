@echo off
if "%MONGODB_URI%"=="" (
  echo Set MONGODB_URI before starting mongosh.
  exit /b 1
)
npx.cmd mongosh "%MONGODB_URI%" %*

