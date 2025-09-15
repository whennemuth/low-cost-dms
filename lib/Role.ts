import { CfnRole, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { IContext } from "../context/IContext";
import { GetRoleCommand, IAMClient } from "@aws-sdk/client-iam";
import { RemovalPolicy } from "aws-cdk-lib";

/** The name of the role, recognized account-wide */
export const DMS_VPC_ROLE_NAME = 'dms-vpc-role';

/**
 * Represents the IAM role for the DMS VPC. This role is not specific to any particular stack
 * as only one should be created per account (the name "dms-vpc-role" is globally unique at the account level)
 */
export class VpcRole extends Construct {
  private _role: Role;

  constructor(scope: Construct, id: string, context: IContext ) {
    super(scope, id);

    const { stack: { prefix=()=>'undefined', Account, Region } = {} } = context;

    this._role = new Role(this, `${prefix()}-${id}`, { 
      roleName: DMS_VPC_ROLE_NAME, 
      assumedBy: new ServicePrincipal('dms.amazonaws.com'), 
      managedPolicies: [        
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonDMSVPCManagementRole'),
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonDMSCloudWatchLogsRole')
      ],
      inlinePolicies: {
        SecretsManagerAccess: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['secretsmanager:GetSecretValue'],
              resources: [`arn:aws:secretsmanager:${Region}:${Account}:secret:*`],
            }),
          ],
        }),
      },
    });

    // Make sure the role survives stack deletion.
    const cfnRole = this._role.node.defaultChild as CfnRole;
    cfnRole.applyRemovalPolicy(RemovalPolicy.RETAIN);
  }

  public static exists = async (): Promise<boolean> => {
    const client = new IAMClient({});
    try {
      await client.send(new GetRoleCommand({ RoleName: DMS_VPC_ROLE_NAME }));
      return true;
    } 
    catch (err: any) {
      if (err.name === "NoSuchEntityException") {
        return false;
      }
      throw err; // Other error
    }
  }

  public static doesNotExist = async (): Promise<boolean> => {
    return !(await VpcRole.exists());
  }
};
