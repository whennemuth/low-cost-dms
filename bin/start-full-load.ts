import { MigrationTypeValue } from "@aws-sdk/client-database-migration-service";
import { IContext } from "../context/IContext";
import { startReplication } from "../lib/lambda/StartReplicationHandler";

console.log(JSON.stringify(process.argv));

/**
 * @returns A custom duration in minutes a replication is expected to take and will be used 
 * override the default configured CdcStopTime.
 */
const getCustomDuration = (): number | undefined => {
  const args = process.argv.slice(2);
  const duration = args[0];
  for(const arg of args) {
    if( /^\d+$/.test(arg)) {
      return parseInt(arg);
    }
    else if(arg.toLowerCase() !== 'smoketest') {
      throw new Error(`Invalid argument: ${arg}. Must be a positive integer or 'smoketest'`);
    }
  }
  return undefined;
}

/**
 * 
 * @returns True if the 'smoketest' argument is passed to the script. This will indicate that 
 */
const isSmokeTest = (): boolean => {
  const args = process.argv.slice(2);
  for(const arg of args) {
    if(arg.toLowerCase() === 'smoketest') {
      return true;
    }
  }
  return false;
}

(async () => {
  const context:IContext = await require('../context/context.json');
  await startReplication({
    context, 
    ReplicationType: MigrationTypeValue.FULL_LOAD_AND_CDC, 
    customDurationMinutes: getCustomDuration(),
    isSmokeTest: isSmokeTest()
  });
})();