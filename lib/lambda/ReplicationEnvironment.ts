
export type ReplicationCreateEnvironmentVariables = {
  active?: boolean;
  prefix: string;
  isSmokeTest?: boolean;
  sourceEndpointArn: string;
  targetEndpointArn: string;
  replicationAvailabilityZone: string;
  replicationSubnetGroupId: string;
  vpcSecurityGroupId: string;
  largestSourceLobKb?: number;
  postgresSchema?: string;
  sourceTestTables?: string;
  sourceDbSchemas: string;
  sourceDbEngineName: string;
  isValid: (parms?: ReplicationCreateEnvironmentVariables) => boolean;
};

export type ReplicationStartEnvironmentVariables = {
  active?: boolean;
  prefix: string;
  startReplicationFunctionArn?: string;
  stopReplicationFunctionArn?: string;
  replicationScheduleCronExpression?: string;
  replicationScheduleCronTimezone?: string;
  ignoreLastError?: boolean;
  isValid: (parms?: ReplicationStartEnvironmentVariables) => boolean;
};

export type ReplicationFullEnvironmentVariables = ReplicationCreateEnvironmentVariables & ReplicationStartEnvironmentVariables & {
  isValid?: (parms?: ReplicationFullEnvironmentVariables) => boolean;
};

export const getReplicationCreateEnvironmentVariables = (): ReplicationCreateEnvironmentVariables => {
  const parms = {
    active: process.env.ACTIVE !== 'false',
    prefix: process.env.PREFIX,
    sourceEndpointArn: process.env.SOURCE_ENDPOINT_ARN!,
    targetEndpointArn: process.env.TARGET_ENDPOINT_ARN!,
    replicationAvailabilityZone: process.env.REPLICATION_AVAILABILITY_ZONE!,
    replicationSubnetGroupId: process.env.REPLICATION_SUBNET_GROUP_ID!,
    vpcSecurityGroupId: process.env.VPC_SECURITY_GROUP_ID!,
    largestSourceLobKb: process.env.LARGEST_SOURCE_LOB_KB ? parseInt(process.env.LARGEST_SOURCE_LOB_KB) : undefined,
    postgresSchema: process.env.POSTGRES_DB_SCHEMA,
    sourceTestTables: process.env.SOURCE_TEST_TABLES,
    sourceDbSchemas: process.env.SOURCE_DB_SCHEMAS,
    sourceDbEngineName: process.env.SOURCE_DB_ENGINE_NAME,
  } as ReplicationCreateEnvironmentVariables;

  parms.isValid = () => {
    const flds = [];
    if( ! parms.prefix) flds.push('PREFIX');
    if( ! parms.sourceEndpointArn) flds.push('SOURCE_ENDPOINT_ARN');
    if( ! parms.targetEndpointArn) flds.push('TARGET_ENDPOINT_ARN');
    if( ! parms.replicationAvailabilityZone) flds.push('REPLICATION_AVAILABILITY_ZONE');
    if( ! parms.replicationSubnetGroupId) flds.push('REPLICATION_SUBNET_GROUP_ID');
    if( ! parms.vpcSecurityGroupId) flds.push('VPC_SECURITY_GROUP_ID');
    if( ! parms.sourceDbSchemas) flds.push('SOURCE_DB_SCHEMAS');
    if( ! parms.sourceDbEngineName) flds.push('SOURCE_DB_ENGINE_NAME');
    if(flds.length > 0) {
      console.error(`Missing the following required environment variables: ${flds.join(', ')}`);
    }
    else {
      const sourceDbSchemas = parms.sourceDbSchemas ? JSON.parse(parms.sourceDbSchemas) : [];
      if( sourceDbSchemas.length === 0) flds.push('SOURCE_DB_SCHEMAS (no schemas specified)');
    }
    return flds.length === 0;
  }
  return parms;
}

export const getReplicationStartEnvironmentVariables = (): ReplicationStartEnvironmentVariables => {
  const parms = {
    active: process.env.ACTIVE !== 'false',
    prefix: process.env.PREFIX,
    stopReplicationFunctionArn: process.env.STOP_REPLICATION_FUNCTION_ARN,
    startReplicationFunctionArn: process.env.START_REPLICATION_FUNCTION_ARN,
    replicationScheduleCronExpression: process.env.REPLICATION_SCHEDULE_CRON_EXPRESSION,
    replicationScheduleCronTimezone: process.env.REPLICATION_SCHEDULE_CRON_TIMEZONE,
    ignoreLastError: process.env.IGNORE_LAST_ERROR === 'true',
  } as ReplicationStartEnvironmentVariables;

  parms.isValid = () => {
    const flds = [];
    if( ! process.env.PREFIX) flds.push('PREFIX');
    if( ! process.env.STOP_REPLICATION_FUNCTION_ARN) flds.push('STOP_REPLICATION_FUNCTION_ARN');
     if( ! process.env.REPLICATION_SCHEDULE_CRON_EXPRESSION) flds.push('REPLICATION_SCHEDULE_CRON_EXPRESSION');
    if(flds.length > 0) {
      console.error(`Missing the following required environment variables: ${flds.join(', ')}`);
    }
    return flds.length === 0;
  }
  return parms;
}

export const getReplicationFullEnvironmentVariables = () => {
  const createParms = getReplicationCreateEnvironmentVariables();
  const startParms = getReplicationStartEnvironmentVariables();
  return {
    ...createParms,
    ...startParms,
    isValid: () => {
      return createParms.isValid() && startParms.isValid();
    }
  } as ReplicationFullEnvironmentVariables;
}