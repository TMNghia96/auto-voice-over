@echo off
echo ================================================================================
echo CLEAN AND REBUILD - Fix Frozen Frames Issue
echo ================================================================================
echo.
echo Time: %date% %time%
echo.

cd /d "C:\Users\tranm.DESKTOP-8VO69Q5\Documents\project_code\auto-voice-over"

echo ================================================================================
echo Step 1: Stopping all processes...
echo ================================================================================
taskkill /F /IM electron.exe 2>nul
taskkill /F /IM node.exe 2>nul
timeout /t 2 >nul
echo Done!
echo.

echo ================================================================================
echo Step 2: Clearing cache...
echo ================================================================================
if exist "node_modules\.cache" (
    echo Removing node_modules\.cache...
    rmdir /s /q "node_modules\.cache"
)
if exist ".webpack" (
    echo Removing .webpack...
    rmdir /s /q ".webpack"
)
echo Done!
echo.

echo ================================================================================
echo Step 3: Clearing old output...
echo ================================================================================
if exist "C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\final\final_video.mp4" (
    echo Removing old final_video.mp4...
    del /f "C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\final\final_video.mp4"
)
if exist "C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\temp_final" (
    echo Removing temp_final folder...
    rmdir /s /q "C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\temp_final"
)
echo Done!
echo.

echo ================================================================================
echo Step 4: Verifying code fix...
echo ================================================================================
findstr /C:"adjustedSpeed = actualSegmentDuration / seg.targetDuration" "src\services\FinalVideoService.ts" >nul
if %errorlevel% equ 0 (
    echo [OK] Code fix verified: adjustedSpeed = actualSegmentDuration / seg.targetDuration
) else (
    echo [ERROR] Code fix NOT found! Check FinalVideoService.ts line 703
    pause
    exit /b 1
)
echo.

echo ================================================================================
echo Step 5: Rebuilding app...
echo ================================================================================
echo This may take 30-60 seconds...
call npm run package
if %errorlevel% neq 0 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)
echo Done!
echo.

echo ================================================================================
echo Step 6: Starting app...
echo ================================================================================
echo.
echo IMPORTANT INSTRUCTIONS:
echo 1. App will open in a few seconds
echo 2. Open DevTools IMMEDIATELY (Ctrl+Shift+I)
echo 3. Load project: C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot
echo 4. Click "Render Final Video"
echo 5. Watch for these logs in Console:
echo    [Audio] Segment N: ... drift=...
echo    [Video] Segment N: ... adjustedSpeed=... totalSpeed=... setpts=...
echo.
echo If you DON'T see these logs, the old code is still running!
echo.
echo ================================================================================
pause
echo.
echo Starting app now...
call npm start
