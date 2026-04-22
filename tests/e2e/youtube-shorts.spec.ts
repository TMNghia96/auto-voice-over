import { _electron as electron } from '@playwright/test';
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('E2E: Download YouTube Shorts', () => {
  let electronApp: any;

  test.afterEach(async () => {
    if (electronApp) {
      console.log('[Test Cleanup] Closing Electron app...');
      await electronApp.close();
    }
  });

  test('E2E: Download YouTube Shorts and Start Pipeline', async () => {
    // 1. Launch the Electron app
    electronApp = await electron.launch({
      args: ['.'],
      executablePath: process.platform === 'win32' 
        ? path.join(process.cwd(), 'node_modules', '.bin', 'electron.cmd')
        : path.join(process.cwd(), 'node_modules', '.bin', 'electron'),
      env: { ...process.env, PLAYWRIGHT_TEST: 'true' } as { [key: string]: string },
    });

  electronApp.on('window', (window: any) => {
    window.on('console', (msg: any) => console.log(`[Electron Console] ${msg.text()}`));
  });

  // Log stdout/stderr from the Electron process
  const appProcess = electronApp.process();
  appProcess.stdout?.on('data', (data: Buffer) => console.log(`[Electron Stdout] ${data.toString()}`));
  appProcess.stderr?.on('data', (data: Buffer) => console.log(`[Electron Stderr] ${data.toString()}`));

  const window = await electronApp.firstWindow();
  console.log('[Test] Window found, waiting for app to initialize...');

  // 2. Wait for the main button to appear (handles loading screen automatically)
  console.log('[Test] Waiting for "Tạo Dự án Mới" button...');
  const createBtn = window.locator('button:has-text("Tạo Dự án Mới")');
  await createBtn.waitFor({ state: 'visible', timeout: 300000 }); // 5 min for first run
  
  // 3. Create a new project
  console.log('[Test] Clicking "Tạo Dự án Mới"...');
  await createBtn.click();
  
  const projectName = 'YouTube Shorts Test';
  const projectBaseDir = path.join(process.cwd(), 'test_workspace_shorts');
  const fullProjectPath = path.join(projectBaseDir, projectName);

  // Clean up previous test project
  if (fs.existsSync(fullProjectPath)) {
    console.log('[Test] Cleaning up existing project folder:', fullProjectPath);
    fs.rmSync(fullProjectPath, { recursive: true, force: true });
  }
  
  if (!fs.existsSync(projectBaseDir)) {
    fs.mkdirSync(projectBaseDir, { recursive: true });
  }

  await window.fill('input#name', projectName);
  await window.fill('input#path', projectBaseDir);
  await window.click('button:has-text("Tạo")');

  // 3. Wait for navigation to project page
  await expect(window).toHaveURL(/.*project\/.*/);
  
  // 4. Select URL Mode
  await window.click('text=Từ URL');

  // 5. Input YouTube URL
  const youtubeUrl = 'https://www.youtube.com/shorts/tk5of_2z5cg';
  await window.fill('input[placeholder*="YouTube"]', youtubeUrl);
  await window.click('button:has-text("Lấy thông tin")');

  // 6. Wait for video info and click Download
  // The button text for confirmation is "Bắt đầu tải xuống" (based on InputPhase.tsx logic)
  await window.waitForSelector('text=Bắt đầu tải xuống', { timeout: 30000 });
  await window.click('text=Bắt đầu tải xuống');

  // 7. Wait for download to complete
  // When completed, the phase UI shows "Tiếp tục" or similar
  await window.waitForSelector('text=Tiếp tục', { timeout: 120000 }); // YouTube download can be slow

  // 8. Verify the phase is completed
  const nextButton = window.locator('button:has-text("Tiếp tục")');
  await expect(nextButton).toBeVisible();
});
});
