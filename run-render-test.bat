@echo off
echo ================================================================================
echo RENDER VIDEO TEST - FinalVideoService
echo ================================================================================
echo.
echo Project: C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot
echo Time: %date% %time%
echo.
echo ================================================================================
echo STARTING ELECTRON APP...
echo ================================================================================
echo.

cd /d "C:\Users\tranm.DESKTOP-8VO69Q5\Documents\project_code\auto-voice-over"
npm start

echo.
echo ================================================================================
echo INSTRUCTIONS:
echo ================================================================================
echo 1. App should open automatically
echo 2. Load project: C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot
echo 3. Click "Render Final Video" button
echo 4. Open DevTools (View -> Toggle Developer Tools) to see logs
echo 5. Wait for render to complete (~2-3 minutes)
echo 6. Check output: C:\Users\tranm.DESKTOP-8VO69Q5\Videos\Aniverse\200conongdot\final\final_video.mp4
echo.
echo WHAT TO CHECK IN LOGS:
echo - [Audio] Segment N: Check drift values
echo - [Video] Segment N: Check videoSpeed, adjustedSpeed, totalSpeed
echo - Look for slow motion segments (totalSpeed > 1.3)
echo.
echo ================================================================================
pause
