import { Construct } from "constructs";
import { IContext } from "../context/IContext";
import { DmsTask } from "./ConfigProvisioned";
import { DmsConfig, DmsConfigProps } from "./ConfigServerless";
import { DmsEndpoints } from "./Endpoint";
import { VpcRole } from "./Role";
import { TableMapping } from "./TableMappings";
import { DmsVpc } from "./Vpc";
import { MigrationTypeValue } from "@aws-sdk/client-database-migration-service";

export enum TaskType { SERVERLESS, PROVISIONED, BOTH };

export type TaskParms = {
  scope: Construct,
  context: IContext,
  dmsVpc: DmsVpc,
  dmsEndpoints: DmsEndpoints,
  dmsVpcRole?: VpcRole,
  replicationSubnetGroupId: string,
  taskType: TaskType
}

/**
 * FOR TESTING PURPOSES: 
 * (replication configurations are dynamically created during the normal operation of this app).
 *
 * Pre-define replication for tasks, either as serverless configurations, or as standard tasks with replication instances
 * to run them on.
 */
export class Tasks {
  private serverlessConfigs: DmsConfig[] = [];
  private dmsTask?: DmsTask;
  private schemaMap: Map<string, string> = new Map();

  public static getInstance = async (parms:TaskParms): Promise<Tasks> => {
    const tasks = new Tasks();
    const { SERVERLESS, PROVISIONED, BOTH } = TaskType;
    const { sourceDbSchemas = [], postgresSchema } = parms.context;
    if(sourceDbSchemas.length > 0 && postgresSchema) {
      // Map the first source schema to the target schema
      tasks.schemaMap.set(sourceDbSchemas[0], postgresSchema);
    }

    switch(parms.taskType) {
      case SERVERLESS:
        await tasks.createServerlessTasks(parms);
        break;
      case PROVISIONED:
        await tasks.createProvisionedTask(parms);
        break;
      case BOTH:
        await tasks.createServerlessTasks(parms);
        await tasks.createProvisionedTask(parms);
        break;
      default:
        throw new Error(`Invalid task type: ${parms.taskType}`);
    } 

    return tasks;
  }

  private createServerlessSmokeTestTasks = async (parms:TaskParms): Promise<void> => {
    const { scope, context, context: { sourceDbTestTables=[] }, dmsVpc, dmsEndpoints, replicationSubnetGroupId } = parms;
    const { FULL_LOAD, CDC, FULL_LOAD_AND_CDC } = MigrationTypeValue;
    const { schemaMap } = this;
    const tableMapping = TableMapping
      .includeTestTables({ schemaMap, testTables:sourceDbTestTables })
      .lowerCaseTargetTableNames();

    // Create a "smoke test" replication config for testing connectivity and pre-migration assessment without any actual data migration
    this.serverlessConfigs.push(await DmsConfig.getInstance({
      id: `${FULL_LOAD}-smoke-test`,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: FULL_LOAD,
      replicationSubnetGroupId,
      tableMapping
    } as DmsConfigProps));

    // Create a "smoke test" replication config for testing connectivity and pre-migration assessment without any actual data migration
    this.serverlessConfigs.push(await DmsConfig.getInstance({
      id: `${FULL_LOAD_AND_CDC}-smoke-test`,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: FULL_LOAD_AND_CDC,
      replicationSubnetGroupId,
      tableMapping
    } as DmsConfigProps));

    // Create a "smoke test" replication config for testing connectivity and pre-migration assessment without any actual data migration
    this.serverlessConfigs.push(await DmsConfig.getInstance({
      id: `${CDC}-smoke-test`,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: CDC,
      replicationSubnetGroupId,
      tableMapping
    } as DmsConfigProps));
  }

  private createServerlessTask = async (parms:TaskParms): Promise<void> => {
    const { scope, context, context: { sourceDbSchemas=[] }, dmsVpc, dmsEndpoints, dmsVpcRole, replicationSubnetGroupId } = parms;
    const { FULL_LOAD, CDC, FULL_LOAD_AND_CDC } = MigrationTypeValue;
    const { schemaMap } = this;

    if(sourceDbSchemas.length == 0) {
      throw new Error('No source schemas specified for standard tasks');
    }

    this.serverlessConfigs.push(await DmsConfig.getInstance({
      id: FULL_LOAD,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: FULL_LOAD,
      replicationSubnetGroupId,
      tableMapping: new TableMapping(schemaMap)
        .includeSchemas(sourceDbSchemas)
        .excludeTable('KCOEUS', 'BU_TEMP_%')
        .lowerCaseTargetTableNames()
    } as DmsConfigProps));

    this.serverlessConfigs.push(await DmsConfig.getInstance({
      id: FULL_LOAD_AND_CDC,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: FULL_LOAD_AND_CDC,
      replicationSubnetGroupId,
      tableMapping: new TableMapping(schemaMap)
        .includeSchemas(sourceDbSchemas)
        .excludeTable('KCOEUS', 'BU_TEMP_%')
        .lowerCaseTargetTableNames()
    } as DmsConfigProps));

    this.serverlessConfigs.push(await DmsConfig.getInstance({
      id: CDC,
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: CDC,
      replicationSubnetGroupId,
      tableMapping: new TableMapping(schemaMap)
        .includeSchemas(sourceDbSchemas)
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
  private createServerlessTasks = async (parms:TaskParms) => {
    const { dmsVpcRole, scope } = parms;
    const { createServerlessSmokeTestTasks, createServerlessTask } = this;

    new class extends Construct {
      constructor(scope: Construct, id: string, parms: TaskParms) {
        super(scope, id);
        const { dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId } = parms;
        const nestTaskParms = { 
          taskType: TaskType.SERVERLESS,
          scope:this, dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId 
        } as TaskParms;

        new class extends Construct {
          constructor(scope: Construct, id: string, parms: TaskParms) {
            super(scope, id);
            const { dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId } = parms;
            const nestTaskParms = { 
              taskType: TaskType.SERVERLESS,
              scope:this, dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId 
            } as TaskParms;
            createServerlessSmokeTestTasks(nestTaskParms);
          }
        }(this, 'smoketest-tasks', nestTaskParms);
        
        new class extends Construct {
          constructor(scope: Construct, id: string, parms: TaskParms) {
            super(scope, id);
            const { dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId } = parms;
            const nestTaskParms = { 
              taskType: TaskType.SERVERLESS,
              scope:this, dmsVpcRole, context, dmsVpc, dmsEndpoints, replicationSubnetGroupId 
            } as TaskParms;
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
  private createProvisionedTask = async (parms:TaskParms) => {
    const { 
      scope, context, context: { sourceDbTestTables }, dmsVpc, dmsEndpoints, dmsVpcRole, replicationSubnetGroupId 
    } = parms;
    const { schemaMap } = this;

    const tableMapping = TableMapping
      .includeTestTables({ schemaMap, testTables: sourceDbTestTables })
      .lowerCaseTargetTableNames();

    this.dmsTask = await DmsTask.getInstance({
      id: 'replication-task-full-load-and-cdc',
      scope, context, dmsVpc, dmsEndpoints,
      replicationType: 'full-load-and-cdc',
      tableMapping,
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