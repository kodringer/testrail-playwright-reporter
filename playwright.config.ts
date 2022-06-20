import {PlaywrightTestConfig} from '@playwright/test';
require('dotenv').config();

// for push results from github on purpose
const localReporter: typeof config.reporter = [[process.env.CI ? 'github' : 'list']];
if (process.env.TESTRAIL_REPORT === 'true') {
  localReporter.push(['./reporter.testrail.ts']);
}

const config: PlaywrightTestConfig = {
  projects: [
    {
      name: 'Chrome Stable',
      use: {
        browserName: 'chromium',
        channel: 'chrome',
        headless: false,
        viewport: {width: 1280, height: 800},
      },
    },
  ],
  timeout: 2 * 60 * 1000,
  retries: 1,
  workers: 1,
  reporter: localReporter,
};

export default config;
