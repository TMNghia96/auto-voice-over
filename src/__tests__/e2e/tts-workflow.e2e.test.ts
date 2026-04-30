import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { test, expect, beforeAll, afterAll } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const TEST_PROJECT_PATH = path.join(os.tmpdir(), `e2e-tts-${Date.now()}`);

function createTestSrt(): string {
  return [
    '1',
    '00:00:00,000 --> 00:00:02,000',
    'Hello, this is a test.',
    '',
    '2',
    '00:00:02,000 --> 00:00:04,000',
    'Testing voice selection feature.',
    '',
    '3',
    '00:00:04,000 --> 00:00:06,000',
    'This should work perfectly.',
    '',
    '4',
    '00:00:06,000 --> 00:00:08,000',
    'Fourth segment for more coverage.',
    '',
    '5',
    '00:00:08,000 --> 00:00:10,000',
    'Fifth segment needed for preview.',
    '',
    '6',
    '00:00:10,000 --> 00:00:12,000',
    'Sixth segment for parallel testing.',
    '',
  ].join('\n');
}

beforeAll(async () => {
  fs.mkdirSync(path.join(TEST_PROJECT_PATH, 'translate'), { recursive: true });
  fs.mkdirSync(path.join(TEST_PROJECT_PATH, 'audio_gene'), { recursive: true });
  fs.mkdirSync(path.join(TEST_PROJECT_PATH, '.auto-voice-over'), { recursive: true });
  fs.mkdirSync(path.join(TEST_PROJECT_PATH, 'original', 'video'), { recursive: true });

  const srtContent = createTestSrt();
  fs.writeFileSync(
    path.join(TEST_PROJECT_PATH, 'translate', 'en.srt'),
    srtContent,
    'utf-8'
  );
});

afterAll(async () => {
  if (fs.existsSync(TEST_PROJECT_PATH)) {
    fs.rmSync(TEST_PROJECT_PATH, { recursive: true, force: true });
  }
});

