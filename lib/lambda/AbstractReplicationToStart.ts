import { DatabaseMigrationService, MigrationTypeValue, StartReplicationCommandInput, StartReplicationTaskTypeValue } from "@aws-sdk/client-database-migration-service";
import { IContext } from "../../context/IContext";
import { getReplicationStartEnvironmentVariables, ReplicationStartEnvironmentVariables } from "./ReplicationEnvironment";
import { StopReplicationHandlerInput } from "./StopReplicationHandler";
import { DelayedLambdaExecution } from "./timer/DelayedExecution";
import { EggTimer } from "./timer/EggTimer";
import { asServerTimestamp, getOffsetDate, getPastDateString, lookupReplicationConfigType, TimeUnit } from "./Utils";

export type ReplicationToStartRunParms = {
  ReplicationConfigArn: string;
  CdcStartPosition?: string;
  CdcStopTime?: string;
  customDurationMinutes?: number;
  StartReplicationType: StartReplicationTaskTypeValue;
  groupName?: string;
  scheduleName?: string;
  dryrun?: boolean;
}

export abstract class AbstractReplicationToStart {
  private _startEnvVars: ReplicationStartEnvironmentVariables;
  private _replicationType: MigrationTypeValue;
  private _CdcStopTime: Date;
  private _customDurationMinutes?: number;
  private _groupName: string;
  private _scheduleName: string;

  constructor(startEnvironmentVariables?: ReplicationStartEnvironmentVariables) {
    this._startEnvVars = startEnvironmentVariables ?? getReplicationStartEnvironmentVariables();
  }

  /**
   * Start the replication process.
   * SEE: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/database-migration-service/command/StartReplicationCommand/
   * @param runParms 
   * @returns 
   */
  public start = async (runParms: ReplicationToStartRunParms): Promise<void> => {
    if( ! this._startEnvVars.isValid()) {
      throw new Error('Invalid replication start environment variables');
    }
    const dms = new DatabaseMigrationService();
    const { 
      dryrun=false, CdcStartPosition, CdcStopTime:customCdcStopTime, StartReplicationType, 
      ReplicationConfigArn, customDurationMinutes
    } = runParms;

    if( ! ReplicationConfigArn) {
      throw new Error('No ReplicationConfigArn specified to start replication');
    }

    this._replicationType = await lookupReplicationConfigType(ReplicationConfigArn);

    // Cannot start a CDC replication without knowing when to start from
    if(this._replicationType === MigrationTypeValue.CDC && ! CdcStartPosition) {
      throw new Error('No CdcStartPosition specified to start a CDC replication');
    }

    if(customCdcStopTime) {
      this._CdcStopTime = new Date(customCdcStopTime);
    }
    if(customDurationMinutes && customDurationMinutes > 0) {
      this._customDurationMinutes = customDurationMinutes;
    }

    // Cannot start a replication that involves CDC without knowing when to stop it (we don't leave them running indefinitely)
    if(this._replicationType !== MigrationTypeValue.FULL_LOAD && ! this.CdcStopTime) {
      throw new Error('No CdcStopTime specified to start a CDC or FullLoadAndCdc replication');
    }

    const input = { ReplicationConfigArn, StartReplicationType } as StartReplicationCommandInput

    if(this._replicationType !== MigrationTypeValue.FULL_LOAD) {
      input.CdcStopPosition = this.CdcStopPosition;
      input.CdcStartPosition = CdcStartPosition!;
    }

    if(dryrun) {
      console.log('DRYRUN: replication with settings: ', JSON.stringify(input, null, 2));
      return;
    }

    console.log('Starting replication with settings: ', JSON.stringify(input, null, 2));

    // Start the replication 
    await dms.startReplication(input);
  }

