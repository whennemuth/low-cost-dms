import { Construct } from "constructs";
import { IContext } from "../context/IContext";
import { DmsTask } from "./ConfigProvisioned";
import { DmsConfig, DmsConfigProps } from "./ConfigServerless";
import { DmsEndpoints } from "./Endpoint";
import { VpcRole } from "./Role";
import { TableMapping } from "./TableMappings";
import { DmsVpc } from "./Vpc";
import { MigrationTypeValue } from "@aws-sdk/client-database-migration-service";

export type TaskParms = {
  scope: Construct,
  context: IContext,
  dmsVpc: DmsVpc,
  dmsEndpoints: DmsEndpoints,
  dmsVpcRole?: VpcRole,
  replicationSubnetGroupId: string
}

/**
 * Define replication for tasks, either as serverless configurations, or as standard tasks with replication instances
 * to run them on.
 */
export class Tasks {
  private serverlessConfigs: DmsConfig[] = [];
  private serverless:boolean;
  private dmsTask?: DmsTask;

  constructor(parms:TaskParms) {
    this.serverless = `${parms.context.serverless}` !== 'false';
    if(this.serverless) {
      this.createServerlessTasks(parms);
    } 
    else {
      this.createProvisionedTask(parms);
    }
  }

  private createServerlessSmokeTestTasks = (parms:TaskParms) => {
    const { scope, context, context: { oracleTestTables=[] }, dmsVpc, dmsEndpoints, replicationSubnetGroupId } = parms;
    const { FULL_LOAD, CDC, FULL_LOAD_AND_CDC } = MigrationTypeValue;
    const tableMapping = TableMapping
      .includeTestTables(oracleTestTables)
      .lowerCaseTargetTableNames();

    // Create a "smoke test" replication config for testing connectivity and pre-migration assessment without any actual data migration
    this.serverlessConfigs.push(new DmsConfig({
      id: `${FULL_LOAD}-smoke-test`,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: FULL_LOAD,
      replicationSubnetGroupId,
      tableMapping
    } as DmsConfigProps));

    // Create a "smoke test" replication config for testing connectivity and pre-migration assessment without any actual data migration
    this.serverlessConfigs.push(new DmsConfig({
      id: `${FULL_LOAD_AND_CDC}-smoke-test`,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: FULL_LOAD_AND_CDC,
      replicationSubnetGroupId,
      tableMapping
    } as DmsConfigProps));

    // Create a "smoke test" replication config for testing connectivity and pre-migration assessment without any actual data migration
    this.serverlessConfigs.push(new DmsConfig({
      id: `${CDC}-smoke-test`,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: CDC,
      replicationSubnetGroupId,
      tableMapping
    } as DmsConfigProps));
  }

  private createServerlessTask = (parms:TaskParms) => {
    const { scope, context, context: { oracleSourceSchemas=[] }, dmsVpc, dmsEndpoints, dmsVpcRole, replicationSubnetGroupId } = parms;
    const { FULL_LOAD, CDC, FULL_LOAD_AND_CDC } = MigrationTypeValue;

    if(oracleSourceSchemas.length == 0) {
      throw new Error('No source schemas specified for standard tasks');
    }

    this.serverlessConfigs.push(new DmsConfig({
      id: FULL_LOAD,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: FULL_LOAD,
      replicationSubnetGroupId,
      tableMapping: new TableMapping()
        .includeSchemas(oracleSourceSchemas)
        .excludeTable('KCOEUS', 'BU_TEMP_%')
        .lowerCaseTargetTableNames()
    } as DmsConfigProps));

    this.serverlessConfigs.push(new DmsConfig({
      id: FULL_LOAD_AND_CDC,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: FULL_LOAD_AND_CDC,
      replicationSubnetGroupId,
      tableMapping: new TableMapping()
        .includeSchemas(oracleSourceSchemas)
        .excludeTable('KCOEUS', 'BU_TEMP_%')
        .lowerCaseTargetTableNames()
    } as DmsConfigProps));

    this.serverlessConfigs.push(new DmsConfig({
      id: CDC,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: CDC,
      replicationSubnetGroupId,
      tableMapping: new TableMapping()
        .includeSchemas(oracleSourceSchemas)
        .excludeTable('KCOEUS', 'BU_TEMP_%')
        .lowerCaseTargetTableNames()
    } as DmsConfigProps));

    if( ! dmsVpcRole) return;

    // Make sure the VPC role is created BEFORE each of the configurations.
    this.serverlessConfigs.forEach(config => {
      config.config.node.addDependency(dmsVpcRole);
    });
  }

