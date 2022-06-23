import {Reporter, Suite, FullResult} from '@playwright/test/reporter';
import {FullConfig} from '@playwright/test';
import TestRail, {ConfigItem} from '@dlenroc/testrail';
import config from './playwright.config';
require('dotenv').config();

type TestRailTestResult = {
  case_id: number;
  status_id: number;
  comment?: string;
};
type TTestCaseResult = {
  browser: string;
  results: TestRailTestResult[];
};

// TestRail IDs
const PROJECT_ID = 59;
const DEFAULT_SUITE_ID = 849;
const STATUS_MAPPING = {
  passed: 1,
  failed: 5,
  timedOut: 5,
  skipped: 3,
};
const BROWSERS: string[] = [];
class TestRailReporter implements Reporter {
  private testRailApi: TestRail;
  private readonly projectId: number;
  private suiteId: number | null;
  private readonly testPlanName: string;
  private readonly testPlanDescription: string;
  private browserConfigList: ConfigItem[];
  private testPlan: TestRail.Plan | null;
  private suiteList: Suite[];
  private testCaseResultList: TTestCaseResult[];

  constructor() {
    this.projectId = PROJECT_ID;
    this.suiteId = null;
    this.testRailApi = new TestRail({
      host: this.getTestRailHost(),
      username: this.getTestRailUsername(),
      password: this.getTestRailPassword(),
    });
    this.testCaseResultList = [];
    this.testPlanName = `Generated on ${new Date().toLocaleString()} for ${process.env.E2E_TESTS} tests with ${
      process.env.FL_ENV
    } backend`;
    this.testPlanDescription = `Branch: ${process.env.BRANCH_NAME}`;
    this.browserConfigList = [];
    this.testPlan = null;
    this.suiteList = [];
  }

  async onBegin(config: FullConfig, suite: Suite) {
    this.getBrowsers();
    console.log(`Starting the run with ${suite.allTests().length} tests`);
    this.suiteList = suite.suites;

    const configList = await this.testRailApi.getConfigs(this.projectId);
    const browserConfig = configList.filter(config => config.name.toLowerCase().includes('web browsers'));

    if (browserConfig && browserConfig.length) {
      this.browserConfigList = browserConfig[0].configs;
    }
  }

  async onEnd(result: FullResult) {
    console.log(`Finished the run: ${result.status}`);

    BROWSERS.forEach(browserName => {
      this.testCaseResultList.push({
        browser: browserName,
        results: this.getBrowserResults(browserName),
      });
    });

    // eslint-disable-next-line no-unused-expressions
    process.env.TESTRAIL_PLAN_ID ? await this.useTestPlan() : await this.createTestPlan();

    for (const suite of this.suiteList) {
      if (!this.testPlan) {
        continue;
      }

      const testRun = this.testPlan.entries[0].runs.filter(run => run.config?.toLowerCase() === suite.title);
      const testResult = this.testCaseResultList.find(result => result.browser === suite.title);

      if (testRun[0].id && testResult) {
        await this.updateTestResults(testRun[0].id, testResult.results);
      }
    }
  }

  private async createTestPlan() {
    await this.getSuiteId();

    const chromeId = Number(this.browserConfigList.filter(browser => browser.name.toLowerCase() === 'chrome')[0].id);
    const edgeId = Number(this.browserConfigList.filter(browser => browser.name.toLowerCase() === 'edge')[0].id);
    const firefoxId = Number(this.browserConfigList.filter(browser => browser.name.toLowerCase() === 'firefox')[0].id);

    const testPlanParams = {
      entries: [
        {
          suite_id: Number(this.suiteId),
          include_all: true,
          config_ids: [chromeId, edgeId, firefoxId],
          runs: [
            {
              include_all: true,
              config_ids: [chromeId],
            },
            {
              include_all: true,
              config_ids: [edgeId],
            },
            {
              include_all: true,
              config_ids: [firefoxId],
            },
          ],
        },
      ],
      name: this.testPlanName,
      description: this.testPlanDescription,
    };

    this.testPlan = await this.testRailApi.addPlan(this.projectId, testPlanParams);
    console.log(`Created TestRail Test Plan id ${this.testPlan.id}`);
  }

  private async useTestPlan() {
    this.testPlan = await this.testRailApi.getPlan(Number(process.env.TESTRAIL_PLAN_ID));
    console.log('Using existed testplan. ID:', process.env.TESTRAIL_PLAN_ID);
  }

  private async updateTestResults(id: number, list: TestRailTestResult[]) {
    await this.testRailApi.addResultsForCases(id, {
      results: list,
    });
  }

  private getTestRailHost(): string {
    if (process.env.TESTRAIL_HOST) {
      return process.env.TESTRAIL_HOST;
    }
    throw new Error('TestRail host has not been defined in TESTRAIL_USERNAME environment variable.');
  }

  private getTestRailUsername(): string {
    if (process.env.TESTRAIL_USERNAME) {
      return process.env.TESTRAIL_USERNAME;
    }
    throw new Error('TestRail username has not been defined in TESTRAIL_USERNAME environment variable.');
  }

  private getTestRailPassword(): string {
    if (process.env.TESTRAIL_PASSWORD) {
      return process.env.TESTRAIL_PASSWORD;
    }
    throw new Error('TestRail Password/ApiKey has not been defined in TESTRAIL_PASSWORD environment variable.');
  }

  private async getSuiteId() {
    if (!this.suiteId) {
      const suites = await this.testRailApi.getSuites(this.projectId);
      const suite = suites.filter(suite => suite.name === 'Regression suite');

      if (!suite || !suite.length) {
        console.log('Couldn`t get Suite ID from Testrail');
        return DEFAULT_SUITE_ID;
      }

      this.suiteId = Number(suite[0].id);
      console.log('Suite ID:', this.suiteId);
    }

    return this.suiteId;
  }

  private getBrowserResults(browserName: string) {
    const resultList: TestRailTestResult[] = [];

    this.suiteList.forEach(async suite => {
      if (suite.title === browserName) {
        await suite.allTests().forEach(test => {
          if (test.title.includes('=>')) {
            const titleArray = test.title.split(' => ');
            const caseIds = titleArray[1].split(' ');

            test.results.forEach(result => {
              if (caseIds != null) {
                caseIds.forEach(caseId => {
                  resultList.push({
                    case_id: Number(caseId),
                    status_id: STATUS_MAPPING[result.status],
                    comment: `Test: ${test.title}; Duration: ${result.duration}ms`,
                  });
                });
              }
            });
          }
        });
      }
    });

    return resultList;
  }

  private getBrowsers() {
    config.projects?.forEach(item => {
      BROWSERS.push(item.name!);
    });
  }
}

export default TestRailReporter;
