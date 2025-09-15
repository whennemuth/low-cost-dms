import {  DatabaseMigrationService, DeleteReplicationConfigCommandInput, DescribeReplicationsCommandInput, DescribeReplicationsCommandOutput, MigrationTypeValue, Replication } from "@aws-sdk/client-database-migration-service";

export enum TASK_TYPE {
  START_REPLICATION='start-replication',
  RESUME_PROCESSING='resume-processing',
  RELOAD_TARGET='reload-target'
}

export enum TASK_STATUS {
  CREATED='created', // The task has been created.
  CREATING='creating', // The task is being created.
  STARTING='starting', // The task is starting (initializing resources).
  RUNNING='running', // The task is actively replicating data (CDC or full load).
  STOPPING='stopping', // The task is in the process of stopping.
  STOPPED='stopped', // The task has been stopped (manually or due to an error).
  DELETING='deleting', // The task is being deleted.
  FAILED='failed', // The task encountered an unrecoverable error.
  MODIFYING='modifying', // The task is being modified (e.g., settings updated).
  READY='ready', // The task is ready to start (but not yet running).
  MOVING='moving', // The task is being moved to a different replication instance.
  FAILED_MOVE='failed-move', // The task failed to move to another instance.
}

export enum STOP_REASON {
  NORMAL="NORMAL",
  RECOVERABLE_ERROR="RECOVERABLE_ERROR",
  FATAL_ERROR="FATAL_ERROR",
  FULL_LOAD_ONLY_FINISHED="FULL_LOAD_ONLY_FINISHED",
  STOPPED_AFTER_FULL_LOAD="STOPPED_AFTER_FULL_LOAD",
  STOPPED_AFTER_CACHED_EVENTS="STOPPED_AFTER_CACHED_EVENTS",
  EXPRESS_LICENSE_LIMITS_REACHED="EXPRESS_LICENSE_LIMITS_REACHED",
  STOPPED_AFTER_DDL_APPLY="STOPPED_AFTER_DDL_APPLY",
  STOPPED_DUE_TO_LOW_MEMORY="STOPPED_DUE_TO_LOW_MEMORY",
  STOPPED_DUE_TO_LOW_DISK="STOPPED_DUE_TO_LOW_DISK",
  STOPPED_AT_SERVER_TIME="STOPPED_AT_SERVER_TIME",
  STOPPED_AT_COMMIT_TIME="STOPPED_AT_COMMIT_TIME",
  STOPPED_NORMAL="NORMAL",
  RECONFIGURATION_RESTART="RECONFIGURATION_RESTART",
  RECYCLE_TASK="RECYCLE_TASK"
}

export type ReplicationParms = {
  configArn: string;
  ignoreLastError: boolean;
};

/**
 * Class that performs an SDK lookup for a DMS replication and represents that replication and its current state.
 */
export class DmsReplication {
  private _parms: ReplicationParms;
  private _replication: Replication|undefined;

  private constructor(replication:Replication|undefined, parms: ReplicationParms) {
    this._replication = replication;
    this._parms = parms;
  }

  public get isBusy(): boolean {
    const { status } = this;
    return (
      status === TASK_STATUS.STARTING || 
      status === TASK_STATUS.RUNNING ||
      status === TASK_STATUS.CREATING ||
      status === TASK_STATUS.STOPPING ||
      status === TASK_STATUS.DELETING ||
      status === TASK_STATUS.MODIFYING ||
      status === TASK_STATUS.MOVING
    );
  }

  public get hasFailed(): boolean {
    const { status, _replication: { StopReason } = {}, isBusy } = this;
    if(status === TASK_STATUS.FAILED) return true;
    if(isBusy) return false;
    if(StopReason?.includes(STOP_REASON.FATAL_ERROR)) return true;
    if(StopReason?.includes(STOP_REASON.RECOVERABLE_ERROR)) return true;
    if(StopReason?.includes(STOP_REASON.STOPPED_DUE_TO_LOW_MEMORY)) return true;
    if(StopReason?.includes(STOP_REASON.STOPPED_DUE_TO_LOW_DISK)) return true;
    if(StopReason?.includes(STOP_REASON.EXPRESS_LICENSE_LIMITS_REACHED)) return true;
    if(StopReason?.includes(STOP_REASON.RECONFIGURATION_RESTART)) return true;
    if(StopReason?.includes(STOP_REASON.RECYCLE_TASK)) return true;
    return false;
  };

