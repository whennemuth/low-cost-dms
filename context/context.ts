import { InstanceSize } from 'aws-cdk-lib/aws-ec2';
import { IContext, PostgresInstanceIngress, DatabaseTable, StackParameters } from './IContext';
import * as ctx from './context.json';
import { DmsEndpointEngineName } from '../lib/Endpoint';

export class Context implements IContext {

  public stack:StackParameters;
  public serverless: boolean;
  public scheduledRunRetryOnFailure?: boolean;
  public replicationScheduleCronExpression?: string; // A cron expression for scheduling the replication tasks
  public replicationScheduleCronTimezone?: string; // Timezone for the cron expression, defaults to UTC
  public durationForFullLoadMinutes?: number; // Duration to run a full-load replication before switching to CDC
  public durationForCdcMinutes?: number; // Duration to run a CDC replication before stopping it

  /* ----------------- SOURCE DATABASE ----------------- */
  // Connection
  public sourceDbHost: string;
  public sourceDbPort: number;
  public sourceDbUser: string;
  public sourceDbPassword: string|undefined;
   // Infrastructure
  public sourceDbEngineName: DmsEndpointEngineName;
  public sourceDbSecretName?: string;
  public sourceDbSecurityGroupId?: string;
  public sourceDbVpcId?: string;
  public sourceDbSubnetIds?: string[];
  // Replication configuration
  public sourceDbTestTables?: DatabaseTable[];
  public sourceDbSchemas: string[];
  public sourceDbLargestLobKB?: number;

/* ----------------- POSTGRES TARGET ----------------- */
  // Connection
  public postgresHost: string;
  public postgresPort: number;
  public postgresDbName: string;
  public postgresSchema: string;
  public postgresUser: string;
  public postgresPassword: string|undefined;
  // Infrastructure 
  public postgresSecretName?: string;
  public postgresInstanceSize?: InstanceSize;
  public postgresInstanceIngress?: PostgresInstanceIngress[]; // CIDR blocks to allow inbound traffic to the RDS instance

  constructor() {

    // Passwords from the environment take precedence over context.json
    const { SOURCE_PSWD, PG_PSWD } = process.env;


    // Fallback to context.json values
    const context:IContext = <IContext>ctx;
    const {
      stack: { Id, Account, Region, Tags: { Service, Function, Landscape } = {} } = {},
      sourceDbHost, sourceDbPort, sourceDbUser, sourceDbPassword, sourceDbSecretName, sourceDbSecurityGroupId,
      sourceDbVpcId, sourceDbSubnetIds, sourceDbTestTables, sourceDbSchemas, sourceDbLargestLobKB,
      sourceDbEngineName,

      postgresDbName, postgresHost, postgresPort, postgresSchema, postgresUser, postgresPassword, 
      postgresSecretName, postgresInstanceSize, postgresInstanceIngress,

      replicationScheduleCronExpression, replicationScheduleCronTimezone, scheduledRunRetryOnFailure=true, serverless=true,
      durationForFullLoadMinutes, durationForCdcMinutes
    } = context;

    this.stack = { Id, Account, Region, Tags: { Service, Function, Landscape }, prefix: () => {
      return `${Id}-${Landscape}`;
    }} as StackParameters;

    this.sourceDbEngineName = sourceDbEngineName;
    this.sourceDbHost = sourceDbHost;
    this.sourceDbPort = sourceDbPort;
    this.sourceDbUser = sourceDbUser;
    this.sourceDbPassword = sourceDbPassword || SOURCE_PSWD;
    this.sourceDbSecretName = sourceDbSecretName;
    this.sourceDbSecurityGroupId = sourceDbSecurityGroupId;
    this.sourceDbVpcId = sourceDbVpcId;
    this.sourceDbSubnetIds = sourceDbSubnetIds;
    this.sourceDbTestTables = sourceDbTestTables;
    this.sourceDbSchemas = sourceDbSchemas;
    this.sourceDbLargestLobKB = sourceDbLargestLobKB;

    this.postgresDbName = postgresDbName;
    this.postgresHost = postgresHost;
    this.postgresPort = postgresPort;
    this.postgresSchema = postgresSchema;
    this.postgresUser = postgresUser;
    this.postgresPassword = postgresPassword || PG_PSWD;
    this.postgresSecretName = postgresSecretName;
    this.postgresInstanceSize = postgresInstanceSize;
    this.postgresInstanceIngress = postgresInstanceIngress;

    this.serverless = serverless;
    this.replicationScheduleCronExpression = replicationScheduleCronExpression;
    this.replicationScheduleCronTimezone = replicationScheduleCronTimezone;
    this.scheduledRunRetryOnFailure = scheduledRunRetryOnFailure;
    this.durationForFullLoadMinutes = durationForFullLoadMinutes;
    this.durationForCdcMinutes = durationForCdcMinutes;
  }
}