import { MigrationTypeValue, StartReplicationTaskTypeValue } from "@aws-sdk/client-database-migration-service";
import { IContext } from "../../context/IContext";
import { AbstractReplicationToCreate } from "./AbstractReplicationToCreate";
import { AbstractReplicationToStart, ReplicationToStartRunParms } from "./AbstractReplicationToStart";
import { getReplicationCreateEnvironmentVariables, getReplicationStartEnvironmentVariables } from "./ReplicationEnvironment";
import { ReplicationToCreate } from "./ReplicationToCreate";
import { ReplicationToCreateSingleTable } from "./ReplicationToCreateSingleTable";
import { ReplicationToStart } from "./ReplicationToStart";
import { ReplicationToStartSingleTable } from "./ReplicationToStartSingleTable";
import { PostExecution, ScheduledLambdaInput } from "./timer/DelayedExecution";
import { getShortIsoString, log, lookupDmsEndpoinArn, lookupSecurityGroupId, lookupVpcAvailabilityZones } from "./Utils";

export type StartReplicationHandlerInput = {
  ReplicationType: MigrationTypeValue;
  StartReplicationType: StartReplicationTaskTypeValue;
  CdcStartPosition?: string;
  customDurationMinutes?: number;
  isSmokeTest?: boolean;
  skipReplicationStart?: boolean;
  skipDeletionSchedule?: boolean;
};

/**
 * This is a lambda function handler that:
 *   1) Creates and starts a new CDC replication configuration
 *   2) Schedules the stop and deletion of the replication after a specified duration
 * @param event
 */
export const handler = async (event:ScheduledLambdaInput):Promise<any> => {
  const { lambdaInput, groupName, scheduleName } = event;

  try {
    log(event, 'Processing with the following event');

    const startEnvironmentVariables = getReplicationStartEnvironmentVariables();

    const { 
      ACTIVE, STOP_REPLICATION_FUNCTION_ARN,
      REPLICATION_DURATION_FOR_FULL_LOAD_MINUTES, REPLICATION_DURATION_FOR_CDC_MINUTES
    } = process.env;

    if(`${ACTIVE}` === 'false') {
      console.log('The lambda is not active. Exiting without action.');
      return;
    }

    if( ! /^\d+$/.test(`${REPLICATION_DURATION_FOR_FULL_LOAD_MINUTES}`)) {
      throw new Error('REPLICATION_DURATION_FOR_FULL_LOAD_MINUTES must be a positive integer');
    }
    if( ! /^\d+$/.test(`${REPLICATION_DURATION_FOR_CDC_MINUTES}`)) {
      throw new Error('REPLICATION_DURATION_FOR_CDC_MINUTES must be a positive integer');
    }
    if( ! STOP_REPLICATION_FUNCTION_ARN) {
      throw new Error('STOP_REPLICATION_FUNCTION_ARN is not defined');
    }

    let { 
      ReplicationType, StartReplicationType, CdcStartPosition, isSmokeTest=false,
      skipReplicationStart=false, skipDeletionSchedule=false, customDurationMinutes
    } = lambdaInput as StartReplicationHandlerInput;

    // Non-CDC replications are not supported here.
    if(ReplicationType === MigrationTypeValue.FULL_LOAD) {
      throw new Error('Only CDC replications can be started with this function');
    }

    // Instantiate replication creation class
    let replicationToCreate: AbstractReplicationToCreate;
    const createEnvironmentVariables = getReplicationCreateEnvironmentVariables();
    replicationToCreate = isSmokeTest ? 
      new ReplicationToCreateSingleTable(createEnvironmentVariables) : 
      new ReplicationToCreate(createEnvironmentVariables);

    // Instantiate replication start class
    let replicationToStart: AbstractReplicationToStart;
    replicationToStart = isSmokeTest ? 
      new ReplicationToStartSingleTable(startEnvironmentVariables) : 
      new ReplicationToStart(startEnvironmentVariables);

    // Validate environment variables
    if( ! replicationToCreate.validCreateEnvironmentVariables) {
      throw new Error('Invalid replication creation environment variables');
    }
    if( ! replicationToStart.validStartEnvironmentVariables) {
      throw new Error('Invalid replication start environment variables');
    }

    // Create a new replication configuration.
    const ReplicationConfigArn = await replicationToCreate.create(ReplicationType);

    // Bail out if configured to only create the replication.
    if(skipReplicationStart) {
      console.log('Skipping the start of the replication as requested.');
      return;
    }

    const startParms = {
      groupName,
      scheduleName,      
      ReplicationConfigArn,
      CdcStartPosition,
      customDurationMinutes,
      StartReplicationType
    } satisfies ReplicationToStartRunParms;

    // Start a replication based on the newly created configuration.
    await replicationToStart.start(startParms);

    // Bail out if configured to skip scheduling the deletion of the replication.
    if(skipDeletionSchedule) {
      console.log('Skipping the scheduling of the replication deletion as requested.');
      return;
    }

    // Schedule the deletion of the replication after it has run for the specified duration.
    await replicationToStart.scheduleDeletion(startParms);

    if(replicationToStart.CdcStopTime) {
      log(`Successfully started replication: ${ReplicationConfigArn} to run until ${replicationToStart.CdcStopTime}`);
    }
    else {
      log(`Successfully started replication: ${ReplicationConfigArn} with no CdcStopTime`);
    }
  }
  catch(e:any) {    
    log(e);
  }
  finally {
    // Delete the schedule that triggered this execution.
    await PostExecution().cleanup(scheduleName, groupName);
  }
};  

