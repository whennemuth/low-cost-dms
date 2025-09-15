import { CloudFormationClient, DescribeStackResourcesCommand } from "@aws-sdk/client-cloudformation";
import { Stack, StackProps } from 'aws-cdk-lib';
import { CfnReplicationSubnetGroup } from "aws-cdk-lib/aws-dms";
import { Peer, Port, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Construct } from "constructs";
import { IContext } from "../context/IContext";
import { DmsEndpoints } from "./Endpoint";
import { PostgresTarget } from './PostgresTarget';
import { VpcRole } from './Role';
import { Tasks } from './Tasks';
import { DmsVpc } from "./Vpc";
import { StartStopLambdas } from "./lambda/Lambda";


export type KualiDmsStackProps = StackProps & {
  scope: Construct;
  id: string;
  context: IContext;
  createVpcRole: boolean;
  createRdsTarget?: boolean;
  updateRdsTarget?: boolean;
  rdsSecurityGroupId?: string;
}

export class KualiDmsStack extends Stack {
  constructor(props: KualiDmsStackProps) {
    super(props.scope, props.id, props);

    // Get the context (contains all app parameters)
    // const context = this.node.getContext('stack-parms') as IContext;

    const { context, 
      context: { postgresHost, postgresPort, stack: { prefix=()=>'undefined' } = {} }, 
      createVpcRole, createRdsTarget=false, updateRdsTarget=false, rdsSecurityGroupId 
    } = props;

    // Create the VPC role if needed
    let dmsVpcRole = createVpcRole ? new VpcRole(this, 'vpc-role', context) : undefined;

    // Create or use an existing VPC
    const dmsVpc = new DmsVpc(this, 'vpc', context);

    // Ensure role is created before VPC
    if(dmsVpcRole) dmsVpc.node.addDependency(dmsVpcRole);

    // Handle creating or updating of the target database
    let postgresTarget: PostgresTarget | undefined;
    if(createRdsTarget || updateRdsTarget) {
      // This stack owns the target database, so it is creatable or updatable
      postgresTarget = new PostgresTarget(this, 'database-target', { dmsVpc, context });
    }
    else if(rdsSecurityGroupId) {
      // This stack does not own the target database, but it must be added an ingress rule to its sg for DMS
      const importedSg = SecurityGroup.fromSecurityGroupId(this, 'imported-target-database-sg', rdsSecurityGroupId);
      importedSg.addIngressRule(
        Peer.securityGroupId(dmsVpc.sg.securityGroupId),
        Port.tcp(postgresPort),
        'Allow DMS replication access'
      );
    }
    else if(postgresHost) {
      console.log(`The target postgres database, ${postgresHost}, is not an RDS database`);
    }
    else {
      throw new Error('Cannot determine target Postgres database!');
    }

    // Create DMS endpoints
    const dmsEndpoints = new DmsEndpoints({ 
      stack: this, 
      id: 'endpoints', 
      context, 
      targetRdsHost: postgresTarget?.dbInstanceEndpointAddress 
    });

    // Ensure VPC is created before endpoints
    if(dmsVpcRole) dmsEndpoints.node.addDependency(dmsVpcRole);
      
    // Ensure Postgres target is created before endpoints that reference it.
    if(postgresTarget) dmsEndpoints.node.addDependency(postgresTarget.dbInstance);

    // Create the replication subnet group using public subnets
    const replicationSubnetGroupId = new CfnReplicationSubnetGroup(this, `replication-subnet-group`, {
      replicationSubnetGroupDescription: `${prefix()}-subnet-group`,
      replicationSubnetGroupIdentifier: `${prefix()}-subnet-group`,
      subnetIds: dmsVpc.privateSubnetIds,
    }).ref;

    // Create tasks with replication instances to run on, or the serverless configuration(s) equivalent.
    const tasks = new Tasks({ 
      scope:this, context, dmsVpc, dmsEndpoints, dmsVpcRole, replicationSubnetGroupId 
    });

    // Add an ingress rule to the source database for the DMS replication service.
    const { oracleSecurityGroupId:dbSecurityGroupId="", oraclePort } = context;
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'source-database-sg', dbSecurityGroupId);
    dbSecurityGroup.addIngressRule(
      Peer.securityGroupId(dmsVpc.sg.securityGroupId),
      Port.tcp(oraclePort),
      'Allow DMS replication access'
    );    

    const dmsLambdaFunctions = new StartStopLambdas({
      scope: this, id: 'lambda', context, dmsVpc, dmsEndpoints, replicationSubnetGroupId
    });
  }

  public static getName(context: IContext): string|undefined {
    return context.stack?.prefix()
  }

  /**
   * Checks if a CloudFormation stack contains an RDS DB instance with the given identifier.
   * @param stackNameOrId The CloudFormation stack name or ID.
   * @param dbInstanceId The RDS DB instance identifier to look for.
   * @returns Promise<boolean> true if the stack contains the RDS resource, false otherwise.
   */
  public static stackHasRdsInstance = async (stackNameOrId: string, dbInstanceId: string): Promise<boolean> => {
    const cfClient = new CloudFormationClient({});
    try {
      const result = await cfClient.send(
      new DescribeStackResourcesCommand({ StackName: stackNameOrId })
      );
      if (!result.StackResources) return false;
      return result.StackResources.some(
      r =>
        r.ResourceType === "AWS::RDS::DBInstance" &&
        r.PhysicalResourceId === dbInstanceId
      );
    } 
    catch (error: any) {
      if (error.name === "ValidationError" && error.message?.includes("does not exist")) {
        return false;
      }
      throw error;
    }
  }
}
