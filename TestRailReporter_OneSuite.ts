import {Reporter, Suite, TestCase, TestResult, FullResult} from '@playwright/test/reporter';
import {FullConfig} from '@playwright/test';
import TestRail from '@dlenroc/testrail';
require('dotenv').config();

type TestRailReporterOptions = {
  host: string;
  projectId: number;
  username: string;
  password: string;
  testRunName?: string;
};

type TestRailTestResult = {
  case_id: number;
  status_id: number;
  comment?: string;
};

class TestRailReporter implements Reporter {
  private testRailApi: TestRail;
  private projectId: number;
  private testRunName: string;
  private testCaseResults: Array<TestRailTestResult>;
  private suiteId: number;

  constructor() {
    this.projectId = 59;
    this.suiteId = 657;
    this.testRailApi = new TestRail({
      host: this.getTestRailHost(),
      username: this.getTestRailUsername(),
      password: this.getTestRailPassword(),
    });
    this.testCaseResults = [];
    this.testRunName = 'Test Run generated from Playwright Framework';
  }

  async onBegin(config: FullConfig, suite: Suite) {
    console.log(`Starting the run with ${suite.allTests().length} tests`);
    try {
      await this.validateProjectId();
      //await this.validateSingleRepositoryProject();
    } catch (error) {
      console.error(error);
      process.exit(-1);
    }
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const [, projectName] = test.titlePath();

    const statusMapping = {
      passed: 1,
      failed: 5,
      timedOut: 5,
      skipped: 3,
    };

    const caseIds = test.annotations
      .filter(annotation => annotation.type === 'testRailId')
      .map(annotation => parseInt(annotation.description || ''));
    caseIds.forEach(caseId => {
      this.testCaseResults.push({
        case_id: caseId,
        status_id: statusMapping[result.status],
        comment: `PlayWright Project Name: ${projectName}; Duration: ${result.duration}ms`,
      });
    });
  }

  async onEnd(result: FullResult) {
    console.log(`Finished the run: ${result.status}`);

    //console.log(this.testCaseResults);
    try {
      const testRunId = await this.createTestRun();
      await this.updateTestResults(testRunId);
      await this.closeTestRun(testRunId);
    } catch (error) {
      console.log(error);
      process.exit(-1);
    }
  }

  private async validateProjectId() {
    const project = await this.testRailApi.getProject(this.projectId);
    console.info(`Current TestRail Project is ${project.name}`);
  }

  private async validateSingleRepositoryProject() {
    const suites = await this.testRailApi.getSuites(this.projectId);
    if (suites.length > 1) {
      throw new Error('TestRail project is not configured as Single Repository (single Suite)');
    }
    console.debug('TestRail Project is Single Repository.');
  }

  private async createTestRun() {
    const testRunParams = {
      include_all: false,
      name: this.testRunName,
      case_ids: this.getDistinctTestCaseIds(),
      suite_id: this.suiteId,
    };
    const testRun = await this.testRailApi.addRun(this.projectId, testRunParams);
    console.log(`Created TestRail Test Run id ${testRun.id}`);
    return testRun.id;
  }

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
    throw new Error(
      'TestRail host has not been defined in TESTRAIL_USERNAME environment variable or TestRail Reporter Configuration.',
    );
  }
  private getTestRailUsername(): string {
    if (process.env.TESTRAIL_USERNAME) {
      return process.env.TESTRAIL_USERNAME;
    }
    throw new Error(
      'TestRail username has not been defined in TESTRAIL_USERNAME environment variable or TestRail Reporter Configuration.',
    );
  }

  private getTestRailPassword(): string {
    if (process.env.TESTRAIL_PASSWORD) {
      return process.env.TESTRAIL_PASSWORD;
    }
    throw new Error(
      'TestRail Password/ApiKey has not been defined in TESTRAIL_PASSWORD environment variable or TestRail Reporter Configuration.',
    );
  }
}

export default TestRailReporter;
