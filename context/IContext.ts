import { InstanceSize } from "aws-cdk-lib/aws-ec2";
import { DmsEndpointEngineName } from "../lib/Endpoint";

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

  sourceDbEngineName: DmsEndpointEngineName; // Source DB engine name
  sourceDbHost: string; // Source DB RDS endpoint
  sourceDbPort: number; // Source DB RDS port, typically 1521
  sourceDbUser: string; // Source DB RDS username
  sourceDbPassword?: string; // Source DB RDS password, ideally from Secrets Manager
  sourceDbSecretName?: string; // Optional secrets manager secret name for Source DB credentials
  sourceDbSecurityGroupId?: string; // Security group ID for Source DB RDS
  sourceDbVpcId?: string; // Optional VPC ID for Source DB RDS, if not using default VPC
  sourceDbSubnetIds?: string[]; // Optional subnet IDs for Source DB RDS, if not using default VPC
  sourceDbSchemas: string[]; // Optional list of source schemas for Source DB RDS
  sourceDbTestTables?: DatabaseTable[]; // Optional list of test tables for Source DB RDS
  sourceDbLargestLobKB?: number; // Optional largest LOB size in KB for Source DB RDS

  postgresUser: string;
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