export type StartReplicationParms = {
  context: IContext;
  ReplicationType: MigrationTypeValue;
  customDurationMinutes?: number;
  isSmokeTest?: boolean;
};

export const startReplication = async (parms: StartReplicationParms) => {
  const { context, ReplicationType, customDurationMinutes, isSmokeTest=false } = parms;

  const { 
    stack: { Account, Region, Id, Tags: { Landscape } = {} } = {},
    scheduledRunRetryOnFailure=false,
    sourceDbLargestLobKB=7000,
    replicationScheduleCronExpression,
    replicationScheduleCronTimezone,
    sourceDbEngineName,
    sourceDbTestTables,
    sourceDbSchemas,
    sourceDbVpcId,
    durationForFullLoadMinutes,
    durationForCdcMinutes,
    postgresSchema
  } = context;
  const prefix = () => `${Id}-${Landscape}`;

  // Needed to create the replication config
  process.env.ACTIVE = 'true';
  process.env.PREFIX = `${prefix()}`;
  process.env.ACCOUNT = `${Account}`;
  process.env.SOURCE_ENDPOINT_ARN = await lookupDmsEndpoinArn(`${prefix()}-source-endpoint`);
  process.env.TARGET_ENDPOINT_ARN = await lookupDmsEndpoinArn(`${prefix()}-target-endpoint`);
  process.env.REPLICATION_SUBNET_GROUP_ID = `${prefix()}-subnet-group`;
  process.env.REPLICATION_AVAILABILITY_ZONE = (await lookupVpcAvailabilityZones(`${sourceDbVpcId}`))[0];
  process.env.VPC_SECURITY_GROUP_ID = await lookupSecurityGroupId(`${prefix()}-vpc-sg`);
  process.env.SOURCE_TEST_TABLES = JSON.stringify(sourceDbTestTables);
  process.env.SOURCE_DB_SCHEMAS = JSON.stringify(sourceDbSchemas);
  process.env.SOURCE_DB_ENGINE_NAME = sourceDbEngineName;
  process.env.LARGEST_SOURCE_LOB_KB = `${sourceDbLargestLobKB}`;
  process.env.REPLICATION_DURATION_FOR_FULL_LOAD_MINUTES = `${durationForFullLoadMinutes ?? '120'}`;
  process.env.REPLICATION_DURATION_FOR_CDC_MINUTES = `${durationForCdcMinutes ?? '60'}`;
  process.env.POSTGRES_DB_SCHEMA = postgresSchema;

  // Needed to start the replication config, schedule its stop, and cleanup
  process.env.IGNORE_LAST_ERROR = scheduledRunRetryOnFailure ? 'true' : 'false';
  process.env.REPLICATION_SCHEDULE_CRON_EXPRESSION = replicationScheduleCronExpression;
  process.env.REPLICATION_SCHEDULE_CRON_TIMEZONE = replicationScheduleCronTimezone;
  process.env.STOP_REPLICATION_FUNCTION_ARN = `arn:aws:lambda:${Region}:${Account}:function:${prefix()}-stop-replication-task`;

  await handler({
    groupName: `${prefix()}-schedules`,
    scheduleName: 'N/A', // There won't be a schedule to delete since this is a manual run
    lambdaInput: {
      ReplicationType,
      StartReplicationType: StartReplicationTaskTypeValue.START_REPLICATION,
      isSmokeTest,
      skipReplicationStart: false,
      skipDeletionSchedule: false,
      customDurationMinutes,
      CdcStartPosition: getShortIsoString(new Date()),
    } satisfies StartReplicationHandlerInput
  });
  console.log('Done');
}




/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/StartReplicationHandler.ts')) {

  (async () => {
    const context:IContext = await require('../../context/context.json');
    await startReplication({
      context, 
      ReplicationType: MigrationTypeValue.FULL_LOAD_AND_CDC,
      customDurationMinutes: 180
    });
  })();
}
