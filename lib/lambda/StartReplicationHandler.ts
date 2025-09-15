import { MigrationTypeValue, StartReplicationTaskTypeValue } from "@aws-sdk/client-database-migration-service";
import { IContext } from "../../context/IContext";
import { getReplicationCreateEnvironmentVariables, getReplicationStartEnvironmentVariables } from "./ReplicationEnvironment";
import { ReplicationToCreate } from "./ReplicationToCreate";
import { ReplicationToStart, ReplicationToStartRunParms } from "./ReplicationToStart";
import { PostExecution, ScheduledLambdaInput } from "./timer/DelayedExecution";
import { asServerTimestamp, getFutureDateString, log, lookupDmsEndpoinArn, lookupSecurityGroupId, lookupVpcAvailabilityZones, TimeUnit } from "./Utils";

export type StartReplicationHandlerInput = {
  ReplicationType: MigrationTypeValue;
  StartReplicationType: StartReplicationTaskTypeValue;
  CdcStartPosition?: string;
  CdcStopTime?: string;
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
      ACTIVE, STOP_REPLICATION_FUNCTION_ARN, REPLICATION_SCHEDULE_CRON_EXPRESSION,
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
      ReplicationType, StartReplicationType, CdcStartPosition, CdcStopTime, isSmokeTest=false,
      skipReplicationStart=false, skipDeletionSchedule=false 
    } = lambdaInput as StartReplicationHandlerInput;

    // Instantiate replication creation class
    const replicationToCreate =  new ReplicationToCreate({ 
      isSmokeTest, createEnvironmentVariables:getReplicationCreateEnvironmentVariables() 
    });

    // Non-CDC replications are not supported here.
    if(ReplicationType === MigrationTypeValue.FULL_LOAD) {
      throw new Error('Only CDC replications can be started with this function');
    }

    // Instantiate replication start class
    const replicationToStart = new ReplicationToStart({ 
      isSmokeTest: isSmokeTest, suffix:replicationToCreate.suffix, startEnvironmentVariables
    });

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

    // Construct the parameters to start a replication.
    let minutesToAdd = 0;
    if( ! CdcStopTime) {
      switch(ReplicationType) {
        case MigrationTypeValue.CDC:
          minutesToAdd = parseInt(REPLICATION_DURATION_FOR_CDC_MINUTES!);
          CdcStopTime = getFutureDateString(minutesToAdd, TimeUnit.MINUTE);
          break;
        case MigrationTypeValue.FULL_LOAD_AND_CDC:
          minutesToAdd = parseInt(REPLICATION_DURATION_FOR_FULL_LOAD_MINUTES!);
          CdcStopTime = getFutureDateString(minutesToAdd, TimeUnit.MINUTE);
          break;
      }
    }
    const startParms = {
      groupName,
      scheduleName,      
      ReplicationType,
      ReplicationConfigArn,
      CdcStartPosition: CdcStartPosition!,
      CdcStopPosition: asServerTimestamp(CdcStopTime),
      StartReplicationType
    } as ReplicationToStartRunParms;

    // Start a replication based on the newly created configuration.
    await replicationToStart.start(startParms);

    // Bail out if configured to skip scheduling the deletion of the replication.
    if(skipDeletionSchedule) {
      console.log('Skipping the scheduling of the replication deletion as requested.');
      return;
    }

    // Schedule the deletion of the replication after it has run for the specified duration.
    await replicationToStart.scheduleDeletion(startParms);

    log(`Successfully started replication: ${ReplicationConfigArn} to run for ${minutesToAdd} minutes until ${CdcStopTime}`);
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
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/StartReplicationHandler.ts')) {

  (async () => {
    const context:IContext = await require('../../context/context.json');
    const { 
      stack: { Account, Region, Tags: { Landscape } = {} } = {},
      scheduledRunRetryOnFailure=false,
      oracleLargestLobKB=7000,
      replicationScheduleCronExpression='0 0 2 * * *',
      oracleTestTables,
      oracleSourceSchemas,
      oracleVpcId,
      durationForFullLoadMinutes,
      durationForCdcMinutes
    } = context;
    const prefix = () => `kuali-dms-${Landscape}`;

    // Needed to create the replication config
    process.env.ACTIVE = 'true';
    process.env.PREFIX = `${prefix()}`;
    process.env.SOURCE_ENDPOINT_ARN = await lookupDmsEndpoinArn(`${prefix()}-source-endpoint`);
    process.env.TARGET_ENDPOINT_ARN = await lookupDmsEndpoinArn(`${prefix()}-target-endpoint`);
    process.env.REPLICATION_SUBNET_GROUP_ID = `${prefix()}-subnet-group`;
    process.env.REPLICATION_AVAILABILITY_ZONE = (await lookupVpcAvailabilityZones(`${oracleVpcId}`))[0];
    process.env.VPC_SECURITY_GROUP_ID = await lookupSecurityGroupId(`${prefix()}-vpc-sg`);
    process.env.SOURCE_TEST_TABLES = JSON.stringify(oracleTestTables);
    process.env.SOURCE_DB_SCHEMAS = JSON.stringify(oracleSourceSchemas);
    process.env.LARGEST_SOURCE_LOB_KB = `${oracleLargestLobKB}`;
    process.env.REPLICATION_DURATION_FOR_FULL_LOAD_MINUTES = `${durationForFullLoadMinutes ?? '120'}`;
    process.env.REPLICATION_DURATION_FOR_CDC_MINUTES = `${durationForCdcMinutes ?? '60'}`;

    // Needed to start the replication config, schedule its stop, and cleanup
    process.env.IGNORE_LAST_ERROR = scheduledRunRetryOnFailure ? 'true' : 'false';
    process.env.REPLICATION_SCHEDULE_CRON_EXPRESSION = replicationScheduleCronExpression ?? '0 0 2 * * *';
    process.env.STOP_REPLICATION_FUNCTION_ARN = `arn:aws:lambda:${Region}:${Account}:function:${prefix()}-stop-replication-task`;

    await handler({
      groupName: `${prefix()}-schedules`,
      scheduleName: 'test-start-replication-smoketest',
      lambdaInput: {
        ReplicationType: MigrationTypeValue.CDC,
        StartReplicationType: StartReplicationTaskTypeValue.START_REPLICATION,
        isSmokeTest: true,
        // CdcStopTime: getFutureDateString(20, TimeUnit.MINUTE),
        // CdcStartPosition: new Date().toISOString(),
      } as StartReplicationHandlerInput
    });
    console.log('Done');
  })();
}