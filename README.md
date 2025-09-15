# frugal DMS RDS-to-Postgres

This is a CDK project to build DMS serverless resources for scheduled replication from a source RDS instance to a target Postgres database.

**Operation:** When the CDK project is deployed *(cloud-formed)*, the overall replication process involves an initial full data load, followed by a separate brief CDC *(change data capture)* process. The CDC process is run on a Cron schedule, every 24 hours for example, "picking up" where the last scheduled CDC run "left off" to perform "catch up" replication.

**Use case:** If migration needs require that data at the target be near real-time with the source, one would leave the migration running indefinitely in CDC mode after a full load. However, it can often be the case that this is not necessary, and a certain amount of "lag time" in the target data would make little or no difference to the business case of the replication. In that scenario, if a tolerable lag time were 24 hours for example, and CDC catchup processing only takes around 30 minutes, there would be 23 hours and 30 minutes worth of runtime costs that would be unnecessary. With the traditional provisioned DMS, one could configure replications to run only at designated times, but the provisioned [Replication Instances](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_ReplicationInstance.html) remain and impose [on demand pricing and storage costs](https://aws.amazon.com/dms/pricing/).

**Purpose:** The idea behind running serverless CDC on a schedule is to provide a cost-effective alternative to starting a serverless CDC process and leaving it running indefinitely. Since serverless DMS imposes a cost for running CDC continuously, it is little better than running the traditional non-serverless provisioned alternative - neither scenario allows for any "downtime" where no "idling" costs are being incurred.

**"Gaming the system":** If one were to simply configure a serverless CDC operation to stop itself at a certain time, the replication would indeed stop, BUT [AWS DMS DCU hourly pricing](https://aws.amazon.com/dms/pricing/) continues and could potentially remain so indefinitely unless a 48 hour period of inactivity expires - in which case, the underlying resources are deprovisioned. This is a little known fact about DMS Serverless that one finds out the hard way - serverless is not really "serverless", it's just that the server provisioning is abstracted out of sight.
In order to circumvent this, when the CDC replication has reached a stopped state, the configuration upon which it was based must be [deleted](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/database-migration-service/command/DeleteReplicationConfigCommand/) and later [recreated](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/database-migration-service/command/CreateReplicationConfigCommand) when a new replication needs to be [started](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/database-migration-service/command/StartReplicationCommand). Deprovisioning of the underlying resources is forced by the deletion of the configuration.
This is core theme behind this stack and is facilitated by [EventBridge Scheduler](https://docs.aws.amazon.com/eventbridge/latest/userguide/using-eventbridge-scheduler.html).

## Steps

The following steps can be run from a local console. Since some of the steps require use of the AWS CLI, make sure you [configure your environment](https://docs.aws.amazon.com/cli/v1/userguide/cli-configure-envvars.html) accordingly with a user that has admin access to the target AWS account.
Alternatively, you can start a [cloud-shell](https://aws.amazon.com/cloudshell/) session as that admin user.

- **Clone this repo**

- Install the app

   ```
   npm install
   ```

- [**Create the service linked role**](https://docs.aws.amazon.com/dms/latest/userguide/slr-services-sl.html#create-slr-sl) for the DMS service if it does not already exist:

   ```
   aws iam create-service-linked-role --aws-service-name dms.amazonaws.com
   ```

- **Configure the source Database**
   AWS Database Migration Service (AWS DMS) can use many of the most popular data engines as a source for data replication.
   Each requires the creation of a DMS user, application of grants, log retention updates, and activation of redo log permissions.
   Here are 3 common ones:

   - [Oracle](./docs/oracle.md)
   - [Mysql](./docs/mysql.md)
   - [SqlServer](./docs/sqlserver.md)

- **Configuration for stack creation/update**
   The ./context/context.json file contains all configuration for the building and/or updating the Serverless DMS stack.

- **Perform a quick test**
   Confirm a yaml-based CloudFormation template can be synthesized:

   ```
   npm run synth
   ```

   You should see the yaml file appear in the `./cdk.out` directory
