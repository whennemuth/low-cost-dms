import { InstanceSize } from "aws-cdk-lib/aws-ec2";

export type PostgresInstanceIngress = {
  cidr: string;
  description?: string;
};

export type DatabaseTable = {
  schemaName: string;
  tableNames: string[];
}

export interface IContext {

  stack?: StackParameters; // Parameters for the CDK stack, including account, region, and tags
  replicationScheduleCronTimezone?: string; // Timezone for the cron expression, defaults to UTC
  replicationScheduleCronExpression?: string; // A cron expression for scheduling the replication tasks
  scheduledRunRetryOnFailure?: boolean;
  durationForFullLoadMinutes?: number; // Duration to run a full-load replication before switching to CDC
  durationForCdcMinutes?: number; // Duration to run a CDC replication before stopping it
  serverless?: boolean; // Whether to use serverless DMS replication instances

  oracleHost: string; // Oracle RDS endpoint
  oraclePort: number; // Oracle RDS port, typically 1521
  oracleUser: string; // Oracle RDS username
  oraclePassword?: string; // Oracle RDS password, ideally from Secrets Manager
  oracleSecretName?: string; // Optional secrets manager secret name for Oracle credentials
  oracleSecurityGroupId?: string; // Security group ID for Oracle RDS
  oracleVpcId?: string; // Optional VPC ID for Oracle RDS, if not using default VPC
  oracleSubnetIds?: string[]; // Optional subnet IDs for Oracle RDS, if not using default VPC
  oracleSourceSchemas: string[]; // Optional list of source schemas for Oracle RDS
  oracleTestTables?: DatabaseTable[]; // Optional list of test tables for Oracle RDS
  oracleLargestLobKB?: number; // Optional largest LOB size in KB for Oracle RDS

  postgresDbName: string; // PostgreSQL database name
  postgresHost: string; // PostgreSQL host
  postgresPort: number; // PostgreSQL port, typically 5432
  postgresSchema: string; // PostgreSQL target schema
  postgresPassword?: string; // PostgreSQL target password, ideally from Secrets Manager
  postgresSecretName?: string; // Optional secrets manager secret name for PostgreSQL credentials

  postgresInstanceSize?: InstanceSize; // The instance size of the RDS instance (triggers creation of an RDS instance if present)
  postgresInstanceIngress?: PostgresInstanceIngress[]; // CIDR blocks to allow inbound traffic to the RDS instance
}

export interface StackParameters {
  Id: string; // Unique identifier for the stack
  Account: string; // AWS Account ID
  Region: string; // AWS Region
  Tags: Tags; // Tags for AWS resources
  prefix: () => string; // Stack name and also serves as a prefix for resource names
}

export interface Tags {
  Service:   string;
  Function:  string;
  Landscape: string;
}