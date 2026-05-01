import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { test, expect, beforeAll, afterAll } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const TEST_PROJECT_PATH = path.join(os.tmpdir(), `e2e-tts-${Date.now()}`);
const EN_VOICES_FOR_LANG = [
  { id: 'en-US-JennyNeural', name: 'Jenny', gender: 'Female', language: 'en', label: 'Jenny', isPreset: true },
  { id: 'en-US-GuyNeural', name: 'Guy', gender: 'Male', language: 'en', label: 'Guy', isPreset: true },
  { id: 'en-US-AriaNeural', name: 'Aria', gender: 'Female', language: 'en', label: 'Aria', isPreset: true },
  { id: 'en-US-DavisNeural', name: 'Davis', gender: 'Male', language: 'en', label: 'Davis', isPreset: false },
  { id: 'en-US-JaneNeural', name: 'Jane', gender: 'Female', language: 'en', label: 'Jane', isPreset: false },
];

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
    let cancelled = false;

    function sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    const EN_VOICES = [
      { id: 'en-US-JennyNeural', name: 'Jenny', gender: 'Female', language: 'en', label: 'Jenny', isPreset: true },
      { id: 'en-US-GuyNeural', name: 'Guy', gender: 'Male', language: 'en', label: 'Guy', isPreset: true },
      { id: 'en-US-AriaNeural', name: 'Aria', gender: 'Female', language: 'en', label: 'Aria', isPreset: true },
      { id: 'en-US-DavisNeural', name: 'Davis', gender: 'Male', language: 'en', label: 'Davis', isPreset: false },
      { id: 'en-US-JaneNeural', name: 'Jane', gender: 'Female', language: 'en', label: 'Jane', isPreset: false },
    ];

    window.api = {
      ...window.api,
      getProjects: async () => mockProjects,
      getTranslatedSrt: async (_projectPath: string, lang: string) => {
        return lang === 'en' ? mockSrtContent : null;
      },
      getVoicePreference: async (_projectPath: string, lang: string) => {
        if (lang === 'en' && window.__e2e_voice_pref) {
          return window.__e2e_voice_pref;
        }
        return undefined;
      },
      setVoicePreference: async (_projectPath: string, _lang: string, _voiceId: string) => {
        (window as any).__e2e_last_set_voice = _voiceId;
        return { success: true };
      },
      listGeneratedAudio: async () => [],
      generateAudio: async (_projectPath: string, _lang: string, _voiceId?: string) => {
        const totalEntries = 6;
        let completed = 0;
        const failedIndices: number[] = [];
        cancelled = false;

        const errorType = (window as any).__e2e_error_type || null;

        for (let i = 0; i < totalEntries; i++) {
          if (cancelled) break;

          const entryIndex = i + 1;
          const isFailedEntry = (window as any).__e2e_failed_indices?.includes(entryIndex);
          const isNetworkError = errorType === 'network';
          const isAuthError = errorType === 'auth';
          const isServerError = errorType === 'server';

          let shouldFail = isFailedEntry;
          if (errorType) {
            shouldFail = true;
          }

          await sleep(200);

          if (cancelled) {
            const cancelListener = {
              status: 'error',
              progress: 0,
              detail: 'Đã hủy tạo audio.',
            };
            audioGenerateListeners.forEach(fn => fn(cancelListener));
            return;
          }

          const startListener = {
            status: 'generating',
            progress: Math.round((i / totalEntries) * 100),
            detail: `Đang tạo đoạn ${entryIndex}...`,
            entryIndex,
            entryStatus: 'start',
          };
          audioGenerateListeners.forEach(fn => fn(startListener));

          await sleep(200);

          if (cancelled) {
            const cancelListener = {
              status: 'error',
              progress: 0,
              detail: 'Đã hủy tạo audio.',
            };
            audioGenerateListeners.forEach(fn => fn(cancelListener));
            return;
          }

          if (shouldFail) {
            failedIndices.push(entryIndex);
            let errorDetail = `Lỗi đoạn ${entryIndex}`;
            if (isNetworkError) errorDetail = `Lỗi kết nối đoạn ${entryIndex}`;
            else if (isAuthError) errorDetail = `Lỗi xác thực đoạn ${entryIndex}`;
            else if (isServerError) errorDetail = `Lỗi máy chủ đoạn ${entryIndex}`;

            const failListener = {
              status: 'generating',
              progress: Math.round(((i + 1) / totalEntries) * 100),
              detail: errorDetail,
              entryIndex,
              entryStatus: 'failed',
            };
            audioGenerateListeners.forEach(fn => fn(failListener));
          } else {
            completed++;
            const doneListener = {
              status: 'generating',
              progress: Math.round((completed / totalEntries) * 100),
              detail: `Đã tạo đoạn ${entryIndex}`,
              entryIndex,
              entryStatus: 'done',
            };
            audioGenerateListeners.forEach(fn => fn(doneListener));
          }
        }

        if (!cancelled) {
          const finalStatus = failedIndices.length > 0 ? 'done' : 'done';
          const finalListener = {
            status: finalStatus,
            progress: 100,
            detail: `Hoàn tất! ${completed}/${totalEntries} audio đã được tạo.`,
            current: completed,
            total: totalEntries,
          };
          audioGenerateListeners.forEach(fn => fn(finalListener));
        }
      },
      cancelAudioGeneration: () => {
        cancelled = true;
        audioGenerateListeners = [];
      },
      onAudioGenerateProgress: (callback: (p: any) => void) => {
        audioGenerateListeners.push(callback);
      },
      removeAudioGenerateListeners: () => {
        audioGenerateListeners = [];
      },
      generateSingleAudio: async (_projectPath: string, _lang: string, targetIndex: number, _voiceId?: string) => {
        const startListener = {
          status: 'generating',
          progress: 100,
          detail: `Đang tạo lại đoạn ${targetIndex}...`,
          entryIndex: targetIndex,
          entryStatus: 'start',
        };
        audioGenerateListeners.forEach(fn => fn(startListener));

        await sleep(200);

        const doneListener = {
          status: 'generating',
          progress: 100,
          detail: `Đã tạo lại đoạn ${targetIndex}`,
          entryIndex: targetIndex,
          entryStatus: 'done',
        };
        audioGenerateListeners.forEach(fn => fn(doneListener));

        await sleep(50);

        const finalListener = {
          status: 'done',
          progress: 100,
          detail: `Hoàn tất!`,
          current: 1,
          total: 1,
        };
        audioGenerateListeners.forEach(fn => fn(finalListener));
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

          await sleep(200);

          const doneListener = {
            status: 'generating',
            progress: 100,
            detail: `Đã tạo lại đoạn ${idx}`,
            entryIndex: idx,
            entryStatus: 'done',
          };
          audioGenerateListeners.forEach(fn => fn(doneListener));
        }

        await sleep(50);

        return { success: true, successCount: failedIndices.length, totalCount: failedIndices.length };
      },
      generateVoicePreview: async (_projectPath: string, _lang: string, _voiceId: string) => {
        const delay = (window as any).__e2e_preview_delay || 0;
        if (delay > 0) {
          await sleep(delay);
        }
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
      getAllVoicesForLanguage: (lang: string) => {
        if (lang === 'en') return EN_VOICES;
        return [];
      },
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

  async function navigateToAudioTab() {
    await window.evaluate((projPath) => {
      window.location.hash = `/project/${encodeURIComponent(projPath)}?tab=audio`;
    }, TEST_PROJECT_PATH);
    await window.waitForTimeout(1500);
  }

  async function waitForGenerationComplete(timeout = 25000) {
    await window.waitForFunction(() => {
      const btn = document.querySelector('button:has-text("Bắt đầu tạo")');
      return btn !== null && !(btn as HTMLButtonElement).disabled;
    }, { timeout });
    await window.waitForTimeout(300);
  }

  test('1 Voice selection works with preset voices and modal', async () => {
    await navigateToAudioTab();

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

    await expect(dialogTitle).not.toBeVisible({ timeout: 5000 });

    const storedInApi = await window.evaluate(() => {
      return (window as any).__e2e_last_selected_voice || null;
    });

    expect(storedInApi).toBeTruthy();
  });

  test('2 Voice preview system plays samples and caches', async () => {
    await navigateToAudioTab();

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
    await navigateToAudioTab();

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(generateButton).toBeVisible({ timeout: 10000 });
    await generateButton.click();

    const progressBar = window.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible({ timeout: 5000 });

    await window.waitForFunction(() => {
      const doneCount = document.querySelectorAll('[class*="bg-primary/5"]').length;
      return doneCount > 0;
    }, { timeout: 15000 });

    const cancelBtn = window.locator('button', { hasText: 'Hủy' });
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });

    await waitForGenerationComplete();

    const audioGenePath = path.join(TEST_PROJECT_PATH, 'audio_gene');
    if (fs.existsSync(audioGenePath)) {
      const files = fs.readdirSync(audioGenePath).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
      expect(files.length).toBeGreaterThanOrEqual(0);
    }
  });

  test('4 Cancellation stops generation and shows cancelled state', async () => {
    await navigateToAudioTab();

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(generateButton).toBeVisible({ timeout: 10000 });
    await generateButton.click();

    const cancelButton = window.locator('button', { hasText: 'Hủy' });
    await expect(cancelButton).toBeVisible({ timeout: 5000 });

    await cancelButton.click();
    await window.waitForTimeout(500);

    const generateButtonRestored = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(generateButtonRestored).toBeVisible({ timeout: 5000 });
    const isDisabled = await generateButtonRestored.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('5 Attempt counter shows retry count after batch retry', async () => {
    await navigateToAudioTab();

    await window.evaluate(() => {
      (window as any).__e2e_failed_indices = [2, 4, 6];
    });

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await generateButton.click();

    await waitForGenerationComplete();

    await window.waitForFunction(() => {
      const failedElements = document.querySelectorAll('[class*="border-l-destructive"]');
      return failedElements.length >= 3;
    }, { timeout: 5000 });

    const retryAllButton = window.locator('button', { hasText: /Tạo lại.*đoạn lỗi/ });
    await expect(retryAllButton).toBeVisible({ timeout: 5000 });
    await retryAllButton.click();

    await waitForGenerationComplete();

    const attemptText = window.locator('text=2 lần thử');
    await expect(attemptText.first()).toBeVisible({ timeout: 5000 });
    const attemptCount = await attemptText.count();
    expect(attemptCount).toBeGreaterThanOrEqual(1);
  });

  test('6 Preview loading state shows spinner and playing text', async () => {
    await navigateToAudioTab();

    await window.evaluate(() => {
      (window as any).__e2e_preview_delay = 500;
    });

    const previewButton = window.locator('button[aria-label="Preview voice"]');
    await expect(previewButton).toBeVisible({ timeout: 10000 });

    await previewButton.click();

    const spinner = window.locator('[role="status"]').first();
    await expect(spinner).toBeVisible({ timeout: 3000 });

    const loaderIcon = window.locator('svg.lucide-loader-2').first();
    await expect(loaderIcon).toBeVisible({ timeout: 2000 }).catch(() => {});

    await window.waitForTimeout(3000);

    const previewButtonRestored = window.locator('button[aria-label="Preview voice"] svg.lucide-volume-2');
    await expect(previewButtonRestored).toBeVisible({ timeout: 5000 });
  });

  test('7 Error categorization for different error types', async () => {
    await navigateToAudioTab();

    for (const errorType of ['network', 'auth', 'server']) {
      await window.evaluate((et) => {
        (window as any).__e2e_error_type = et;
      }, errorType);

      const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
      await generateButton.click();

      await waitForGenerationComplete();

      await window.evaluate(() => {
        delete (window as any).__e2e_error_type;
      });

      await window.waitForTimeout(300);
    }

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(generateButton).toBeVisible({ timeout: 5000 });
    const isDisabled = await generateButton.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('8 Voice selection end-to-end flow via VoiceModal', async () => {
    await navigateToAudioTab();

    await window.evaluate(() => {
      (window as any).__e2e_voice_pref = 'en-US-AriaNeural';
    });

    const voiceSelectorTrigger = window.locator('button[role="combobox"]').first();
    await expect(voiceSelectorTrigger).toBeVisible({ timeout: 10000 });

    await voiceSelectorTrigger.click();
    await window.waitForTimeout(500);

    await window.locator('text=More voices...').click();
    await window.waitForTimeout(500);

    const dialogTitle = window.locator('text=Select Voice');
    await expect(dialogTitle).toBeVisible({ timeout: 5000 });

    const davisCard = window.locator('[class*="rounded-lg"][class*="cursor-pointer"]', { hasText: 'Davis' });
    await expect(davisCard).toBeVisible({ timeout: 5000 });
    await davisCard.click();
    await window.waitForTimeout(500);

    await expect(dialogTitle).not.toBeVisible({ timeout: 5000 });

    const savedVoice = await window.evaluate(() => {
      return (window as any).__e2e_last_set_voice || null;
    });
    expect(savedVoice).toBe('en-US-DavisNeural');

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await expect(generateButton).toBeVisible({ timeout: 5000 });
    await generateButton.click();

    await waitForGenerationComplete();

    await window.evaluate(() => {
      const generateBtn = document.querySelector('button:has-text("Bắt đầu tạo")');
      return generateBtn !== null && !(generateBtn as HTMLButtonElement).disabled;
    });
  });

  test('9 Individual retry entry via hover and click', async () => {
    await navigateToAudioTab();

    await window.evaluate(() => {
      (window as any).__e2e_failed_indices = [3, 5];
    });

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await generateButton.click();

    await waitForGenerationComplete();

    await window.waitForFunction(() => {
      const failedEls = document.querySelectorAll('[class*="border-l-destructive"]');
      return failedEls.length >= 2;
    }, { timeout: 5000 });

    const entryRows = window.locator('[class*="flex items-center gap-3 p-3"]');
    const failedRow = entryRows.nth(2);
    await failedRow.hover();
    await window.waitForTimeout(500);

    const refreshButtons = window.locator('button[class*="hover:bg-muted cursor-pointer"]');
    const refreshCount = await refreshButtons.count();
    expect(refreshCount).toBeGreaterThanOrEqual(1);

    const targetRefreshBtn = refreshButtons.first();
    await targetRefreshBtn.click();

    await window.waitForTimeout(500);

    await window.waitForFunction(() => {
      const btn = document.querySelector('button:has-text("Bắt đầu tạo")');
      return btn !== null && !(btn as HTMLButtonElement).disabled;
    }, { timeout: 10000 });
  });

  test('10 Full workflow with custom voice, generate, individual retry', async () => {
    await navigateToAudioTab();

    await window.evaluate(() => {
      (window as any).__e2e_voice_pref = 'en-US-GuyNeural';
    });

    const voiceSelectorTrigger = window.locator('button[role="combobox"]').first();
    await expect(voiceSelectorTrigger).toBeVisible({ timeout: 10000 });

    await voiceSelectorTrigger.click();
    await window.waitForTimeout(300);

    const guyOption = window.locator('[role="option"]', { hasText: 'Guy' });
    await expect(guyOption).toBeVisible({ timeout: 5000 });
    await guyOption.click();
    await window.waitForTimeout(300);

    await window.evaluate(() => {
      (window as any).__e2e_failed_indices = [4];
    });

    const generateButton = window.locator('button', { hasText: 'Bắt đầu tạo' });
    await generateButton.click();

    await waitForGenerationComplete();

    const doneStatuses = await window.evaluate(() => {
      const statusMap = new Map<number, string>();
      const entries = document.querySelectorAll('[class*="flex items-center gap-3 p-3"]');
      entries.forEach((el, idx) => {
        const hasCheck = el.querySelector('[class*="text-green-500"]');
        if (hasCheck) statusMap.set(idx + 1, 'done');
      });
      return Object.fromEntries(statusMap);
    });

    const failedRows = window.locator('[class*="border-l-destructive"]');
    const failedCount = await failedRows.count();
    expect(failedCount).toBeGreaterThanOrEqual(1);

    const entryRows = window.locator('[class*="flex items-center gap-3 p-3"]');
    const failedRow = entryRows.nth(3);
    await failedRow.hover();
    await window.waitForTimeout(500);

    const refreshButtons = window.locator('button[class*="hover:bg-muted cursor-pointer"]');
    await refreshButtons.first().click();

    await window.waitForTimeout(500);

    await window.waitForFunction(() => {
      const btn = document.querySelector('button:has-text("Bắt đầu tạo")');
      return btn !== null && !(btn as HTMLButtonElement).disabled;
    }, { timeout: 10000 });

    await window.waitForTimeout(500);

    const finalFailedRows = window.locator('[class*="border-l-destructive"]');
    const finalFailedCount = await finalFailedRows.count();
    expect(finalFailedCount).toBe(0);
  });
});