import {Reporter, Suite, TestCase, TestResult, FullResult} from '@playwright/test/reporter';
import {FullConfig} from '@playwright/test';
import TestRail from '@dlenroc/testrail';
require('dotenv').config();

type TestRailTestResult = {
  case_id: number;
  status_id: number;
  comment?: string;
};

class TestRailReporter implements Reporter {
  private testRailApi: TestRail;
  private projectId: number;
  private testCaseResults: Array<TestRailTestResult>;
  private suiteId: number;
  private testPlanName: string;
  private testPlanId: number | null;
  private testRunId: number | null;
  private testRunName: string;
  private testPlanDescription: string;

  constructor() {
    this.projectId = 59;
    this.suiteId = 849;
    this.testRailApi = new TestRail({
      host: this.getTestRailHost(),
      username: this.getTestRailUsername(),
      password: this.getTestRailPassword(),
    });
    this.testCaseResults = [];
    this.testPlanName = `Generated on ${new Date().toLocaleString()} for ${process.env.E2E_TESTS} tests with ${
      process.env.FL_ENV
    } backend`;
    this.testRunId = null;
    this.testPlanId = null;
    this.testRunName = '';
    this.testPlanDescription = `Branch: ${process.env.BRANCH_NAME}`;
  }

  // eslint-disable-next-line require-await
  async onBegin(config: FullConfig, suite: Suite) {
    console.log(`Starting the run with ${suite.allTests().length} tests`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const statusMapping = {
      passed: 1,
      failed: 5,
      timedOut: 5,
      skipped: 3,
    };

// test naming should be like "should add account => 58550 58552" for example.
// in case of multiple suites - naming could be like "should add account => <suite ID> => <case id>"
// in this case suiteIds = titleArray[1].split(' ') and caseIds = titleArray[2].split(' ')

    if (test.title.includes('=>')) {
      const titleArray = test.title.split(' => ');
      const caseIds = titleArray[1].split(' ');
      console.log('caseIds', caseIds);

      if (caseIds != null) {
        caseIds.forEach(caseId => {
          this.testCaseResults.push({
            case_id: Number(caseId),
            status_id: statusMapping[result.status],
            comment: `Test: ${test.title}; Duration: ${result.duration}ms`,
          });
        });
      }
    }
  }

  async onEnd(result: FullResult) {
    console.log(`Finished the run: ${result.status}`);

    // console.log(this.testCaseResults);
    // const configs = await this.testRailApi.getConfigs(this.projectId);
    
    await this.createTestPlan();

    // await this.addEntryToTestPlan(); 

    if (this.testRunId) {
      await this.updateTestResults(this.testRunId);
    }
  //uncomment next string if testRun should be closed
  //  await this.closeTestRun(this.testRunId);
  }

  private async createTestRun() {
    const testRunParams = {
      include_all: true,
      name: this.testRunName,
      case_ids: this.getDistinctTestCaseIds(),
      suite_id: this.suiteId,
    };
    const testRun = await this.testRailApi.addRun(this.projectId, testRunParams);
    console.log(`Created TestRail Test Run id ${testRun.id}`);
    return testRun.id;
  }

  private async createTestPlan() {
    const testPlanParams = {
      entries: [
        {
          suite_id: this.suiteId,
          include_all: true,
          config_ids: [48, 49, 50], //web browsers (Chrome, Edge, Firefox)
          runs: [
            {
              include_all: true,
              config_ids: [48], //Chrome
            },
            {
              include_all: true,
              config_ids: [49], //Edge
            },
            {
              include_all: true,
              config_ids: [50], //Firefox
            },
          ],
        },
      ],
      name: this.testPlanName,
      description: this.testPlanDescription,
    };
    const testPlan = await this.testRailApi.addPlan(this.projectId, testPlanParams);
    console.log(`Created TestRail Test Plan id ${testPlan.id}`);
    this.testPlanId = testPlan.id;
    const chromeRun = testPlan.entries[0].runs.filter(run => run.config === 'Chrome'); // get needed testrun ID for update results
    this.testRunId = chromeRun[0].id;
  }

  // private async addEntryToTestPlan() {
  //   const testRunParams = {
  //     include_all: true,
  //     suite_id: this.suiteId,
  //   };
  //   const testPlan = await this.testRailApi.addPlanEntry(this.testPlanId, testRunParams);
  // }

  private async closeTestRun(testRunId: number) {
    await this.testRailApi.closeRun(testRunId);
  }

  private async updateTestResults(testRunId: number) {
    await this.testRailApi.addResultsForCases(testRunId, {
      results: this.testCaseResults,
    });
  }

  private getDistinctTestCaseIds() {
    return [...new Set(this.testCaseResults.map(result => result.case_id))];
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
}

export default TestRailReporter;
