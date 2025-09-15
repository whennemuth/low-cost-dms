import { CfnEndpoint, CfnEndpointProps } from "aws-cdk-lib/aws-dms";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { IContext } from "../context/IContext";

export type DmsEndpointsProps = {
  stack: Construct, id: string, context:IContext, targetRdsHost?:string
};

/**
 * Build the DMS source and target endpoints.
 */
export class DmsEndpoints extends Construct {
  private _sourceEndpoint: CfnEndpoint;
  private _targetEndpoint: CfnEndpoint;

  constructor(props: DmsEndpointsProps) {
    super(props.stack, props.id);

    const { context, id, targetRdsHost } = props;

    let { 
      stack: { prefix=()=>'undefined' } = {},
      oracleHost, oraclePort, oracleUser, oraclePassword, oracleSecretName,
      postgresDbName, postgresHost, postgresPort, postgresSchema, postgresPassword, postgresSecretName
    } = context;

    if(targetRdsHost) {
      postgresHost = targetRdsHost;
    }

    let oracleSecret: ISecret | undefined;
    const getOracleSecret = (name: string):string => {
      if( ! oracleSecret) {
        oracleSecret = Secret.fromSecretNameV2(this, `${prefix()}-${id}-oracle-secret`, oracleSecretName!);
      }
      return oracleSecret.secretValueFromJson(name).unsafeUnwrap().toString();
    }

    let postgresSecret: ISecret | undefined;
    const getPostgresSecret = (name: string):string => {
      if( ! postgresSecret) {
        postgresSecret = Secret.fromSecretNameV2(this, `${prefix()}-${id}-postgres-secret`, postgresSecretName!);
      }
      return postgresSecret.secretValueFromJson(name).unsafeUnwrap().toString();
    }
 
    const sourceProps = {
      endpointIdentifier: `${prefix()}-source-endpoint`,
      endpointType: 'source',
      engineName: 'oracle',
      serverName: oracleHost,
      port: oraclePort,
      password: oraclePassword || getOracleSecret(oracleUser || 'DMS_USER'),
      username: oracleUser || 'DMS_USER',
      databaseName: 'KUALI', // Default Oracle database name, adjust if needed 
    } as CfnEndpointProps;

    this._sourceEndpoint = new CfnEndpoint(this, `${prefix()}-${id}-source`, sourceProps);

    const targetProps = {
      endpointIdentifier: `${prefix()}-target-endpoint`,
      endpointType: 'target',
      engineName: 'postgres',
      serverName: postgresHost,
      port: postgresPort,
      databaseName: postgresDbName,
      username: postgresSchema || getPostgresSecret('username'),
      password: postgresPassword || getPostgresSecret('password'),
      sslMode: 'require'
    } as CfnEndpointProps;

    this._targetEndpoint = new CfnEndpoint(this, `${prefix()}-${id}-target`, targetProps);   
  }

  public get sourceEndpointArn(): string {
    return this._sourceEndpoint.ref;
  }
  public get targetEndpointArn(): string {
    return this._targetEndpoint.ref;
  }
}