  /**
   * Create a delayed execution that targets a lambda that will delete the replication started above.
   * It should be in a stopped state by the time this runs.
   * @param ReplicationConfigArn 
   */
  public scheduleDeletion = async (runParms: ReplicationToStartRunParms): Promise<void> => {
    const { isSmokeTest, CdcStopTime, _startEnvVars: { prefix, stopReplicationFunctionArn } } = this;
    const { ReplicationConfigArn, dryrun=false } = runParms;

    const input = { ReplicationConfigArn, isSmokeTest } as StopReplicationHandlerInput;

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

  public abstract get isSmokeTest(): boolean;

  public abstract getCdcStopTime(): Date;

  public set startEnvVars(envVars: ReplicationStartEnvironmentVariables) {
    this._startEnvVars = envVars;
  }

  /**
   * The default CdcStopTime is based on the current time plus the configured duration for the type of replication.
   */
  get configuredCdcStopTime(): Date {
    let cdcStopTime:Date|undefined;
    const { 
      REPLICATION_DURATION_FOR_FULL_LOAD_MINUTES, REPLICATION_DURATION_FOR_CDC_MINUTES
    } = process.env;
    let minutesToAdd = 0;

    switch(this._replicationType) {
      case MigrationTypeValue.CDC:
        minutesToAdd = parseInt(REPLICATION_DURATION_FOR_CDC_MINUTES!);
        cdcStopTime = getOffsetDate(TimeUnit.MINUTE * minutesToAdd);
        break;
      case MigrationTypeValue.FULL_LOAD_AND_CDC:
        minutesToAdd = parseInt(REPLICATION_DURATION_FOR_FULL_LOAD_MINUTES!);
        cdcStopTime = getOffsetDate(TimeUnit.MINUTE * minutesToAdd);
        break;
    }
    return cdcStopTime ?? new Date();
  }

  public get CdcStopTime() {
    const { _CdcStopTime, getCdcStopTime } = this;
    return _CdcStopTime ?? getCdcStopTime();
  }
  public get CdcStopPosition() {
    return asServerTimestamp(this.CdcStopTime);
  }
  public get groupName() {
    return this._groupName;
  }
  public get scheduleName() {
    return this._scheduleName;
  }
  public get validStartEnvironmentVariables(): boolean {
    return this._startEnvVars.isValid();
  }
  public get replicationType() {
    return this._replicationType;
  }
  public get customDurationMinutes() {
    return this._customDurationMinutes;
  }
  public get customCdcStopTime(): Date | undefined {
    if(this.customDurationMinutes && this.customDurationMinutes > 0) {
      const cdcStopTime = getOffsetDate(TimeUnit.MINUTE * this.customDurationMinutes);
      console.log(`Custom duration of ${this.customDurationMinutes} minutes specified. Setting CdcStopTime to ${cdcStopTime}`);
      return cdcStopTime;
    }
    return undefined;
  }
}

export type TestHarnessParms = {
  replicationToStart: AbstractReplicationToStart;
  ReplicationConfigArn: string;
  customDurationMinutes?: number;
  dryrun?: boolean;
};

export const runTestHarness = async (params: TestHarnessParms) => {
  let { replicationToStart, ReplicationConfigArn, customDurationMinutes, dryrun=true } = params;
  const context:IContext = await require('../../context/context.json');
  const { 
    stack: { Account, Region, Tags: { Landscape } = {}, Id } = {},
    scheduledRunRetryOnFailure=false, 
    replicationScheduleCronExpression,
  } = context;

  const prefix = () => `$${Id}-${Landscape}`;

  // const CdcStartPosition = 'checkpoint:V1#48084#0000000243BC3342010000010005548D0000019F001000000000000243BC332D#0#0#*#0#31989';
  const CdcStartPosition = getPastDateString(5, TimeUnit.MINUTE);
  const CdcStartTime = undefined;
  let CdcStopTime = getOffsetDate(5 * TimeUnit.MINUTE).toISOString();
  // CdcStopTime = getOffsetDate(2 * TimeUnit.HOUR);
  // customDurationMinutes = 180;
  

  // Needed to start the replication config, schedule its stop, and cleanup
  process.env.PREFIX = `${prefix()}`;
  process.env.IGNORE_LAST_ERROR = scheduledRunRetryOnFailure ? 'true' : 'false';
  process.env.STOP_REPLICATION_FUNCTION_ARN = `arn:aws:lambda:${Region}:${Account}:function:${prefix()}-stop-replication-task`;
  process.env.REPLICATION_SCHEDULE_CRON_EXPRESSION = `${replicationScheduleCronExpression}`;

  replicationToStart.startEnvVars = getReplicationStartEnvironmentVariables();

  await replicationToStart.start({
    dryrun,
    ReplicationConfigArn,
    // CdcStartPosition,
    CdcStopTime,
    customDurationMinutes,
    StartReplicationType: StartReplicationTaskTypeValue.START_REPLICATION,
  } satisfies ReplicationToStartRunParms);

  console.log('Done');
}

