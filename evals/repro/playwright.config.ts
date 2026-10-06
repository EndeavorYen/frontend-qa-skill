import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// 失敗時的截圖和紀錄放到暫存目錄，不要留在 repo 裡
export default defineConfig({ testDir: '.', outputDir: join(tmpdir(), 'frontend-qa-repro-results'), timeout: 30000, reporter: 'line', use: { headless: true } });
