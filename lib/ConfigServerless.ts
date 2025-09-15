import { CfnReplicationConfig, CfnReplicationConfigProps } from "aws-cdk-lib/aws-dms";
import { Construct } from "constructs";
import { IContext } from "../context/IContext";
import { DmsEndpoints } from "./Endpoint";
import { ServerlessReplicationSettings } from "./ReplicationSetting";
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

  constructor(props: DmsConfigProps) {
    this._props = props;

    let { 
      id, scope, context, context: { oracleLargestLobKB=0 },
      dmsVpc: { sg: { securityGroupId }, vpc }, 
      dmsEndpoints: { sourceEndpointArn, targetEndpointArn },
      replicationType, tableMapping, replicationSubnetGroupId
    } = props;

    const { stack: { prefix=()=>'undefined' } = {} } = context;

    const replicationSettings = Object.assign({}, ServerlessReplicationSettings);
    if(oracleLargestLobKB > 0) {
      replicationSettings.TargetMetadata = {
        ...replicationSettings.TargetMetadata,
        LobMaxSize: oracleLargestLobKB
      };
    }

    // Create the DMS replication config
    this._config = new CfnReplicationConfig(scope, id, {
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