  /**
   * Define one or more serverless configurations. Tasks are not visible and officially are not part of the 
   * serverless terminology, but there is a task running behind the scenes somewhere and it is based 
   * configuration(s) defined here. There are several defined here, and you can add more - they do not cost 
   * anything unless they are run.
   * @param parms 
   */
  private createServerlessTasks = (parms:TaskParms) => {
    const { dmsVpcRole, scope } = parms;
    const { createServerlessSmokeTestTasks, createServerlessTask } = this;

    new class extends Construct {
      constructor(scope: Construct, id: string, parms: TaskParms) {
        super(scope, id);
        const { dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId } = parms;
        const nestTaskParms = { scope:this, dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId } as TaskParms;

        new class extends Construct {
          constructor(scope: Construct, id: string, parms: TaskParms) {
            super(scope, id);
            const { dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId } = parms;
            const nestTaskParms = { scope:this, dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId } as TaskParms;
            createServerlessSmokeTestTasks(nestTaskParms);
          }
        }(this, 'smoketest-tasks', nestTaskParms);
        
        new class extends Construct {
          constructor(scope: Construct, id: string, parms: TaskParms) {
            super(scope, id);
            const { dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId } = parms;
            const nestTaskParms = { scope:this, dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId } as TaskParms;
            createServerlessTask(nestTaskParms);
          }
        }(this, 'standard-tasks', nestTaskParms);
      }
    }(scope, 'serverless-tasks', parms);

    if( ! dmsVpcRole) return;

    // Make sure the VPC role is created BEFORE each of the configurations.
    this.serverlessConfigs.forEach(config => {
      config.config.node.addDependency(dmsVpcRole);
    });
  }

  /**
   * Define a task and "provision" a DMS replication instance for it to run on.
   * @param parms 
   */
  private createProvisionedTask = (parms:TaskParms) => {
    const { 
      scope, context, context: { oracleTestTables }, dmsVpc, dmsEndpoints, dmsVpcRole, replicationSubnetGroupId 
    } = parms;
    this.dmsTask = new DmsTask({
      id: 'replication-task-full-load-and-cdc',
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: 'full-load-and-cdc',
      tableMapping: TableMapping
        .includeTestTables(oracleTestTables)
        .excludeTable('KCOEUS', 'BU_TEMP_%')
        .lowerCaseTargetTableNames(),
      replicationSubnetGroupId,
      instanceClass: 'dms.t3.medium',
      allocatedStorage: 50
    } as DmsConfigProps);

    if( ! dmsVpcRole) return;

    this.dmsTask.node.addDependency(dmsVpcRole);
  }

  public get fullLoadConfigArn():string|undefined {
    const { serverlessConfigs } = this;
    const { FULL_LOAD } = MigrationTypeValue;
    // The correct config will be the one who id matches its replication type.
    return serverlessConfigs.find(config => config.replicationType === FULL_LOAD && config.id === FULL_LOAD)?.configArn;
  }
  public get cdcOnlyConfigArn():string|undefined {
    const { serverlessConfigs } = this;
    const { CDC } = MigrationTypeValue;
    // The correct config will be the one who id matches its replication type.
    return serverlessConfigs.find(config => config.replicationType === CDC && config.id === CDC)?.configArn;
  }
  public get fullLoadAndCdcConfigArn():string|undefined {
    const { serverlessConfigs } = this;
    const { FULL_LOAD_AND_CDC } = MigrationTypeValue;
    // The correct config will be the one who id matches its replication type.
    return serverlessConfigs.find(config => config.replicationType === FULL_LOAD_AND_CDC && config.id === FULL_LOAD_AND_CDC)?.configArn;
  }
}