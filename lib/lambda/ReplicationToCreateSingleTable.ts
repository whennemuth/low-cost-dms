import { MigrationTypeValue } from "@aws-sdk/client-database-migration-service";
import { getReplicationSettings } from "../replication-settings/ReplicationSetting";
import { TableMapping, TestTablesParms } from "../TableMappings";
import { AbstractReplicationToCreate, runTestHarness } from "./AbstractReplicationToCreate";
import { ReplicationCreateEnvironmentVariables } from "./ReplicationEnvironment";

/**
 * Create a replication configuration for serverless DMS replications.
 */
export class ReplicationToCreateSingleTable extends AbstractReplicationToCreate {

  constructor(createEnvVars?:ReplicationCreateEnvironmentVariables) {
    super(createEnvVars);
  }

  /**
   * @returns Replication settings that take into account the largest LOB size in the source database.
   */
  protected getReplicationSettings = (): Promise<any> => {
    const { postgresSchema } = this._createEnvVars;
    return getReplicationSettings(postgresSchema);
  }
  
  /**
   * @returns A table mapping that includes only one table in the specified source schema and lower-cases the target table names.
   */
  protected getTableMapping = (): TableMapping => {
    const { sourceTestTables:tables, sourceDbSchemas, postgresSchema } = this._createEnvVars;
    const sourceDbTestTables = tables ? JSON.parse(tables) : [];
    if(sourceDbTestTables.length == 0) {
      throw new Error('No test table(s) specified');
    }

    // TODO: Mapping only the first source schema to the target schema for now, but this should be extended to a full mapping
    let schemaMap: Map<string, string> = new Map();
    if(postgresSchema) {
      schemaMap.set(sourceDbSchemas[0], postgresSchema);
    }

    return TableMapping
      .includeTestTables({ schemaMap, testTables: sourceDbTestTables } satisfies TestTablesParms)
      .lowerCaseTargetTableNames();
  }
}


/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/ReplicationToCreateSingleTable.ts')) {

  (async () => {
    await runTestHarness({
      replicationToCreate: new ReplicationToCreateSingleTable(),
      migrationType: MigrationTypeValue.CDC,
      dryrun: false
    })
  })();
}