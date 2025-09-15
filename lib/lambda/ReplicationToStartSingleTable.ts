import { AbstractReplicationToStart, runTestHarness } from "./AbstractReplicationToStart";
import { getReplicationStartEnvironmentVariables, ReplicationStartEnvironmentVariables } from "./ReplicationEnvironment";
import { getOffsetDate, TimeUnit } from "./Utils";

/**
 * A smoke test involves only one small table, so a full load or catch-up CDC should never be more than
 * 40 minutes to provision and 5 minutes to run to completion (45 min total). It can be less time than that 
 * if computed resources are small and make for a briefer provisioning period (but 40 minutes is the 
 * max time provisioning can take according to AWS documentation).
 */
export class ReplicationToStartSingleTable extends AbstractReplicationToStart {

  public static MAX_DURATION_MINUTES = 35;

  constructor(startEnvironmentVariables?: ReplicationStartEnvironmentVariables) {
    super(startEnvironmentVariables);
  }

  public get isSmokeTest(): boolean {
    return true;
  }

  /**
   * Get the reduced CdcStopTime for smoke test runs.
   * @param replicationType 
   * @returns 
   */
  public getCdcStopTime = (): Date => {
    let cdcStopTime: Date | undefined;

    // Check for an overriding custom duration first, and base the CdcStopTime on that if specified.
    if(this.customCdcStopTime) {
      return this.customCdcStopTime;
    }

    // Fall back to the default CdcStopTime
    cdcStopTime = this.configuredCdcStopTime;
    const { MAX_DURATION_MINUTES} = ReplicationToStartSingleTable;
    const minutesFromNow = Math.round((cdcStopTime.getTime() - (new Date()).getTime()) / 60000);

    // Reduce the duration of the default CdcStopTime if it exceeds the max for smoke tests
    if(minutesFromNow > MAX_DURATION_MINUTES) {
      console.log(`Smoke test run. Overriding the CdcStopTime to be ${MAX_DURATION_MINUTES} minutes from now at ${cdcStopTime}`);
      cdcStopTime = getOffsetDate(TimeUnit.MINUTE * MAX_DURATION_MINUTES);
    }

    // Return the default CdcStopTime.
    return cdcStopTime;
  }
}




/**
 * TEST HARNESS
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/ReplicationToStartSingleTable.ts')) {

  (async () => {
    await runTestHarness({
      replicationToStart: new ReplicationToStartSingleTable(),
      ReplicationConfigArn: 'arn:aws:dms:us-east-1:770203350335:replication-config:C6CYM7FEFNAHJPKC6HGHVDUCGE',
      customDurationMinutes: undefined,
      dryrun: true
    })
  })();
}