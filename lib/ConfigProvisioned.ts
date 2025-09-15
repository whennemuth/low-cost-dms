import { CfnReplicationInstance, CfnReplicationTask, CfnReplicationTaskProps } from "aws-cdk-lib/aws-dms";
import { Construct } from "constructs";
import { DmsConfigProps } from "./ConfigServerless";
import { VerboseReplicationSettings } from "./ReplicationSetting";

export type DmsTaskProps = DmsConfigProps & {
  instanceClass?: string; // e.g., 'dms.t3.medium'
  allocatedStorage?: number; // in GB
}

/**
 * Represents a DMS replication task with the provisioning of a replication instance for it to run on.
 */
export class DmsTask extends Construct {
  private _replicationInstanceArn: string;
  private _replicationTaskArn: string;

  constructor(props: DmsTaskProps) {
    super(props.scope, props.id);

    let { 
      id, context, context: { oracleLargestLobKB=0 }, dmsVpc: { sg: { securityGroupId } }, 
      dmsEndpoints: { sourceEndpointArn, targetEndpointArn },
      replicationType, replicationSubnetGroupId,
      tableMapping,
      instanceClass = 'dms.t3.medium',
      allocatedStorage = 50
    } = props;

    const { stack: { prefix=()=>'undefined' } = {} } = context;

    const replicationSettings = Object.assign({}, VerboseReplicationSettings);
    if(oracleLargestLobKB > 0) {
      replicationSettings.TargetMetadata = {
        ...replicationSettings.TargetMetadata,
        LobMaxSize: oracleLargestLobKB
      };
    }

    // Create the replication instance
    const replicationInstance = new CfnReplicationInstance(this, `${prefix()}-${id}-instance`, {
      replicationInstanceIdentifier: `${prefix()}-${id}-instance`,
      replicationInstanceClass: instanceClass,
      allocatedStorage: allocatedStorage,
      publiclyAccessible: false,
      vpcSecurityGroupIds: [securityGroupId],
      replicationSubnetGroupIdentifier: replicationSubnetGroupId,
      multiAz: false,
    });

    // Create the replication task
    const replicationTask = new CfnReplicationTask(this, `${prefix()}-${id}-task`, {
      replicationTaskIdentifier: `${prefix()}-${id}-task`,
      sourceEndpointArn,
      targetEndpointArn,
      migrationType: replicationType,
      replicationInstanceArn: replicationInstance.ref,
      tableMappings: tableMapping.toString(),
      replicationTaskSettings: JSON.stringify(replicationSettings),
    } as CfnReplicationTaskProps);

    this._replicationInstanceArn = replicationInstance.ref;
    this._replicationTaskArn = replicationTask.ref;
  }

  public get replicationTaskArn(): string {
    return this._replicationTaskArn;
  }
  public get replicationInstanceArn(): string {
    return this._replicationInstanceArn;
  }
}