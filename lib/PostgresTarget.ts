import { DBInstance, DescribeDBInstancesCommand, DescribeDBInstancesCommandOutput, RDSClient } from "@aws-sdk/client-rds";
import { CfnOutput } from "aws-cdk-lib";
import { InstanceClass, InstanceType, Peer, Port, SecurityGroup, SubnetFilter } from "aws-cdk-lib/aws-ec2";
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, DatabaseInstanceProps } from "aws-cdk-lib/aws-rds";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { IContext } from "../context/IContext";
import { DmsVpc } from "./Vpc";

export type PostgresTargetProps = {
  dmsVpc: DmsVpc;
  context: IContext
}

export type RdsInstanceProps = {
  hostName?:string, securityGroupId?:string, port?:number
}

/**
 * Set up a small Postgres RDS instance for use as a test target for DMS trial runs.
 */
export class PostgresTarget extends Construct {
  private _dbInstance: DatabaseInstance;
  private _securityGroup: SecurityGroup;

  constructor(stack: Construct, id: string, props: PostgresTargetProps) {
    super(stack, id);

    // Destructure the properties
    let { 
      dmsVpc, dmsVpc: { vpc, privateSubnetIds }, context,
      context: { postgresInstanceSize, postgresSecretName, postgresInstanceIngress=[], postgresPort, postgresDbName,
      stack: { prefix=()=>'undefined' } = {} } 
    } = props;

    // Make sure instance size is valid
    if(postgresInstanceSize && /[^a-z]/g.test(postgresInstanceSize.toString())) {
      throw new Error(`Invalid postgresInstanceSize: ${postgresInstanceSize}. Must be one of: micro, small, medium, large, xlarge, 2xlarge`);
    }

    // Get the credentials
    const postgresSecret:ISecret = Secret.fromSecretNameV2(this, `${prefix()}-${id}-postgres-secret`, postgresSecretName!);
    const credentials = Credentials.fromSecret(postgresSecret);

    // Create a security group for the Postgres instance
    this._securityGroup = new SecurityGroup(this, "postgres-sg", {
      vpc,
      securityGroupName: `${prefix()}-${id}-sg`,
      description: "Allow access to Postgres RDS instance",
      allowAllOutbound: true,
    });
    // Add an ingress rule to the Postgres instance for the DMS replication service.
    this._securityGroup.addIngressRule(
      Peer.securityGroupId(dmsVpc.sg.securityGroupId),
      Port.tcp(postgresPort),
      'Allow DMS replication access'
    );
    // Add ingress rules for the Postgres instance for allowed subnets (campus, vpn)
    postgresInstanceIngress.forEach(ingress => {
      this._securityGroup.addIngressRule(Peer.ipv4(ingress.cidr), Port.tcp(postgresPort), ingress.description);
    });

    // Define a Postgres RDS instance here
    this._dbInstance = new DatabaseInstance(this, "postgres-instance", {
      engine: DatabaseInstanceEngine.POSTGRES,
      instanceType: InstanceType.of(InstanceClass.BURSTABLE3, postgresInstanceSize!),
      databaseName: postgresDbName,
      instanceIdentifier: PostgresTarget.getIdentifier(context),  
      allocatedStorage: 120, // Minimum storage for Postgres
      multiAz: false,
      securityGroups: [ this._securityGroup ],
      vpc,
      vpcSubnets: {
        subnetFilters: [
          SubnetFilter.byIds(privateSubnetIds)
        ]
      },
      credentials,
      port: 5432,
    } as DatabaseInstanceProps);

    // Output the instance address
    new CfnOutput(this, "PostgresInstanceEndpoint", {
      value: this._dbInstance.dbInstanceEndpointAddress,
    });
  }

  public get dbInstance(): DatabaseInstance {
    return this._dbInstance;
  }
  public get securityGroupId(): string {
    return this._securityGroup.securityGroupId;
  }
  public get dbInstanceEndpointAddress(): string {
    return this._dbInstance.dbInstanceEndpointAddress;
  }

  public static getIdentifier(context:IContext): string {
    const { stack: { prefix=()=>'undefined' } = {} } = context;
    if(prefix() === 'undefined') {
      // throw error
      throw new Error('Stack prefix is undefined');
    }
    return `${prefix()}-postgres`;
  }

  public static getRdsInstanceProps = async (context: IContext): Promise<RdsInstanceProps> => {
    const client = new RDSClient({});
    try {
      const response = await client.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: PostgresTarget.getIdentifier(context) }));
      if (response.DBInstances && response.DBInstances.length > 0) {
        const { Endpoint: { Address:hostName, Port:port } = {}, VpcSecurityGroups = [] } = response.DBInstances[0];
        const securityGroupId = VpcSecurityGroups[0]?.VpcSecurityGroupId;
        if(hostName) console.log(`Postgres RDS instance found: ${hostName}`);
        return { hostName, securityGroupId, port };
      }
      return {} as RdsInstanceProps;
    } 
    catch (err: any) {
      if (err.name.startsWith("DBInstanceNotFound")) {
        return {} as RdsInstanceProps;
      }
      throw err; // Rethrow other errors
    }
  }

  /**
   * Finds an RDS instance whose endpoint address matches the given host name.
   * @param hostName The endpoint address to match.
   * @returns Promise<DBInstance | undefined> The matching DBInstance object, or undefined if not found.
   */
  public static getRdsInstanceByHostName = async (hostName: string): Promise<DBInstance | undefined> =>{
    const client = new RDSClient({});
    let marker: string | undefined = undefined;

    do {
      const response = await client.send(new DescribeDBInstancesCommand({ Marker: marker })) as DescribeDBInstancesCommandOutput;
      for (const db of response.DBInstances ?? []) {
        if (db.Endpoint?.Address === hostName) {
          return db;
        }
      }
      marker = response.Marker;
    } while (marker);

    return undefined;
  }

  public static isRdsInstance(hostname: string): boolean {
    return hostname.endsWith(".rds.amazonaws.com");
  }
}