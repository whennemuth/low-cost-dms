import { MigrationTypeValue, StartReplicationTaskTypeValue } from "@aws-sdk/client-database-migration-service";
import { IContext } from "../../context/IContext";
import { DmsReplication } from "./Replication";
import { getReplicationStartEnvironmentVariables } from "./ReplicationEnvironment";
import { StartReplicationHandlerInput } from "./StartReplicationHandler";
import { PostExecution, ScheduledLambdaInput } from "./timer/DelayedExecution";
import { log } from "./Utils";
import { Cron } from "./Cron";

export type StopReplicationHandlerInput = {
  ReplicationConfigArn: string;
  isSmokeTest?: boolean;
  dryrun?: boolean;
};

/**
 * This handler will delete a serverless replication that was started and ran up to its configured stop time.
 * This replication is not being resumed later because the time between then and now incurs costs due to the
 * fact that the replication, though stopped, remains provisioned. Thus it is deleted here - later it will 
 * be recreated. 
 * @param event 
 */
export const handler = async (event:ScheduledLambdaInput):Promise<any> => {
  const { groupName, scheduleName, lambdaInput } = event;

  try {
    log(event, 'Processing with the following event');

    const { ignoreLastError, active } = getReplicationStartEnvironmentVariables();

    if( ! active) {
      console.log('The lambda is not active. Exiting without action.');
      return;
    }

    const { ReplicationConfigArn } = lambdaInput as StopReplicationHandlerInput;

    if( ! ReplicationConfigArn) {
      throw new Error('ReplicationConfigArn is required');
    }

    // Lookup any replication that matches the configuration to ensure it exists and is in a stopped state.
    const replication = await DmsReplication.getInstance({
      configArn: ReplicationConfigArn, ignoreLastError: ignoreLastError ?? true
    });

    const { 
      hasNeverRun, hasSucceeded, hasFailed, ignoreFailures, failureMessage, deleteConfiguration, replicationType 
    } = replication;

    const logLastResult = (msg:string) => console.log(`${ReplicationConfigArn}: ${msg}`);

    if(hasNeverRun) {
      logLastResult('has never run. Running a full-load replication now.');
      await scheduleFullLoadAndCDC(event);
      return;
    }

    if(hasFailed && ! ignoreFailures) {
      logLastResult(`The last replication failed and not configured to ignore failures. 
        Not scheduling a new replication: failure message: ${failureMessage}`);
      return;
    }

    if(hasFailed) {
      logLastResult(`The last replication failed, but configured to ignore failures. 
        Running a new replication now: failure message: ${failureMessage}`);
      if(replicationType !== MigrationTypeValue.FULL_LOAD_AND_CDC) {
        // Retry the full load all over again.
        await scheduleFullLoadAndCDC(event);
      }
      else {
        // Schedule a CDC replication as normal.
        await scheduleCdcOnly(event, replication);
      }
      return;
    }
    
    if( ! hasSucceeded) {
      // Huh? should never get here, but just in case...
      logLastResult(`The last replication is not in a succeeded state. ${
        JSON.stringify({ Status: replication.status, FailureMessage: failureMessage })
      }`);
      logLastResult('Not scheduling a new replication.');
      return;
    }

    logLastResult(`The last replication succeeded. Running a new replication now.`);
      
    await deleteConfiguration();

    await scheduleCdcOnly(event, replication);
  }
  catch(e:any) {    
    log(e);
  }
  finally {
    // Delete the schedule that triggered this execution.
    await PostExecution().cleanup(scheduleName, groupName);    
  }
};

/**
 * Schedule a full load and CDC replication to run at the next scheduled time.
 * @param event 
 * @returns 
 */
export const scheduleFullLoadAndCDC = async (event:ScheduledLambdaInput): Promise<void> => {
  const { groupName, lambdaInput: { isSmokeTest, dryrun } } = event;
  const suffix = new Date().toISOString().replace(/[\:\.]/g, '-');
  const scheduleName=`start-replication-${suffix}`;
  const { replicationScheduleCronExpression, startReplicationFunctionArn } = getReplicationStartEnvironmentVariables();
  const nextStart = new Cron(replicationScheduleCronExpression!).nextOccurrence;

  if( ! nextStart) {
    console.log('No next occurrence for the configured replication schedule. Not scheduling a new replication.');
    return;
  }

  const input = {
    scheduleName, groupName, lambdaInput: {
      isSmokeTest: isSmokeTest,
      ReplicationType: MigrationTypeValue.FULL_LOAD_AND_CDC,
      StartReplicationType: StartReplicationTaskTypeValue.START_REPLICATION
    } as StartReplicationHandlerInput
  } as ScheduledLambdaInput;

  if(dryrun) {
    console.log(`DRYRUN: startReplicationFunctionArn=${startReplicationFunctionArn}, input:`, JSON.stringify(input, null, 2));
    return;
  }

  
}

/**
 * Schedule a CDC-only replication to run at the next scheduled time.
 * @param event 
 * @param dmsReplication 
 */
export const scheduleCdcOnly = async (event:ScheduledLambdaInput, dmsReplication:DmsReplication): Promise<void> => {
  const { groupName, lambdaInput: { isSmokeTest, dryrun } } = event;
  const {  replication: { CdcStopPosition } = {} } = dmsReplication
  const suffix = new Date().toISOString().replace(/[\:\.]/g, '-');
  const scheduleName=`start-replication-${suffix}`;
  const { replicationScheduleCronExpression } = getReplicationStartEnvironmentVariables();

}



/**
 * TEST HARNESS
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/StopReplicationHandler.ts')) {

  (async () => {
    const context:IContext = await require('../../context/context.json');
    const { 
      stack: { Account, Region, Tags: { Landscape } = {} } = {},
    } = context;

    const prefix = () => `kuali-dms-${Landscape}`;
    const groupName = `${prefix()}-schedules`;
    process.env.START_REPLICATION_FUNCTION_ARN = `arn:aws:lambda:${Region}:${Account}:function:${prefix()}-start-replication-task`;

    const dryrun = true;

    const input = {
      ReplicationConfigArn: 'arn:aws:dms:us-east-1:770203350335:replication-config:C6CYM7FEFNAHJPKC6HGHVDUCGE',
      isSmokeTest: true,
      dryrun
    } as StopReplicationHandlerInput;

    await handler({
      groupName,
      scheduleName: 'test-stop-replication-smoketest',
      lambdaInput: input
    } as ScheduledLambdaInput);
  })();
}