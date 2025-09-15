import { MigrationTypeValue, StartReplicationTaskTypeValue } from "@aws-sdk/client-database-migration-service";
import { IContext } from "../../context/IContext";
import { Cron } from "./Cron";
import { DmsReplication } from "./Replication";
import { getReplicationStartEnvironmentVariables } from "./ReplicationEnvironment";
import { StartReplicationHandlerInput } from "./StartReplicationHandler";
import { DelayedLambdaExecution, PostExecution, ScheduledLambdaInput } from "./timer/DelayedExecution";
import { EggTimer } from "./timer/EggTimer";
import { getOffsetDate, getShortIsoString, log, TimeUnit } from "./Utils";

export type StopReplicationHandlerInput = {
  ReplicationConfigArn: string;
  isSmokeTest?: boolean;
  restartNow?: boolean;
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
    let replication = await DmsReplication.getInstance({
      configArn: ReplicationConfigArn, ignoreLastError: ignoreLastError ?? true
    });

    const { 
      isRunning, isRunningInFullLoadMode, hasNeverRun, hasFailed, ignoreFailures, failureMessage, 
      deleteConfiguration, replicationType 
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

    // Bail out if the replication is still running in full-load mode..
    if(isRunningInFullLoadMode) {
      const progress = `${replication.fullLoadProgressPercent}%`;
      logLastResult(`The replication is still running in full-load mode (${progress}). Not scheduling a new replication.`);
      return;
    }

    // Attempt to stop the replication
    if(isRunning) {
      logLastResult(`The replication should be stopped by now, but for some reason is still running. Stopping now.`);
      await replication.stop();
      await replication.waitToStop(5); // wait up to 5 minutes for it to stop
      if(isRunning) return; // Still running - bail out (this circumstance will already have been logged).
    }
    
    if( ! replication.hasSucceeded) {
      // Huh? should never get here, probably means the replication is still running...
      logLastResult(`The last replication is not in a succeeded state. ${
        JSON.stringify({ Status: replication.status, FailureMessage: failureMessage })
      }`);
      logLastResult('Not scheduling a new replication.');
      return;
    }

    logLastResult(`The last replication succeeded. Scheduling a new replication now.`);
      
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
  const { FULL_LOAD_AND_CDC} = MigrationTypeValue;
  const { lambdaInput: { isSmokeTest, dryrun, restartNow=false } } = event;
  const { 
    replicationScheduleCronExpression, replicationScheduleCronTimezone, startReplicationFunctionArn 
  } = getReplicationStartEnvironmentVariables();
  let nextStart:Date;

  if(restartNow) {
    console.log(`Overriding the next scheduled start time start immediately - scheduled to start in 15 seconds.`);
    nextStart = getOffsetDate(TimeUnit.SECOND * 15); // 15 seconds from now
  }
  else {
    nextStart = new Cron(replicationScheduleCronExpression!, replicationScheduleCronTimezone!).nextOccurrence;
  }

  if( ! nextStart) {
    console.log(`No next occurrence for the configured replication schedule. Not scheduling a new ${FULL_LOAD_AND_CDC} replication.`);
    return;
  }

  const input = {
    isSmokeTest: isSmokeTest,
    ReplicationType: FULL_LOAD_AND_CDC,
    StartReplicationType: StartReplicationTaskTypeValue.START_REPLICATION
  } as StartReplicationHandlerInput;

  if(dryrun) {
    console.log(`DRYRUN: startReplicationFunctionArn=${startReplicationFunctionArn}, input:`, JSON.stringify(input, null, 2));
    return;
  }

  // Schedule the start of a new replication at the next scheduled time.
  const delayedTestExecution = new DelayedLambdaExecution(startReplicationFunctionArn!, input);
  const timer = new EggTimer(nextStart);
  await delayedTestExecution.startCountdown(timer, 'start-replication');
}

/**
 * Schedule a CDC-only replication to run at the next scheduled time.
 * @param event 
 * @param dmsReplication 
 */
export const scheduleCdcOnly = async (event:ScheduledLambdaInput, dmsReplication:DmsReplication): Promise<void> => {
  const { CDC } = MigrationTypeValue;
  const { lambdaInput: { isSmokeTest, dryrun, restartNow=false } } = event;
  const { stoppedTime, replication: { CdcStopPosition, RecoveryCheckpoint } = {} } = dmsReplication
  const { 
    replicationScheduleCronExpression, replicationScheduleCronTimezone, startReplicationFunctionArn 
  } = getReplicationStartEnvironmentVariables();
  let nextStart:Date;

  if(restartNow) {
    console.log(`Overriding the next scheduled start time start immediately - scheduled to start in 15 seconds.`);
    nextStart = getOffsetDate(TimeUnit.SECOND * 15); // 15 seconds from now
  }
  else {
    nextStart = new Cron(replicationScheduleCronExpression!, replicationScheduleCronTimezone!).nextOccurrence;
  }

  if( ! nextStart) {
    console.log(`No next occurrence for the configured replication schedule. Not scheduling a new ${CDC} replication.`);
    return;
  }

  let CdcStartPosition;

  // Set the CdcStartPosition based on where it was last stopped.
  if(RecoveryCheckpoint) {
    CdcStartPosition = RecoveryCheckpoint;
    console.log(`Using the last known recovery checkpoint as the CdcStartPosition: ${CdcStartPosition}`);
  }
  else if(stoppedTime) {
    // Start from where we left off.
    CdcStartPosition = getShortIsoString(stoppedTime);
    console.log(`Using the stopped time as the CdcStartPosition: ${CdcStartPosition}`);
  }
  else if(CdcStopPosition && CdcStopPosition?.startsWith('server_time:')) {
    // Start from the configured CDC stop time of the last run (Probably would never get here, but just in case...)
    CdcStartPosition = CdcStopPosition.replace('server_time:', '');
    console.log(`Using the last known CdcStopPosition as the CdcStartPosition: ${CdcStartPosition}`);
  }
  else {
    throw new Error('Cannot determine where to start the CDC replication from. No RecoveryCheckpoint, stoppedTime or CdcStopPosition available.');
  }

  // The lambda we are scheduling to run will automatically compute the CdcStopTime but you can override with a custom value here.
  const input = {
    isSmokeTest: isSmokeTest,
    ReplicationType: CDC,
    StartReplicationType: StartReplicationTaskTypeValue.START_REPLICATION,
    CdcStartPosition,
  } satisfies StartReplicationHandlerInput;

  if(dryrun) {
    console.log(`DRYRUN: startReplicationFunctionArn=${startReplicationFunctionArn}, input:`, JSON.stringify(input, null, 2));
    return;
  }

  // Schedule the start of a new replication at the next scheduled time.
  const delayedTestExecution = new DelayedLambdaExecution(startReplicationFunctionArn!, input);
  const timer = new EggTimer(nextStart);
  await delayedTestExecution.startCountdown(timer, 'start-replication');
}



/**
 * TEST HARNESS
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/StopReplicationHandler.ts')) {

  (async () => {
    const context:IContext = await require('../../context/context.json');
    const { 
      stack: { Account, Region, Tags: { Landscape } = {}, Id } = {},
      scheduledRunRetryOnFailure=false,
      replicationScheduleCronExpression, replicationScheduleCronTimezone

    } = context;

    const prefix = () => `$${Id}-${Landscape}`;
    const groupName = `${prefix()}-schedules`;
    process.env.ACTIVE = 'true';
    process.env.PREFIX = `${prefix()}`;
    process.env.ACCOUNT = `${Account}`;
    process.env.START_REPLICATION_FUNCTION_ARN = `arn:aws:lambda:${Region}:${Account}:function:${prefix()}-start-replication-task`;
    process.env.IGNORE_LAST_ERROR = scheduledRunRetryOnFailure ? 'true' : 'false';
    process.env.REPLICATION_SCHEDULE_CRON_EXPRESSION = replicationScheduleCronExpression;
    process.env.REPLICATION_SCHEDULE_CRON_TIMEZONE = replicationScheduleCronTimezone;

    const dryrun = false;

    const input = {
      ReplicationConfigArn: 'arn:aws:dms:us-east-1:770203350335:replication-config:kuali-dms-stg2-1758691549293',
      isSmokeTest: true,
      restartNow: true,
      dryrun
    } as StopReplicationHandlerInput;

    await handler({
      groupName,
      scheduleName: 'test-stop-replication-smoketest',
      lambdaInput: input
    } as ScheduledLambdaInput);
  })();
}