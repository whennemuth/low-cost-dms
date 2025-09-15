import { ServerlessReplicationSettings as defaultSettings } from "./default";

/**
 * By default, replication settings are derived from ./default.ts, which where suitable for an
 * oracle source database. If you want to customize the settings, create a file named
 * custom.js in this directory that exports a ServerlessReplicationSettings object. This file
 * will be imported dynamically when this function is called.
 * 
 * export const ServerlessReplicationSettings = {
 *   ... your settings here ...
 * }
 * @returns 
 */
export const getReplicationSettings = async (postgresSchema?: string): Promise<any> => {

  const setControlSchema = (settings:any): Object => {
    if(postgresSchema) {
      settings.ControlTablesSettings = {
        ...settings.ControlTablesSettings,
        ControlSchema: postgresSchema.toLowerCase()
      };
    }
    return settings;
  }

  let coreSettings:any;
  try {
    // @ts-ignore
    coreSettings = await import('./custom.js');
    return setControlSchema(coreSettings.ServerlessReplicationSettings);
  } 
  catch (error) {
    return setControlSchema(defaultSettings);
  }

}