  public get hasSucceeded(): boolean {
    const { _replication: { StopReason } = {}, isBusy, replicationType, hasFailed, status } = this;
    const { FULL_LOAD, FULL_LOAD_AND_CDC, CDC } = MigrationTypeValue;
    if(hasFailed) return false;
    if(isBusy) return false;
    if(status === TASK_STATUS.STOPPED && replicationType === FULL_LOAD) {
      if(StopReason === STOP_REASON.FULL_LOAD_ONLY_FINISHED) return true;
      if(StopReason?.includes(STOP_REASON.STOPPED_NORMAL)) return true;
    }
    if(status === TASK_STATUS.STOPPED && replicationType === FULL_LOAD_AND_CDC) {
      if(StopReason?.includes(STOP_REASON.FULL_LOAD_ONLY_FINISHED)) return true;
      if(StopReason?.includes(STOP_REASON.STOPPED_AFTER_FULL_LOAD)) return true;
      if(StopReason?.includes(STOP_REASON.STOPPED_AFTER_CACHED_EVENTS)) return true;
      if(StopReason?.includes(STOP_REASON.STOPPED_AT_SERVER_TIME)) return true;
      if(StopReason?.includes(STOP_REASON.STOPPED_AT_COMMIT_TIME)) return true;
      if(StopReason?.includes(STOP_REASON.STOPPED_NORMAL)) return true;
    }
    if(status === TASK_STATUS.STOPPED && replicationType === CDC) {
      if(StopReason?.includes(STOP_REASON.STOPPED_AFTER_CACHED_EVENTS)) return true;
      if(StopReason?.includes(STOP_REASON.STOPPED_AT_SERVER_TIME)) return true;
      if(StopReason?.includes(STOP_REASON.STOPPED_AT_COMMIT_TIME)) return true;
      if(StopReason?.includes(STOP_REASON.STOPPED_NORMAL)) return true;
    }
    return false;
  }

  public get hasNeverRun(): boolean {
    const { status, _replication: { ReplicationStats: { StartDate, StopDate } = {}, StopReason } = {} } = this;
    if(StartDate) return false;
    if(StopDate) return false;
    if(StopReason) return false;
    if(status !== TASK_STATUS.CREATED) {
      console.warn(`Replication status is ${status}, but there is no evidence of ever having run`);
    }
    return true;
  };

  public get isRunning(): boolean {
    const { status } = this;
    return status === TASK_STATUS.RUNNING;
  }

  public get isRunningInFullLoadMode(): boolean {
    const { isRunning, replication: { ReplicationType } = {}, fullLoadProgressPercent } = this;
    const { FULL_LOAD, FULL_LOAD_AND_CDC, CDC } = MigrationTypeValue;
    if( ! isRunning) return false;
    if( ! ReplicationType) return false;
    if( ReplicationType === CDC) return false;
    if( ReplicationType === FULL_LOAD) return true;
    if( ReplicationType === FULL_LOAD_AND_CDC && fullLoadProgressPercent < 100) return true;
    return false;
  }

  public get fullLoadProgressPercent(): number {
    const { replication: { ReplicationStats: { FullLoadProgressPercent=0 } = {} } = {} } = this;
    return FullLoadProgressPercent;
  }

  public get replicationType(): MigrationTypeValue | undefined {
    const { ReplicationType } = this._replication || {};
    return ReplicationType;
  }
  public get status(): TASK_STATUS | undefined {
    const { Status } = this._replication || {};
    return Status as TASK_STATUS | undefined;
  }
  public get arn(): string {
    const { ReplicationConfigArn } = this._replication || {};
    return ReplicationConfigArn as string;
  }
  public get replication(): Replication | undefined {
    return this._replication;
  }
  public get parms(): ReplicationParms {
    return this._parms;
  }
  public get ignoreFailures(): boolean {
    return this._parms.ignoreLastError;
  }
  public get failureMessage(): string {
    const { StopReason='unknown', FailureMessages=[] } = this._replication || {};
    return JSON.stringify({ StopReason, FailureMessages });
  }
  /**
   * Get the time that a replication last stopped.
   * @param replication 
   * @returns 
   */
  public get stoppedTime(): Date | undefined {
    const { replication: { ReplicationLastStopTime, ReplicationStats: { StopDate } = {} } = {} } = this;
    if( ! ReplicationLastStopTime && ! StopDate) return undefined;
    if( ! ReplicationLastStopTime ) return new Date(StopDate!);
    if( ! StopDate ) return new Date(ReplicationLastStopTime);
    const date1 = new Date(StopDate!);
    const date2 = new Date(ReplicationLastStopTime);
    return date1 < date2 ? date1 : date2; // Return the earlier of the two dates (will probably be StopDate)
  }

