import { DatabaseMigrationService, MigrationTypeValue, Replication, ReplicationConfig } from "@aws-sdk/client-database-migration-service";
import { EC2 } from "@aws-sdk/client-ec2";

export const serializeObject = (o:any, seen = new Set()):any => {
  if (o && typeof o === 'object') {
    if (seen.has(o)) return '[Circular]';
    seen.add(o);

    if (Array.isArray(o)) return o.map(item => serializeObject(item, seen));
    return Object.fromEntries(Object.entries(o).map(([key, value]) => [key, serializeObject(value, seen)]));
  }
  return o;
}

const toConsole = (o:any, out:Function, msg?:string) => {
  const output = (suffix:string) => {
    if(msg) msg = msg.endsWith(': ') ? msg : `${msg}: `;
    out(msg ? `${msg}${suffix}` : suffix);
  }
  if(o instanceof Error) {
    console.error(msg);
    console.error(o);
    return;
  }
  if(o instanceof Object) {
    output(JSON.stringify(serializeObject(o), null, 2));
    return;
  }
  output(`${o}`);
}

export const log = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.log(s), msg);
}

export const warn = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.warn(s), msg);
}

export const error = (o:any, msg?:string) => {
  toConsole(o, (s:string) => console.error(s), msg);
}

const ONE_SECOND_MS = 1000;
const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export enum TimeUnit {
  SECOND = ONE_SECOND_MS,
  MINUTE = ONE_MINUTE_MS,
  HOUR = ONE_HOUR_MS,
  DAY = ONE_DAY_MS,
}

/**
 * Get an ISO string without milliseconds
 * @param date 
 * @returns 
 */
export const getShortIsoString = (date: Date|string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toISOString().replace(/\.\d{3}Z$/, '');
}

export const getOffsetDate = (offsetMs: number, date?: Date): Date => {
  return new Date((date ?? new Date()).getTime() + offsetMs);
}

const getOffsetDateString = (offsetMs: number, date?: Date): string => {
  return getShortIsoString(getOffsetDate(offsetMs, date));
}

export const getPastDateString = (unitCount: number, unitType: TimeUnit, date?: Date): string => {
  return getOffsetDateString(-unitCount * unitType, date);
}

export const getFutureDateString = (unitCount: number, unitType: TimeUnit, date?: Date): string => {
  return getOffsetDateString(unitCount * unitType, date);
}

export const asCommitTimestamp = (date: Date|string): string => {
  const dateStr = typeof date === 'string' ? date : getShortIsoString(date);
  return `commit_time:${dateStr}`;
}

export const asServerTimestamp = (date: Date|string): string => {
  const dateStr = typeof date === 'string' ? date : getShortIsoString(date);
  if(dateStr.startsWith('server_time:')) {
    return dateStr;
  }
  return `server_time:${dateStr}`;
}

export const lookupDmsEndpoinArn = async (endpointId:string): Promise<string> => {
  const dms = new DatabaseMigrationService();
  const describeEndpoints = await dms.describeEndpoints({ Filters: [{ Name: 'endpoint-id', Values: [endpointId] }] });
  if( ! describeEndpoints.Endpoints || describeEndpoints.Endpoints.length === 0) {
    throw new Error(`No DMS endpoint found with id ${endpointId}`);
  }
  if(describeEndpoints.Endpoints.length > 1) {
    throw new Error(`Multiple DMS endpoints found with id ${endpointId}`);
  }
  const endpoint = describeEndpoints.Endpoints[0];
  if( ! endpoint.EndpointArn) {
    throw new Error(`DMS endpoint ${endpointId} has no ARN`);
  }
  return endpoint.EndpointArn;
}


export const lookupSecurityGroupId = async (sgName:string): Promise<string> => {
  const ec2 = new EC2();
  const describeSgs = await ec2.describeSecurityGroups({ Filters: [{ Name: 'group-name', Values: [sgName] }] });
  if( ! describeSgs.SecurityGroups || describeSgs.SecurityGroups.length === 0) {
    throw new Error(`No security group found with name ${sgName}`);
  }
  if(describeSgs.SecurityGroups.length > 1) {
    throw new Error(`Multiple security groups found with name ${sgName}`);
  }
  const sg = describeSgs.SecurityGroups[0];
  if( ! sg.GroupId) {
    throw new Error(`Security group ${sgName} has no GroupId`);
  }
  return sg.GroupId;
}

export const lookupVpcAvailabilityZones = async (vpcId:string): Promise<string[]> => {
  const ec2 = new EC2();
  const describeVpcs = await ec2.describeVpcs({ VpcIds: [vpcId] });
  if( ! describeVpcs.Vpcs || describeVpcs.Vpcs.length === 0) {
    throw new Error(`No VPC found with id ${vpcId}`);
  }
  if(describeVpcs.Vpcs.length > 1) {
    throw new Error(`Multiple VPCs found with id ${vpcId}`);
  }
  const vpc = describeVpcs.Vpcs[0];
  if( ! vpc.VpcId) {
    throw new Error(`VPC ${vpcId} has no VpcId`);
  }

  const describeSubnets = await ec2.describeSubnets({ Filters: [{ Name: 'vpc-id', Values: [vpc.VpcId] }] });
  if( ! describeSubnets.Subnets || describeSubnets.Subnets.length === 0) {
    throw new Error(`No subnets found for VPC ${vpc.VpcId}`);
  }

  const azs = Array.from(new Set(describeSubnets.Subnets.map(s => s.AvailabilityZone).filter((az): az is string => !!az)));
  if(azs.length === 0) {
    throw new Error(`No availability zones found for VPC ${vpc.VpcId}`);
  }
  return azs;
}

export const lookupReplicationConfig = async (replicationConfigArn:string): Promise<ReplicationConfig> => {
  const dms = new DatabaseMigrationService();
  const describeReplicationConfigs = await dms.describeReplicationConfigs({ Filters: [{ Name: 'replication-config-arn', Values: [replicationConfigArn] }] });
  if( ! describeReplicationConfigs.ReplicationConfigs || describeReplicationConfigs.ReplicationConfigs.length === 0) {
    throw new Error(`No DMS replication configuration found with ARN ${replicationConfigArn}`);
  }
  if(describeReplicationConfigs.ReplicationConfigs.length > 1) {
    throw new Error(`Multiple DMS replication configurations found with ARN ${replicationConfigArn}`);
  }
  const replicationConfig = describeReplicationConfigs.ReplicationConfigs[0];
  if( ! replicationConfig.ReplicationConfigArn) {
    throw new Error(`DMS replication configuration ${replicationConfigArn} has no ARN`);
  }
  return replicationConfig;
}

export const lookupReplicationConfigType = async (replicationConfigArn:string): Promise<MigrationTypeValue> => {
  const replicationConfig = await lookupReplicationConfig(replicationConfigArn);
  if( ! replicationConfig.ReplicationType) {
    throw new Error(`DMS replication configuration ${replicationConfigArn} has no ReplicationType`);
  }
  return replicationConfig.ReplicationType;
}


const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/Utils.ts')) {

  (async () => {
    const azs = await lookupVpcAvailabilityZones('vpc-0290de1785982a52f');
    console.log('AZs for VPC vpc-0290de1785982a52f:', JSON.stringify(azs));
  })();
}