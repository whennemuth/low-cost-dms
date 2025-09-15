import { CfnReplicationConfig, CfnReplicationConfigProps } from "aws-cdk-lib/aws-dms";
import { Construct } from "constructs";
import { IContext } from "../context/IContext";
import { DmsEndpoints } from "./Endpoint";
import { getReplicationSettings } from "./replication-settings/ReplicationSetting";
import { TableMapping } from "./TableMappings";
import { DmsVpc } from "./Vpc";

export type DmsConfigProps = {
  id: string;
  scope: Construct;
  context: IContext;
  dmsVpc: DmsVpc;
  dmsEndpoints: DmsEndpoints;
  replicationType: 'cdc' | 'full-load' | 'full-load-and-cdc';
  replicationSubnetGroupId: string;
  tableMapping: TableMapping;
}

/**
 * Represents a DMS replication configuration.
 * 
 */
export class DmsConfig {
  private _props: DmsConfigProps;
  private _config: CfnReplicationConfig;

  private constructor(props: DmsConfigProps) {
    this._props = props;
  }

  public static getInstance = async (props: DmsConfigProps): Promise<DmsConfig> => {
    const config = new DmsConfig(props);
        
    let { 
      id, scope, context, context: { sourceDbLargestLobKB=0, sourceDbEngineName },
      dmsVpc: { sg: { securityGroupId }, vpc }, 
      dmsEndpoints: { sourceEndpointArn, targetEndpointArn },
      replicationType, tableMapping, replicationSubnetGroupId
    } = props;

    const { stack: { prefix=()=>'undefined' } = {}, postgresSchema } = context;

    const coreSettings = await getReplicationSettings(postgresSchema);
    const replicationSettings = Object.assign({}, coreSettings);
    if(sourceDbLargestLobKB > 0) {
      replicationSettings.TargetMetadata = {
        ...replicationSettings.TargetMetadata,
        LobMaxSize: sourceDbLargestLobKB
      };
    }

    // Create the DMS replication config
    config._config = new CfnReplicationConfig(scope, id, {
      replicationConfigIdentifier: `${prefix()}-${id}`,
      replicationType,
      computeConfig: {
        replicationSubnetGroupId,
        vpcSecurityGroupIds: [ securityGroupId ],
        availabilityZone: vpc.availabilityZones[0], // Pick one AZ
        maxCapacityUnits: 8, // Max DCUs (auto-scaling ceiling)
        minCapacityUnits: 2, // Min DCUs (auto-scaling floor)
        multiAz: false, // Single AZ for now
      },
      sourceEndpointArn: sourceEndpointArn,
      targetEndpointArn: targetEndpointArn,
      tableMappings: tableMapping.toJSON(),
      replicationSettings,
    } as CfnReplicationConfigProps);

    return config;
  }


  public get id(): string {
    return this._props.id;
  }
  public get config(): CfnReplicationConfig {
    return this._config;
  }
  public get configArn(): string {
    return this._config.ref;
  }
  public get replicationType(): 'cdc' | 'full-load' | 'full-load-and-cdc' {
    return this._config.replicationType as 'cdc' | 'full-load' | 'full-load-and-cdc';
  }
}