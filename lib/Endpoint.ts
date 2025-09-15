import { CfnEndpoint, CfnEndpointProps } from "aws-cdk-lib/aws-dms";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { IContext } from "../context/IContext";

export enum DmsEndpointEngineName {
  oracle = 'oracle',
  postgres = 'postgres',
  mysql = 'mysql',
  sqlserver = 'sqlserver',
  mariadb = 'mariadb',
  aurora = 'aurora',
  aurora_postgresql = 'aurora-postgresql',
  redshift = 'redshift',
  s3 = 's3',
  db2 = 'db2',
  azuredb = 'azuredb',
  sybase = 'sybase',
  dynamodb = 'dynamodb',
  mongodb = 'mongodb',
  kinesis = 'kinesis',
  kafka = 'kafka',
  elasticsearch = 'elasticsearch',
  docdb = 'docdb',
  neptune = 'neptune',
  opensearch = 'opensearch',
  redshift_serverless = 'redshift-serverless'
};

export type DmsEndpointsProps = {
  stack: Construct, id: string, engineName:DmsEndpointEngineName , context:IContext, targetRdsHost?:string
};


/**
 * Build the DMS source and target endpoints.
 */
export class DmsEndpoints extends Construct {
  private _sourceEndpoint: CfnEndpoint;
  private _targetEndpoint: CfnEndpoint;

  constructor(props: DmsEndpointsProps) {
    super(props.stack, props.id);

    const { context, id, engineName, targetRdsHost } = props;

    let { 
      stack: { prefix=()=>'undefined' } = {},
      sourceDbHost, sourceDbPort, sourceDbUser, sourceDbPassword, sourceDbSecretName,
      postgresDbName, postgresHost, postgresPort, postgresUser, postgresPassword, postgresSecretName
    } = context;

    if(targetRdsHost) {
      postgresHost = targetRdsHost;
    }

    let sourceDbSecret: ISecret | undefined;
    const getSourceDbSecret = (name: string):string => {
      if( ! sourceDbSecret) {
        sourceDbSecret = Secret.fromSecretNameV2(this, `${prefix()}-${id}-source-db-secret`, sourceDbSecretName!);
      }
      return sourceDbSecret.secretValueFromJson(name).unsafeUnwrap().toString();
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
      engineName,
      serverName: sourceDbHost,
      port: sourceDbPort,
      password: sourceDbPassword || getSourceDbSecret(sourceDbUser || 'DMS_USER'),
      username: sourceDbUser || 'DMS_USER',
      databaseName: 'KUALI', // Default source database name, adjust if needed 
    } as CfnEndpointProps;

    this._sourceEndpoint = new CfnEndpoint(this, `${prefix()}-${id}-source`, sourceProps);

    const targetProps = {
      endpointIdentifier: `${prefix()}-target-endpoint`,
      endpointType: 'target',
      engineName: DmsEndpointEngineName.postgres,
      serverName: postgresHost,
      port: postgresPort,
      databaseName: postgresDbName,
      username: postgresUser || getPostgresSecret('username'),
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