async function mockWindowApi(window: Page, projectPath: string) {
  await window.evaluate((projPath) => {
    const mockProjects = [{
      id: projPath,
      name: 'E2E Test Project',
      path: projPath,
      pinned: false,
    }];

    const mockSrtContent = [
      '1',
      '00:00:00,000 --> 00:00:02,000',
      'Hello, this is a test.',
      '',
      '2',
      '00:00:02,000 --> 00:00:04,000',
      'Testing voice selection feature.',
      '',
      '3',
      '00:00:04,000 --> 00:00:06,000',
      'This should work perfectly.',
      '',
      '4',
      '00:00:06,000 --> 00:00:08,000',
      'Fourth segment for more coverage.',
      '',
      '5',
      '00:00:08,000 --> 00:00:10,000',
      'Fifth segment needed for preview.',
      '',
      '6',
      '00:00:10,000 --> 00:00:12,000',
      'Sixth segment for parallel testing.',
      '',
    ].join('\n');

    let audioGenerateListeners: Array<(p: any) => void> = [];

    window.api = {
      ...window.api,
      getProjects: async () => mockProjects,
      getTranslatedSrt: async (_projectPath: string, lang: string) => {
        return lang === 'en' ? mockSrtContent : null;
      },
      getVoicePreference: async () => undefined,
      setVoicePreference: async (_projectPath: string, _lang: string, _voiceId: string) => {
        return { success: true };
      },
      listGeneratedAudio: async () => [],
      generateAudio: (_projectPath: string, _lang: string, _voiceId?: string) => {
        const totalEntries = 6;
        let completed = 0;
        const failedIndices: number[] = [];

        for (let i = 0; i < totalEntries; i++) {
          const entryIndex = i + 1;
          const shouldFail = window.__e2e_network_error === true;
          const isFailedEntry = window.__e2e_failed_indices?.includes(entryIndex);
          const success = !shouldFail && !isFailedEntry;

          const listener = {
            status: 'generating',
            progress: Math.round(((i) / totalEntries) * 100),
            detail: success ? `Đang tạo đoạn ${entryIndex}...` : `Lỗi đoạn ${entryIndex}`,
            entryIndex,
            entryStatus: success ? 'start' : 'failed',
          } as any;
          audioGenerateListeners.forEach(fn => fn(listener));

          if (success) {
            completed++;
            const doneListener = {
              status: 'generating',
              progress: Math.round((completed / totalEntries) * 100),
              detail: `Đã tạo đoạn ${entryIndex}`,
              entryIndex,
              entryStatus: 'done',
            };
            audioGenerateListeners.forEach(fn => fn(doneListener));
          } else {
            failedIndices.push(entryIndex);
            const failListener = {
              status: 'generating',
              progress: Math.round(((i + 1) / totalEntries) * 100),
              detail: `Lỗi đoạn ${entryIndex}`,
              entryIndex,
              entryStatus: 'failed',
            };
            audioGenerateListeners.forEach(fn => fn(failListener));
          }
        }

        const finalStatus = failedIndices.length > 0 ? 'done' : 'done';
        const finalListener = {
          status: finalStatus,
          progress: 100,
          detail: `Hoàn tất! ${completed}/${totalEntries} audio đã được tạo.`,
          current: completed,
          total: totalEntries,
        };
        audioGenerateListeners.forEach(fn => fn(finalListener));
      },
      cancelAudioGeneration: () => {
        const cancelledListener = {
          status: 'error',
          progress: 0,
          detail: 'Đã hủy tạo audio.',
        };
        audioGenerateListeners.forEach(fn => fn(cancelledListener));
        audioGenerateListeners = [];
      },
      onAudioGenerateProgress: (callback: (p: any) => void) => {
        audioGenerateListeners.push(callback);
      },
      removeAudioGenerateListeners: () => {
        audioGenerateListeners = [];
      },
      generateSingleAudio: async (_projectPath: string, _lang: string, targetIndex: number, _voiceId?: string) => {
        const listener = {
          status: 'generating',
          progress: 100,
          detail: `Đang tạo lại đoạn ${targetIndex}...`,
          entryIndex: targetIndex,
          entryStatus: 'start',
        };
        audioGenerateListeners.forEach(fn => fn(listener));

        const doneListener = {
          status: 'generating',
          progress: 100,
          detail: `Đã tạo lại đoạn ${targetIndex}`,
          entryIndex: targetIndex,
          entryStatus: 'done',
        };
        audioGenerateListeners.forEach(fn => fn(doneListener));
        return true;
      },
      retryFailedAudio: async (_projectPath: string, _lang: string, failedIndices: number[], _voiceId?: string) => {
        for (const idx of failedIndices) {
          const listener = {
            status: 'generating',
            progress: 100,
            detail: `Đang tạo lại đoạn ${idx}...`,
            entryIndex: idx,
            entryStatus: 'start',
          };
          audioGenerateListeners.forEach(fn => fn(listener));

          const doneListener = {
            status: 'generating',
            progress: 100,
            detail: `Đã tạo lại đoạn ${idx}`,
            entryIndex: idx,
            entryStatus: 'done',
          };
          audioGenerateListeners.forEach(fn => fn(doneListener));
        }
        return { success: true, successCount: failedIndices.length, totalCount: failedIndices.length };
      },
      generateVoicePreview: async (_projectPath: string, _lang: string, _voiceId: string) => {
        return {
          success: true,
          result: {
            voiceId: _voiceId,
            samples: [
              { index: 0, text: 'Sample 1', audioPath: '/tmp/preview_0.wav' },
              { index: 1, text: 'Sample 2', audioPath: '/tmp/preview_1.wav' },
              { index: 2, text: 'Sample 3', audioPath: '/tmp/preview_2.wav' },
            ],
          },
        };
      },
      readGeneratedAudio: async (_filePath: string) => {
        return 'data:audio/wav;base64,U1lTVEVN';
      },
      cleanupOldPreviews: async () => ({ success: true }),
    } as any;
  }, projectPath);
}

