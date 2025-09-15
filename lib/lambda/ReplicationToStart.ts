import { DatabaseMigrationService, MigrationTypeValue, StartReplicationCommandInput, StartReplicationTaskTypeValue } from "@aws-sdk/client-database-migration-service";
import { DelayedLambdaExecution, ScheduledLambdaInput } from "./timer/DelayedExecution";
import { getReplicationStartEnvironmentVariables, ReplicationStartEnvironmentVariables } from "./ReplicationEnvironment";
import { EggTimer } from "./timer/EggTimer";
import { StopReplicationHandlerInput } from "./StopReplicationHandler";
import { asServerTimestamp, getOffsetDate, getPastDateString, lookupReplicationConfigType, TimeUnit } from "./Utils";
import { IContext } from "../../context/IContext";

export type ReplicationToStartBuildParms = {
  suffix?: string;
  isSmokeTest: boolean;
  startEnvironmentVariables?: ReplicationStartEnvironmentVariables
};

export type ReplicationToStartRunParms = {
  ReplicationConfigArn: string;
  CdcStartPosition?: string;
  CdcStopPosition?: string;
  StartReplicationType: StartReplicationTaskTypeValue;
  groupName?: string;
  scheduleName?: string;
  dryrun?: boolean;
}

export class ReplicationToStart {
  private buildParms: ReplicationStartEnvironmentVariables;
  private isSmokeTest: boolean;
  private _suffix: string;
  private _CdcStopTime: Date;
  private _CdcStopPosition: string;
  private _groupName: string;
  private _scheduleName: string;

  constructor(parms:ReplicationToStartBuildParms) {
    const { suffix, startEnvironmentVariables, isSmokeTest } = parms;
    this._suffix = suffix ?? new Date().toISOString().replace(/[\:\.]/g, '-');
    this.buildParms = startEnvironmentVariables ?? getReplicationStartEnvironmentVariables();
    this.isSmokeTest = isSmokeTest;
    if( ! this.buildParms.isValid()) {
      throw new Error('Invalid replication start environment variables');
    }
  }

  public start = async (runParms: ReplicationToStartRunParms): Promise<void> => {
    const dms = new DatabaseMigrationService();
    const { 
      dryrun=false, CdcStartPosition, CdcStopPosition, StartReplicationType, ReplicationConfigArn 
    } = runParms;

    if( ! ReplicationConfigArn) {
      throw new Error('No ReplicationConfigArn specified to start replication');
    }

    const ReplicationType = await lookupReplicationConfigType(ReplicationConfigArn);

    // Cannot start a CDC replication without knowing when to start from
    if(ReplicationType === MigrationTypeValue.CDC && ! CdcStartPosition) {
      throw new Error('No CdcStartPosition specified to start a CDC replication');
    }

    // Cannot start a replication that involves CDC without knowing when to stop it (we don't leave them running indefinitely)
    if(ReplicationType !== MigrationTypeValue.FULL_LOAD && ! CdcStopPosition) {
      throw new Error('No CdcStopPosition specified to start a CDC or FullLoadAndCdc replication');
    }

    if(CdcStopPosition && CdcStopPosition?.startsWith('server_time:')) {
      this._CdcStopTime = new Date(CdcStopPosition.replace('server_time:', ''));
      this._CdcStopPosition = asServerTimestamp(CdcStopPosition);
    }
    else if(CdcStopPosition && CdcStopPosition?.startsWith('checkpoint:')) {
      this._CdcStopPosition = CdcStopPosition;
    }

    const input = { ReplicationConfigArn, StartReplicationType } as StartReplicationCommandInput

    if(ReplicationType !== MigrationTypeValue.FULL_LOAD) {
      input.CdcStopPosition = this._CdcStopPosition;
    }

    if(ReplicationType === MigrationTypeValue.CDC) {
      input.CdcStartPosition = CdcStartPosition!;
    }

    console.log('Starting replication with settings:', JSON.stringify(input, null, 2));

    if(dryrun) {
      console.log('DRYRUN: skipping execution');
      return;
    }

    await dms.startReplication(input);
  }

