# Configuration

Apart from database passwords, all configuration for the stack is defined in `./context/context.json`.

The purpose of most properties is evident in the name. However, supplementary explanation as follows:

- **stack.Tags:** All resources created will automatically be tagged with the 3 tags set here.
- **scheduleRateHours:** In an effort to reduce costs, CDC will not be left running, but will only be re-engaged at a set interval and stop after a specific period of time. This is performed by a lambda function triggered by an eventbridge rule configured with this interval setting.
- **oracleSubnetIds:** The IDs of subnets that the source Oracle database operates in.
- **postgresInstanceSize:** It is assumed that you are testing and want to create a PostGres RDS database in the same subnet as the source Oracle database to simplify connectivity and network access. This setting is optional, but if set, will trigger the creation of a small RDS instance for PostGres.
- **postgresInstanceIngress:** Comes into play if **postgresInstanceSize** is set. The items in this listing are used to configure the ingress rules for the target PostGres database.
- **postgresPassword:** The password for the target PostGres database. Can only be used if the PostGres database is NOT hosted by the RDS service *(ie: resides on campus)*. Nonetheless, use of this property is discouraged in favor of secrets manager, and is only intended if your PostGres database is being hosted on your machine *(localhost)*.
  IMPORTANT: These must be public subnets (have routes to an internet gateway), else the DMS service will not be able to communicate with secrets manager to acquire database passwords.

**Example config:**

```
{
  "stack": {
    "Id": "kuali-dms",
    "Account": "770203350335",
    "Region": "us-east-1",
    "Tags": {
      "Service": "research-administration",
      "Function": "kuali",
      "Landscape": "stg"
    }
  },
  "scheduleRateHours": 24,
  "publicSubnetIds": [
  	"subnet-07afd7c2e54376dd0",
  	"subnet-03034a40da92d6d08"
  ],
  
  "oracleHost": "stg.db.kualitest.research.bu.edu",
  "oraclePort": 1521,
  "oracleUser": "DMS_USER",
  "oraclePassword": "",
  "oracleSecretName": "kuali/stg/kuali-oracle-rds-app-password",
  "oracleSecurityGroupId": "sg-0b8b04f9cf045f812",
  "oracleVpcId": "vpc-0290de1785982a52f",

  "postgresPort": 5432,
  "postgresDbName": "kuali_db",
  "postgresSchema": "kl_user",
  "postgresPassword": "",
  "postgresInstanceSize": "small",
  "postgresSecretName": "kuali/stg/kuali-postgres-credentials",
  "postgresInstanceIngress": [
    { "cidr": "168.122.78.128/28", "description": "dbreport vpn: offcampus" },
    { "cidr": "168.122.84.240/28", "description": "dbreport vpn: oncampus" },
    { "cidr": "168.122.81.0/24", "description": "CampusVpnCidr one" },
    { "cidr": "168.122.82.0/23", "description": "CampusVpnCidr two" },
    { "cidr": "168.122.76.0/24", "description": "CampusVpnCidr three" },
    { "cidr": "168.122.68.0/24", "description": "CampusVpnCidr four" },
    { "cidr": "168.122.69.0/24", "description": "CampusVpnCidr five" },
    { "cidr": "10.1.0.0/21", "description": "CampusVpnCidr six" }
  ]
}
```

