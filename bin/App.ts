#!/usr/bin/env node
import { App, StackProps, Tags } from 'aws-cdk-lib';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { Context } from '../context/context.ts';
import { PostgresTarget } from '../lib/PostgresTarget.ts';
import { VpcRole } from '../lib/Role.ts';
import { FrugalDmsStack } from '../lib/Stack.ts';

// Load environment variables from .env file if it exists
// This allows local development to override context.json values
// and use environment variables for sensitive data like passwords.
const dbEnvPath = path.resolve(__dirname, '../docker/.env');
if (fs.existsSync(dbEnvPath)) {
  dotenv.config({ path: dbEnvPath });
}

const rootEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

const context = new Context();
export const StackDescription = 'Raw RDS to PostgreSQL migration using AWS DMS';
const app = new App();

// Get the stack parameters from the context
app.node.setContext('stack-parms', context);
const { stack: { Id, Account, Region, Tags: { Service, Function, Landscape } = {} } = {} } = context;

// Validate the context parameters for the stack
if(!Id || !Account || !Region || !Service || !Function || !Landscape) {
  throw new Error('Missing one of required context parameters: Id, Account, Region, Service, Function, Landscape');
}

// Set the stack properties
const stackProps: StackProps = {
  stackName: FrugalDmsStack.getName(context),
  description: StackDescription,
  env: { account:Account, region: Region },
  tags: { Service, Function, Landscape }
};

(async () => {

  // Create the vpc role if it does not already exist
  const createVpcRole = await VpcRole.doesNotExist();

  const { postgresInstanceSize, postgresHost, postgresPort } = context;
  let createRdsTarget:boolean = false;
  let updateRdsTarget:boolean = false;
  let rdsSecurityGroupId:string | undefined;

  if(!postgresHost && !postgresInstanceSize) {
    throw new Error('Either postgresHost or postgresInstanceSize must be defined');
  }

  if(postgresHost && postgresInstanceSize) {
    throw new Error('Both postgresHost and postgresInstanceSize are defined - they are mutually exclusive');
  }
 
  if(postgresHost) {
    // postgresHost represents the hostname of a db that already exists and was not created by this stack
    if(postgresHost.endsWith(".rds.amazonaws.com")) {
      const rdsInstance = await PostgresTarget.getRdsInstanceByHostName(postgresHost); // Perform lookup
      if(!rdsInstance) {
        // TODO: What if it exists in another account?
        throw new Error(`No RDS instance found with host name: ${postgresHost}`);
      }
      const { VpcSecurityGroups=[], Endpoint: { Port } = {} } = rdsInstance;
      if(VpcSecurityGroups.length === 0) {
        throw new Error(`RDS instance with host name ${postgresHost} has no associated security groups`);
      }
      if(Port && Port !== postgresPort) {
        console.warn(`RDS instance with host name ${postgresHost} has port ${Port} but expected ${postgresPort}`);
        context.postgresPort = Port;
      }
      rdsSecurityGroupId = VpcSecurityGroups[0].VpcSecurityGroupId;
      if(!rdsSecurityGroupId) {
        throw new Error(`RDS instance with host name ${postgresHost} has no associated security group`);
      }
    }
  }
  else if(await FrugalDmsStack.stackHasRdsInstance(context.stack.Id, PostgresTarget.getIdentifier(context))) {
    // This stack already exists and "owns" an RDS instance, which means we must be performing an update.
    updateRdsTarget = true;
  }
  else {
    createRdsTarget = true;
  }

  // Define the stack properties
  const dmsStackProps = Object.assign({}, stackProps, {
    id:'FrugalDmsStack', scope: app, context, createVpcRole, createRdsTarget, updateRdsTarget, rdsSecurityGroupId
  });

  /**
   * Instantiate the FrugalDmsStack.
   * This stack will create the necessary AWS resources for DMS operations,
   * including VPC, security groups, DMS replication instance, and endpoints.
   */
  const stack = await FrugalDmsStack.getInstance(dmsStackProps);

  // Adding tags into the stackProps does not seem to work - have to apply tags using aspects:
  Tags.of(stack).add('Service', Service);
  Tags.of(stack).add('Function', Function);
  Tags.of(stack).add('Landscape', Landscape);

})();