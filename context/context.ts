import { InstanceSize } from 'aws-cdk-lib/aws-ec2';
import { IContext, PostgresInstanceIngress, DatabaseTable, StackParameters } from './IContext';
import * as ctx from './context.json';

export class Context implements IContext {

  public stack:StackParameters;
  public serverless: boolean;
  public scheduledRunRetryOnFailure?: boolean;
  public replicationScheduleCronExpression?: string; // A cron expression for scheduling the replication tasks
  public replicationScheduleCronTimezone?: string; // Timezone for the cron expression, defaults to UTC
  public durationForFullLoadMinutes?: number; // Duration to run a full-load replication before switching to CDC
  public durationForCdcMinutes?: number; // Duration to run a CDC replication before stopping it

  /* ----------------- ORACLE SOURCE ----------------- */
  // Connection
  public oracleHost: string;
  public oraclePort: number;
  public oracleUser: string;
  public oraclePassword: string|undefined;
   // Infrastructure
  public oracleSecretName?: string;
  public oracleSecurityGroupId?: string;
  public oracleVpcId?: string;
  public oracleSubnetIds?: string[];
  // Replication configuration
  public oracleTestTables?: DatabaseTable[];
  public oracleSourceSchemas: string[];
  public oracleLargestLobKB?: number;

/* ----------------- POSTGRES TARGET ----------------- */
  // Connection
  public postgresHost: string;
  public postgresPort: number;
  public postgresDbName: string;
  public postgresSchema: string;
  public postgresPassword: string|undefined;
  // Infrastructure 
  public postgresSecretName?: string;
  public postgresInstanceSize?: InstanceSize;
  public postgresInstanceIngress?: PostgresInstanceIngress[]; // CIDR blocks to allow inbound traffic to the RDS instance

  constructor() {

    // Passwords from the environment take precedence over context.json
    const { ORACLE_PSWD, PG_PSWD } = process.env;


    // Fallback to context.json values
    const context:IContext = <IContext>ctx;
    const {
      stack: { Id, Account, Region, Tags: { Service, Function, Landscape } = {} } = {},
      oracleHost, oraclePort, oracleUser, oraclePassword, oracleSecretName, oracleSecurityGroupId,
      oracleVpcId, oracleSubnetIds, oracleTestTables, oracleSourceSchemas, oracleLargestLobKB, 

      postgresDbName, postgresHost, postgresPort, postgresSchema, postgresPassword, 
      postgresSecretName, postgresInstanceSize, postgresInstanceIngress,

      replicationScheduleCronExpression, replicationScheduleCronTimezone, scheduledRunRetryOnFailure=true, serverless=true,
      durationForFullLoadMinutes, durationForCdcMinutes
    } = context;

    this.stack = { Id, Account, Region, Tags: { Service, Function, Landscape }, prefix: () => {
      return `${Id}-${Landscape}`;
    }} as StackParameters;

    this.oracleHost = oracleHost;
    this.oraclePort = oraclePort;
    this.oracleUser = oracleUser;
    this.oraclePassword = oraclePassword || ORACLE_PSWD;
    this.oracleSecretName = oracleSecretName;
    this.oracleSecurityGroupId = oracleSecurityGroupId;
    this.oracleVpcId = oracleVpcId;
    this.oracleSubnetIds = oracleSubnetIds;
    this.oracleTestTables = oracleTestTables;
    this.oracleSourceSchemas = oracleSourceSchemas;
    this.oracleLargestLobKB = oracleLargestLobKB;

    this.postgresDbName = postgresDbName;
    this.postgresHost = postgresHost;
    this.postgresPort = postgresPort;
    this.postgresSchema = postgresSchema;
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