  /**
   * Stop the replication if it is still running.
   * @returns 
   */
  public stop = async (): Promise<void> => {
    const { arn, isRunning } = this;
    if( ! arn) {
      console.log('No replication ARN found. Cannot stop replication.');
      return;
    }
    if( ! isRunning) {
      console.log('Replication is not running. No need to stop it.');
      return;
    }
    const dms = new DatabaseMigrationService();
    console.log(`Stopping replication ${arn}`);
    await dms.stopReplication({
      ReplicationConfigArn: arn
    });
  }

  /**
   * Wait for the replication to stop, polling every 10 seconds up to maxWaitMinutes.
   * @param maxWaitMinutes 
   * @returns 
   */
  public waitToStop = async (maxWaitMinutes:number=5): Promise<void> => {
    const { arn, refresh } = this;
    const logLastResult = (msg:string) => console.log(`${arn}: ${msg}`);
    const MAX_WAIT_TIME_MS = maxWaitMinutes * 60 * 1000;
    const POLL_INTERVAL_MS = 10 * 1000;
    let timeWaited = 0;
    while(this.isRunning && timeWaited < MAX_WAIT_TIME_MS) {
      console.log(`Waiting up to ${Math.round((MAX_WAIT_TIME_MS - timeWaited)/1000)} more seconds for the replication to stop...`);
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      timeWaited += POLL_INTERVAL_MS;
      await refresh();
    }
    if(this.isRunning) {
      logLastResult(`The replication is still running after waiting ${Math.round(timeWaited/1000)} seconds. Not scheduling a new replication.`);
      return;
    }
    logLastResult(`The replication has now stopped.`);
  }

  /**
   * The only way to delete a serverless replication (including crucially those that remain in a costly 48 hour 
   * provisioned state) is to delete its configuration. It will be recreated later as needed.
   * @param replicationConfigArn 
   */
  public deleteConfiguration = async (): Promise<void> => {
    const dms = new DatabaseMigrationService();
    console.log(`Deleting replication configuration ${this.arn}`);
    await dms.deleteReplicationConfig({
      ReplicationConfigArn: this.arn
    } as DeleteReplicationConfigCommandInput);
  }

  public refresh = async (): Promise<void> => {
    this._replication = (await DmsReplication.getInstance(this._parms)).replication;
  }

  /**
   * Use the SDK to look up the last replication that was based on the specified configuration.
   * @param parms 
   * @returns 
   */
  public static async getInstance(parms: ReplicationParms): Promise<DmsReplication> {
    const { configArn } = parms;
    const dms = new DatabaseMigrationService();

    // Look up the replication config
    let output = await dms.describeReplications({
      Filters: [{ Name: 'replication-config-arn', Values: [ configArn ] }],
    } as DescribeReplicationsCommandInput) as DescribeReplicationsCommandOutput;

    const { Replications = [] } = output || {};

    // Bail out if the lookup failed
    if(!Replications.length) {
      console.log('No replications found');
      return new DmsReplication(undefined, parms);
    }
    return new DmsReplication(Replications[0], parms);
  }
}


const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/Replication.ts')) {

  (async () => {
    const replication = await DmsReplication.getInstance({
      configArn: 'arn:aws:dms:us-east-1:770203350335:replication-config:C6CYM7FEFNAHJPKC6HGHVDUCGE',
      ignoreLastError: true
    });

    if( ! replication) {
      console.log('No replication found');
      return;
    }

    console.log(JSON.stringify(replication!.replication, null, 2));
  })();
}