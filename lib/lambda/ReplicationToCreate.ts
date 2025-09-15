import { CreateReplicationConfigCommandInput, DatabaseMigrationService, MigrationTypeValue } from "@aws-sdk/client-database-migration-service";
import { IContext } from "../../context/IContext";
import { ServerlessReplicationSettings } from "../ReplicationSetting";
import { TableMapping } from "../TableMappings";
import { getReplicationCreateEnvironmentVariables, ReplicationCreateEnvironmentVariables } from "./ReplicationEnvironment";
import { lookupDmsEndpoinArn, lookupSecurityGroupId, lookupVpcAvailabilityZones } from "./Utils";

export type ReplicationToCreateParms = {
  isSmokeTest: boolean;
  createEnvironmentVariables?: ReplicationCreateEnvironmentVariables;
};

/**
 * Create a replication configuration for serverless DMS replications.
 */
export class ReplicationToCreate {
  private isSmokeTest: boolean;
  private createEnvVars: ReplicationCreateEnvironmentVariables;
  private _suffix: string = new Date().toISOString().replace(/[\:\.]/g, '-');
  private _replicationType: MigrationTypeValue;

  constructor(parms:ReplicationToCreateParms) {
    const { isSmokeTest, createEnvironmentVariables } = parms;
    this.isSmokeTest = isSmokeTest;
    this.createEnvVars = createEnvironmentVariables ?? getReplicationCreateEnvironmentVariables();
    if( ! this.createEnvVars.isValid()) {
      throw new Error('Invalid replication creation environment variables');
    }
  }

  private getReplicationSettings = () => {
    const { largestSourceLobKb:LobMaxSize=0 } = this.createEnvVars ?? {};
    const replicationSettings = Object.assign({}, ServerlessReplicationSettings);
    if(LobMaxSize > 0) {
      replicationSettings.TargetMetadata = {
        ...replicationSettings.TargetMetadata,
        LobMaxSize
      };
    }
    return replicationSettings; 
  }

  private getTableMapping = () => {
    const { sourceTestTables:tables, sourceDbSchemas:schemas } = this.createEnvVars;
    const sourceDbTestTables = tables ? JSON.parse(tables) : [];
    const sourceDbSchemas = schemas ? JSON.parse(schemas) : [];
    if(this.isSmokeTest) {
      if(sourceDbTestTables.length == 0) {
        throw new Error('No test tables specified for smoke test');
      }
      return TableMapping
        .includeTestTables(sourceDbTestTables)
        .lowerCaseTargetTableNames();
    }
    else {
      if(sourceDbSchemas.length == 0) {
        throw new Error('No source schemas specified');
      }
      return new TableMapping()
        .includeSchemas(sourceDbSchemas)
        .lowerCaseTargetTableNames()
    }
  }

  public create = async (ReplicationType: MigrationTypeValue, dryrun: boolean=false): Promise<string> => {
    this._replicationType = ReplicationType;
    const dms = new DatabaseMigrationService();
    const ReplicationConfigIdentifier = `start-replication-${this._suffix}`;

    const { 
      getReplicationSettings, getTableMapping, createEnvVars: { 
        sourceEndpointArn:SourceEndpointArn, targetEndpointArn:TargetEndpointArn, vpcSecurityGroupId,
        replicationAvailabilityZone:AvailabilityZone, replicationSubnetGroupId:ReplicationSubnetGroupId
      } 
    } = this;

    const input = {
      ReplicationConfigIdentifier,
      ReplicationType,
      SourceEndpointArn,
      TargetEndpointArn,
      ReplicationSettings: JSON.stringify(getReplicationSettings()),
      TableMappings: getTableMapping().toFlatString(),
      ComputeConfig: {
        ReplicationSubnetGroupId,
        MultiAZ: false,
        MaxCapacityUnits: 8,
        MinCapacityUnits: 2,
        AvailabilityZone,
        VpcSecurityGroupIds: [ vpcSecurityGroupId ]
      }
    } as CreateReplicationConfigCommandInput

    console.log('Creating replication configuration with settings:', JSON.stringify(input, null, 2));

    if(dryrun) {
      console.log('DRYRUN: skipping execution');
      return '';
    }

    const output = await dms.createReplicationConfig(input);

    const { ReplicationConfig: { ReplicationConfigArn:arn } = {} } = output;
    if ( ! arn ) {
      throw new Error('Failed to create the replication configuration');
    }
    return arn;
  }

  public get suffix(): string {
    return this._suffix;
  }
  public get replicationType(): MigrationTypeValue {
    return this._replicationType;
  }
  public get validCreateEnvironmentVariables(): boolean {
    return this.createEnvVars.isValid();
  }
}




/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/ReplicationToCreate.ts')) {

  (async () => {
    const context:IContext = await require('../../context/context.json');
    const { 
      stack: { Tags: { Landscape } = {} } = {},
      oracleLargestLobKB=7000,
      oracleTestTables,
      oracleSourceSchemas,
      oracleVpcId
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

    const dryrun = false;

    await new ReplicationToCreate({ isSmokeTest: true }).create(MigrationTypeValue.CDC, dryrun);

    console.log('Done');
  })();
}