import { MigrationTypeValue } from "@aws-sdk/client-database-migration-service";
import { getReplicationSettings } from "../replication-settings/ReplicationSetting";
import { TableMapping } from "../TableMappings";
import { AbstractReplicationToCreate, runTestHarness } from "./AbstractReplicationToCreate";
import { ReplicationCreateEnvironmentVariables } from "./ReplicationEnvironment";

/**
 * Create a replication configuration for serverless DMS replications.
 */
export class ReplicationToCreate extends AbstractReplicationToCreate {

  constructor(createEnvVars?:ReplicationCreateEnvironmentVariables) {
    super(createEnvVars);
  }

  /**
   * @returns Replication settings that take into account the largest LOB size in the source database.
   */
  protected getReplicationSettings = async (): Promise<any> => {
    const { largestSourceLobKb:LobMaxSize=0, postgresSchema } = this._createEnvVars;
    const coreSettings = await getReplicationSettings(postgresSchema)
    const replicationSettings = Object.assign({}, coreSettings);
    if(LobMaxSize > 0) {
      replicationSettings.TargetMetadata = {
        ...replicationSettings.TargetMetadata,
        LobMaxSize
      };
    }
    return replicationSettings; 
  }
  
  /**
   * @returns A table mapping that includes all tables in the specified source schemas and lower-cases the target table names.
   */
  protected getTableMapping = (): TableMapping => {
    const { sourceDbSchemas:schemas, postgresSchema } = this._createEnvVars;
    const sourceDbSchemas = schemas ? JSON.parse(schemas) : [];
    if(sourceDbSchemas.length == 0) {
      throw new Error('No source schemas specified');
    }

    // TODO: Mapping only the first source schema to the target schema for now, but this should be extended to a full mapping
    let schemaMap: Map<string, string> = new Map();
    if(postgresSchema) {
      schemaMap.set(sourceDbSchemas[0], postgresSchema);
    }
    return new TableMapping(schemaMap)
      .includeSchemas(sourceDbSchemas)
      .lowerCaseTargetTableNames()
  }
}


/**
 * RUN MANUALLY:
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/ReplicationToCreate.ts')) {

  (async () => {
    await runTestHarness({
      replicationToCreate: new ReplicationToCreate(),
      migrationType: MigrationTypeValue.CDC,
      dryrun: false
    })
  })();
}