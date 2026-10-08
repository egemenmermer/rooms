import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/desktop',workers:1,timeout:60000,reporter:'list',use:{trace:'off',screenshot:'off',video:'off'}});