  /**
   * Create a delayed execution that targets a lambda that will delete the replication started above.
   * It should be in a stopped state by the time this runs.
   * @param ReplicationConfigArn 
   */
  public scheduleDeletion = async (runParms: ReplicationToStartRunParms): Promise<void> => {
    const { 
      suffix, isSmokeTest, CdcStopTime, buildParms: { 
        prefix, stopReplicationFunctionArn 
      } 
    } = this;
    const { 
      ReplicationConfigArn, dryrun=false,
      groupName=`${prefix}-schedules`, scheduleName=`stop-replication-${suffix}` 
    } = runParms;

    const input = {
      scheduleName, groupName, lambdaInput: {
        ReplicationConfigArn,
        isSmokeTest
      } as StopReplicationHandlerInput
    } as ScheduledLambdaInput;

    if(dryrun) {
      console.log(`DRYRUN: stopReplicationFunctionArn=${stopReplicationFunctionArn}, input:`, JSON.stringify(input, null, 2));
      return;
    }

    const delayedTestExecution = new DelayedLambdaExecution(stopReplicationFunctionArn!, input);
    const FIVE_MINUTES = 5 * 60 * 1000;
    // Set the timer to go off 5 minutes after the replication is scheduled to stop.
    const timer = new EggTimer(new Date(new Date(CdcStopTime).getTime() + FIVE_MINUTES));
    await delayedTestExecution.startCountdown(timer, 'delete-replication');
  }

  public get suffix() {
    return this._suffix;
  }
  public get CdcStopTime() {
    return this._CdcStopTime;
  }
  public get CdcStopPosition() {
    return this._CdcStopPosition;
  }
  public get groupName() {
    return this._groupName;
  }
  public get scheduleName() {
    return this._scheduleName;
  }
  public get validStartEnvironmentVariables(): boolean {
    return this.buildParms.isValid();
  }
}




/**
 * TEST HARNESS
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/ReplicationToStart.ts')) {

  (async () => {
    const context:IContext = await require('../../context/context.json');
    const { 
      stack: { Account, Region, Tags: { Landscape } = {} } = {},
      scheduledRunRetryOnFailure=false,
      replicationScheduleCronExpression='0 0 2 * * *',
    } = context;

    const prefix = () => `kuali-dms-${Landscape}`;
  
    // const CdcStartPosition = 'checkpoint:V1#48084#0000000243BC3342010000010005548D0000019F001000000000000243BC332D#0#0#*#0#31989';
    const CdcStartPosition = getPastDateString(5, TimeUnit.MINUTE);
    const CdcStartTime = undefined;
    const CdcStopPosition = asServerTimestamp(getOffsetDate(5 * TimeUnit.MINUTE));
    // const CdcStopPosition = asServerTimestamp(getOffsetDate(2 * TimeUnit.HOUR));
    const dryrun = true;
    

    // Needed to start the replication config, schedule its stop, and cleanup
    process.env.PREFIX = `${prefix()}`;
    process.env.IGNORE_LAST_ERROR = scheduledRunRetryOnFailure ? 'true' : 'false';
    process.env.STOP_REPLICATION_FUNCTION_ARN = `arn:aws:lambda:${Region}:${Account}:function:${prefix()}-stop-replication-task`;
    process.env.REPLICATION_SCHEDULE_CRON_EXPRESSION = `${replicationScheduleCronExpression}`;

    await new ReplicationToStart({ isSmokeTest: true })
      .start({
        dryrun,
        ReplicationConfigArn: 'arn:aws:dms:us-east-1:770203350335:replication-config:C6CYM7FEFNAHJPKC6HGHVDUCGE',
        // CdcStartPosition,
        CdcStopPosition,
        StartReplicationType: StartReplicationTaskTypeValue.START_REPLICATION,
     } as ReplicationToStartRunParms);

    console.log('Done');
  })();
}