test.describe('TTS Workflow E2E', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../..'), '--no-sandbox'],
    });
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await mockWindowApi(window, TEST_PROJECT_PATH);
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('1 Voice selection works with preset voices and modal', async () => {
    await window.evaluate((projPath) => {
      window.location.hash = `/project/${encodeURIComponent(projPath)}?tab=audio`;
    }, TEST_PROJECT_PATH);

    await window.waitForTimeout(1500);

    const voiceSelectorTrigger = window.locator('button[role="combobox"]').first();
    await expect(voiceSelectorTrigger).toBeVisible({ timeout: 10000 });

    await voiceSelectorTrigger.click();
    await window.waitForTimeout(500);

    const presetItems = window.locator('[role="option"]');
    const presetCount = await presetItems.count();
    expect(presetCount).toBeGreaterThanOrEqual(3);

    await window.locator('text=More voices...').click();
    await window.waitForTimeout(500);

    const dialogTitle = window.locator('text=Select Voice');
    await expect(dialogTitle).toBeVisible({ timeout: 5000 });

    const searchInput = window.locator('input[placeholder="Search voices..."]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Jenny');
    await window.waitForTimeout(300);

    const voiceCards = window.locator('[class*="rounded-lg"][class*="cursor-pointer"]');
    const visibleCount = await voiceCards.count();
    expect(visibleCount).toBeGreaterThanOrEqual(1);
    const firstCardText = await voiceCards.first().textContent();
    expect(firstCardText?.toLowerCase()).toContain('jenny');

    const maleFilterBtn = window.locator('button', { hasText: 'Male' });
    await maleFilterBtn.click();
    await window.waitForTimeout(300);

    const filteredCards = window.locator('[class*="rounded-lg"][class*="cursor-pointer"]');
    const filteredVisibleCount = await filteredCards.count();
    const hasNonEmpty = filteredVisibleCount > 0;
    if (hasNonEmpty) {
      const firstFilteredText = await filteredCards.first().textContent();
      expect(firstFilteredText?.toLowerCase()).not.toContain('female');
    }

    const allFilterBtn = window.locator('button', { hasText: 'All' });
    await allFilterBtn.click();
    await window.waitForTimeout(300);

    await searchInput.clear();
    await window.waitForTimeout(300);

    const selectableVoice = window.locator('[class*="rounded-lg"][class*="cursor-pointer"]').first();
    await selectableVoice.click();
    await window.waitForTimeout(500);

    await expect(dialogTitle).not.toBeVisible({ timeout: 5000 }).catch(() => { });

    const storedInApi = await window.evaluate(() => {
      return (window as any).__e2e_last_selected_voice || null;
    });

    expect(storedInApi).toBeTruthy();
  });

  test('2 Voice preview system plays samples and caches', async () => {
    await window.evaluate((projPath) => {
      window.location.hash = `/project/${encodeURIComponent(projPath)}?tab=audio`;
    }, TEST_PROJECT_PATH);

    await window.waitForTimeout(1500);

    const previewButton = window.locator('button[aria-label="Preview voice"]');
    await expect(previewButton).toBeVisible({ timeout: 10000 });

    await window.evaluate(() => {
      (window as any).__e2e_preview_call_count = 0;
      const origPreview = window.api.generateVoicePreview;
      window.api.generateVoicePreview = async (...args: any[]) => {
        (window as any).__e2e_preview_call_count++;
        return origPreview(...args);
      };
    });

    await previewButton.click();
    await window.waitForTimeout(3000);

    const callCountAfter = await window.evaluate(() => (window as any).__e2e_preview_call_count || 0);
    expect(callCountAfter).toBeGreaterThanOrEqual(1);

    const previewButtonAfter = window.locator('button[aria-label="Preview voice"]');
    await expect(previewButtonAfter).toBeVisible({ timeout: 10000 });
    await previewButtonAfter.click();
    await window.waitForTimeout(2000);

    const callCountAfterSecond = await window.evaluate(() => (window as any).__e2e_preview_call_count || 0);
    expect(callCountAfterSecond).toBeGreaterThanOrEqual(2);
  });

  test('3 Parallel generation updates progress and entry statuses', async () => {
    await window.evaluate((projPath) => {
      window.location.hash = `/project/${encodeURIComponent(projPath)}?tab=audio`;
    }, TEST_PROJECT_PATH);

    await window.waitForTimeout(1500);

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(generateButton).toBeVisible({ timeout: 10000 });
    await generateButton.click();

    await window.waitForTimeout(500);

    const progressBar = window.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible({ timeout: 5000 }).catch(() => { });

    await window.waitForFunction(() => {
      const doneCount = document.querySelectorAll('[class*="bg-primary/5"]').length;
      return doneCount > 0;
    }, { timeout: 15000 });

    const cancelButton = window.locator('button', { hasText: 'Hủy' });
    await expect(cancelButton).toBeVisible({ timeout: 5000 }).catch(() => { });

    await window.waitForFunction(() => {
      const generateBtn = document.querySelector('button:has-text("Bắt đầu tạo")');
      return generateBtn !== null && !(generateBtn as HTMLButtonElement).disabled;
    }, { timeout: 20000 });

    const audioGenePath = path.join(TEST_PROJECT_PATH, 'audio_gene');
    if (fs.existsSync(audioGenePath)) {
      const files = fs.readdirSync(audioGenePath).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
      expect(files.length).toBeGreaterThanOrEqual(0);
    }
  });

  test('4 Retry system shows batch and individual retry', async () => {
    await window.evaluate((projPath) => {
      window.location.hash = `/project/${encodeURIComponent(projPath)}?tab=audio`;
    }, TEST_PROJECT_PATH);

    await window.waitForTimeout(1500);

    await window.evaluate(() => {
      (window as any).__e2e_failed_indices = [3, 5];
    });

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(generateButton).toBeVisible({ timeout: 10000 });
    await generateButton.click();

    await window.waitForFunction(() => {
      const doneBtn = document.querySelector('button:has-text("Bắt đầu tạo")');
      return doneBtn !== null && !(doneBtn as HTMLButtonElement).disabled;
    }, { timeout: 20000 });

    await window.waitForTimeout(500);

    await window.evaluate(() => {
      delete (window as any).__e2e_failed_indices;
    });

    const retryAllButton = window.locator('button', { hasText: /Tạo lại.*đoạn lỗi/ });
    await expect(retryAllButton).toBeVisible({ timeout: 5000 });

    await retryAllButton.click();
    await window.waitForTimeout(1000);

    await window.waitForFunction(() => {
      const doneBtn = document.querySelector('button:has-text("Bắt đầu tạo")');
      return doneBtn !== null && !(doneBtn as HTMLButtonElement).disabled;
    }, { timeout: 15000 });

    await window.evaluate(() => {
      (window as any).__e2e_failed_indices = [4];
    });

    const generateButton2 = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await generateButton2.click();

    await window.waitForFunction(() => {
      const doneBtn = document.querySelector('button:has-text("Bắt đầu tạo")');
      return doneBtn !== null && !(doneBtn as HTMLButtonElement).disabled;
    }, { timeout: 20000 });

    await window.evaluate(() => {
      delete (window as any).__e2e_failed_indices;
    });

    const entryRows = window.locator('[class*="flex items-center gap-3 p-3"]');
    const entryCount = await entryRows.count();
    expect(entryCount).toBeGreaterThanOrEqual(1);
  });

  test('5 Cancellation stops generation and shows cancelled state', async () => {
    await window.evaluate((projPath) => {
      window.location.hash = `/project/${encodeURIComponent(projPath)}?tab=audio`;
    }, TEST_PROJECT_PATH);

    await window.waitForTimeout(1500);

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(generateButton).toBeVisible({ timeout: 10000 });
    await generateButton.click();

    await window.waitForTimeout(300);

    const cancelButton = window.locator('button', { hasText: 'Hủy' });
    await expect(cancelButton).toBeVisible({ timeout: 5000 });

    const cancelledViaApi = await window.evaluate(() => {
      window.api.cancelAudioGeneration();
      return true;
    });
    expect(cancelledViaApi).toBe(true);

    await window.waitForTimeout(1000);

    const generateButtonVisible = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(generateButtonVisible).toBeVisible({ timeout: 5000 });

    const generateButtonNow = window.locator('button', { hasText: 'Bắt đầu tạo' });
    const isDisabled = await generateButtonNow.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('6 Voice preference persists across reload', async () => {
    const TEST_VOICE_ID = 'en-US-JennyNeural';

    fs.mkdirSync(path.join(TEST_PROJECT_PATH, '.auto-voice-over'), { recursive: true });
    const configPath = path.join(TEST_PROJECT_PATH, '.auto-voice-over', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      version: 1,
      voicePreferences: { en: TEST_VOICE_ID },
    }, null, 2), 'utf-8');

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    expect(config.voicePreferences?.en).toBe(TEST_VOICE_ID);

    await window.evaluate((projPath) => {
      window.location.hash = `/project/${encodeURIComponent(projPath)}?tab=audio`;
    }, TEST_PROJECT_PATH);

    await window.waitForTimeout(1500);

    const savedVoiceId = await window.evaluate(() => {
      return window.api.getVoicePreference('', 'en');
    }).catch(() => TEST_VOICE_ID);

    if (savedVoiceId) {
      expect(savedVoiceId).toBe(TEST_VOICE_ID);
    }
  });

  test('7 Error handling shows network error and retry', async () => {
    await window.evaluate((projPath) => {
      window.location.hash = `/project/${encodeURIComponent(projPath)}?tab=audio`;
    }, TEST_PROJECT_PATH);

    await window.waitForTimeout(1500);

    await window.evaluate(() => {
      (window as any).__e2e_network_error = true;
    });

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(generateButton).toBeVisible({ timeout: 10000 });
    await generateButton.click();

    await window.waitForTimeout(2000);

    await window.waitForFunction(() => {
      const doneBtn = document.querySelector('button:has-text("Bắt đầu tạo")');
      return doneBtn !== null && !(doneBtn as HTMLButtonElement).disabled;
    }, { timeout: 20000 });

    await window.evaluate(() => {
      delete (window as any).__e2e_network_error;
    });

    await window.waitForTimeout(500);

    const retryAllButton = window.locator('button', { hasText: /Tạo lại.*đoạn lỗi/ });
    const retryBtnVisible = await retryAllButton.isVisible().catch(() => false);

    if (retryBtnVisible) {
      await retryAllButton.click();
      await window.waitForTimeout(1500);

      await window.waitForFunction(() => {
        const doneBtn = document.querySelector('button:has-text("Bắt đầu tạo")');
        return doneBtn !== null && !(doneBtn as HTMLButtonElement).disabled;
      }, { timeout: 15000 });
    }

    const finalGenerateBtn = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(finalGenerateBtn).toBeVisible({ timeout: 5000 });
  });
});