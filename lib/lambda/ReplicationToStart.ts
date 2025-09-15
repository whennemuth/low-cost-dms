import { AbstractReplicationToStart, runTestHarness } from "./AbstractReplicationToStart";
import { getReplicationStartEnvironmentVariables, ReplicationStartEnvironmentVariables } from "./ReplicationEnvironment";

export class ReplicationToStart extends AbstractReplicationToStart {

  constructor(startEnvironmentVariables?: ReplicationStartEnvironmentVariables) {
    super(startEnvironmentVariables);
  }

  public get isSmokeTest(): boolean {
    return false;
  }

  public getCdcStopTime = (): Date => {
    // Check for an overriding custom duration first, and base the CdcStopTime on that if specified.
    if(this.customCdcStopTime) {
      return this.customCdcStopTime;
    }
    return this.configuredCdcStopTime;
  }
}




/**
 * TEST HARNESS
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/ReplicationToStart.ts')) {

  (async () => {
    await runTestHarness({
      replicationToStart: new ReplicationToStart(getReplicationStartEnvironmentVariables()),
      ReplicationConfigArn: 'arn:aws:dms:us-east-1:770203350335:replication-config:C6CYM7FEFNAHJPKC6HGHVDUCGE',
      customDurationMinutes: undefined,
      dryrun: true
    })
  })();
}
