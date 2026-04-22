# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: youtube-shorts.spec.ts >> E2E: Download YouTube Shorts and Start Pipeline
- Location: tests\e2e\youtube-shorts.spec.ts:6:5

# Error details

```
TimeoutError: page.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('text=Tạo Dự án Mới')

```

# Test source

```ts
  1  | import { _electron as electron } from '@playwright/test';
  2  | import { test, expect } from '@playwright/test';
  3  | import path from 'path';
  4  | import fs from 'fs';
  5  | 
  6  | test('E2E: Download YouTube Shorts and Start Pipeline', async () => {
  7  |   // 1. Launch the Electron app
  8  |   const electronApp = await electron.launch({
  9  |     args: ['.vite/build/main.js'],
  10 |     executablePath: process.platform === 'win32' 
  11 |       ? path.join(process.cwd(), 'node_modules', '.bin', 'electron.cmd')
  12 |       : path.join(process.cwd(), 'node_modules', '.bin', 'electron'),
  13 |   });
  14 | 
  15 |   const window = await electronApp.firstWindow();
  16 |   await window.waitForLoadState('networkidle');
  17 | 
  18 |   // 2. Create a new project
> 19 |   await window.click('text=Tạo Dự án Mới');
     |                ^ TimeoutError: page.click: Timeout 30000ms exceeded.
  20 |   
  21 |   const projectName = 'YouTube Shorts Test';
  22 |   const projectBaseDir = path.join(process.cwd(), 'test_workspace_shorts');
  23 |   
  24 |   if (!fs.existsSync(projectBaseDir)) {
  25 |     fs.mkdirSync(projectBaseDir, { recursive: true });
  26 |   }
  27 | 
  28 |   await window.fill('input#name', projectName);
  29 |   await window.fill('input#path', projectBaseDir);
  30 |   await window.click('button:has-text("Tạo")');
  31 | 
  32 |   // 3. Wait for navigation to project page
  33 |   await expect(window).toHaveURL(/.*project\/.*/);
  34 |   
  35 |   // 4. Select URL Mode
  36 |   await window.click('text=Từ URL');
  37 | 
  38 |   // 5. Input YouTube URL
  39 |   const youtubeUrl = 'https://www.youtube.com/shorts/tk5of_2z5cg';
  40 |   await window.fill('input[placeholder*="YouTube"]', youtubeUrl);
  41 |   await window.click('button:has-text("Lấy thông tin")');
  42 | 
  43 |   // 6. Wait for video info and click Download
  44 |   // The button text for confirmation is "Bắt đầu tải xuống" (based on InputPhase.tsx logic)
  45 |   await window.waitForSelector('text=Bắt đầu tải xuống', { timeout: 30000 });
  46 |   await window.click('text=Bắt đầu tải xuống');
  47 | 
  48 |   // 7. Wait for download to complete
  49 |   // When completed, the phase UI shows "Tiếp tục" or similar
  50 |   await window.waitForSelector('text=Tiếp tục', { timeout: 120000 }); // YouTube download can be slow
  51 | 
  52 |   // 8. Verify the phase is completed
  53 |   const nextButton = window.locator('button:has-text("Tiếp tục")');
  54 |   await expect(nextButton).toBeVisible();
  55 | 
  56 |   // Close app
  57 |   await electronApp.close();
  58 | });
  59 | 
```