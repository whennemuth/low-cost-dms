import { IpAddresses, IVpc, SecurityGroup, SubnetType, Vpc, VpcProps } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { IContext } from "../context/IContext";

/**
 * Build the VPC and security group for DMS.
 */
export class DmsVpc extends Construct {
  private _vpc:IVpc;
  private _sg:SecurityGroup;
  private _privateSubnetIds:string[] = [];

  constructor(scope: Construct, id: string, context:IContext) {
    super(scope, id);

    let { 
      stack: { prefix=()=>'undefined' } = {}, 
      sourceDbVpcId, sourceDbSubnetIds:privateSubnetIds=[]
    } = context;

    /**
     * Get the subnet IDs for a specific subnet type.
     * @param subnetIdFilter The list of subnet IDs to filter.
     * @param subnetType The type of subnet to select.
     * @returns The filtered list of subnet IDs.
     */
    const getSubnetIds = (subnetIdFilter:string[], subnetType:SubnetType):string[] => {
      const filteredSubnets = this._vpc.selectSubnets({ subnetType })
        .subnets
        .map(subnet => subnetIdFilter.includes(subnet.subnetId) ? subnet.subnetId : '')
        .filter(id => id); // Filter out any empty strings

      if(filteredSubnets.length === 0) {
        throw new Error(`None of the specified ${subnetType} subnets ${subnetIdFilter.join(', ')} found in the VPC ${this.vpc.vpcId}`);
      }
      else {
        console.log(`Using existing VPC ${this.vpc.vpcId} with subnets: ${filteredSubnets.join(', ')}`);
      }
      return filteredSubnets;
    }
    
    // We are using an existing VPC and subnets.
    if(sourceDbVpcId) {
      this._vpc = Vpc.fromLookup(this, `${prefix()}-${id}-vpc`, { vpcId: sourceDbVpcId });
      this.privateSubnetIds.push(...getSubnetIds(privateSubnetIds, SubnetType.PRIVATE_WITH_EGRESS));
    }

    // We are creating a new VPC and subnets.
    else {
      this._vpc = new Vpc(this, `${prefix()}-${id}`, {
        maxAzs: 2,
        vpcName: `${prefix()}-vpc`,
        ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      } as  VpcProps);
      privateSubnetIds = this._vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS }).subnetIds;
    }

    // Create the Security Group
    this._sg = new SecurityGroup(this, `${prefix()}-${id}-sg`, {
      securityGroupName: `${prefix()}-vpc-sg`,
      vpc: this._vpc,
      description: 'Allow DMS to connect to target PostgreSQL in company network',
    });

    // Don't need ingress rules because DMS replication egresses only, and the databases have ingress 
    // that allows access from services that run under this security group
    // this._sg.addIngressRule(Peer.ipv4(this._vpc.vpcCidrBlock), Port.tcp(sourceDbPort), `Allow access from VPC on port ${sourceDbPort}`);
    // this._sg.addIngressRule(Peer.ipv4(this._vpc.vpcCidrBlock), Port.tcp(postgresPort), `Allow access from VPC on port ${postgresPort}`);

    // // Restrict egress to the specified PostgreSQL CIDR
    // this._sg.addEgressRule(
    //   Peer.ipv4(postgresCidr),
    //   Port.tcp(postgresPort), // PostgreSQL port (typically 5432)
    // );
  }

  public get vpc(): IVpc {
    return this._vpc;
  }
  public get sg(): SecurityGroup {
    return this._sg;
  }
  public get privateSubnetIds(): string[] {
    return this._privateSubnetIds;
  }
}
