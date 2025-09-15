# Oracle as a source RDS database

The following are steps to prepare an oracle database for access by DMS as the source of replications with CDC *(Change data capture)*.
The related AWS documentation is [here](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Source.Oracle.html).

1. **Create a "DMS_USER"** in the source oracle database with privileges and configurations needed when using an AWS-managed Oracle database with AWS DMS. Related AWS documentation is [here](https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Source.Oracle.html#CHAP_Source.Oracle.Amazon-Managed.Privileges).

   ```
   CREATE USER DMS_USER
       IDENTIFIED BY "user_password"
       DEFAULT TABLESPACE KUALI_DATA
       TEMPORARY TABLESPACE TEMP
       PROFILE DEFAULT;
   
   GRANT CREATE SESSION TO DMS_USER;
   GRANT SELECT ANY TRANSACTION TO DMS_USER;
   GRANT SELECT on DBA_TABLESPACES TO DMS_USER;
   GRANT ALTER ANY TABLE TO DMS_USER;
   GRANT SELECT ANY TABLE TO DMS_USER;
   GRANT EXECUTE on rdsadmin.rdsadmin_util TO DMS_USER;
   GRANT LOGMINING TO DMS_USER;
   GRANT SELECT_CATALOG_ROLE TO DMS_USER;
   GRANT SELECT ANY DICTIONARY TO DMS_USER;
   GRANT UNLIMITED TABLESPACE TO DMS_USER;
   
   exec rdsadmin.rdsadmin_util.alter_supplemental_logging('ADD');
   exec rdsadmin.rdsadmin_util.alter_supplemental_logging('ADD','PRIMARY KEY');
   
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_VIEWS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_TAB_PARTITIONS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_INDEXES', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_OBJECTS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_TABLES', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_USERS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_CATALOG', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_CONSTRAINTS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_CONS_COLUMNS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_TAB_COLS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_IND_COLUMNS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_LOG_GROUPS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$ARCHIVED_LOG', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$LOG', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$LOGFILE', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$DATABASE', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$THREAD', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$PARAMETER', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$NLS_PARAMETERS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$TIMEZONE_NAMES', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$TRANSACTION', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$CONTAINERS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('DBA_REGISTRY', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('OBJ$', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('ALL_ENCRYPTED_COLUMNS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$LOGMNR_LOGS', 'DMS_USER', 'SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$LOGMNR_CONTENTS','DMS_USER','SELECT');
   exec rdsadmin.rdsadmin_util.grant_sys_object('DBMS_LOGMNR', 'DMS_USER', 'EXECUTE');
   
   -- (as of Oracle versions 12.1 and higher)
   exec rdsadmin.rdsadmin_util.grant_sys_object('REGISTRY$SQLPATCH', 'DMS_USER', 'SELECT');
   
   -- (for Amazon RDS Active Dataguard Standby (ADG))
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$STANDBY_LOG', 'DMS_USER', 'SELECT'); 
   
   -- (for transparent data encryption (TDE))
   
   exec rdsadmin.rdsadmin_util.grant_sys_object('ENC$', 'DMS_USER', 'SELECT'); 
                  
   -- (for validation with LOB columns)
   exec rdsadmin.rdsadmin_util.grant_sys_object('DBMS_CRYPTO', 'DMS_USER', 'EXECUTE');
                       
   -- (for binary reader)
   exec rdsadmin.rdsadmin_util.grant_sys_object('DBA_DIRECTORIES','DMS_USER','SELECT'); 
                       
   -- Required when the source database is Oracle Data guard, and Oracle Standby is used in the latest release of DMS version 3.4.6, version 3.4.7, and higher.
   
   exec rdsadmin.rdsadmin_util.grant_sys_object('V_$DATAGUARD_STATS', 'DMS_USER', 'SELECT');
   ```

2. **Create a "AWSDMS_DBLINK" database link**

   ```
   CREATE PUBLIC DATABASE LINK AWSDMS_DBLINK 
      CONNECT TO DMS_USER IDENTIFIED BY "x3BMiRKy.TYBNP3T"
      USING '(DESCRIPTION=
               (ADDRESS=(PROTOCOL=TCP)(HOST=kuali-oracle-stg.clb9d4mkglfd.us-east-1.rds.amazonaws.com)(PORT=1521))
               (CONNECT_DATA=(SERVICE_NAME=KUALI))
             )';
   ```

   Test connectivity with:

   ```
   select 1 from dual@AWSDMS_DBLINK
   ```

3. **Determine the largest LOB field value** expected from the source database
   The DMS replication will be configured to set LOB size limit to a value you specify in Kilobytes.
   Setting a correct value means getting an idea of what the largest LOB field in the source database currently is.
   A script for determining this for an oracle schema is as follows:

   ```
   SET SERVEROUTPUT ON SIZE UNLIMITED
   DECLARE
       TYPE maxlob_rec IS RECORD (
           table_name    VARCHAR2(128),
           column_name   VARCHAR2(128),
           max_length    NUMBER
       );
       TYPE maxlob_tab IS TABLE OF maxlob_rec;
       l_max_lobs maxlob_tab := maxlob_tab();
       
       l_sql VARCHAR2(4000);
       l_max_len NUMBER;
       
       -- Simple bubble sort procedure to sort our collection
       PROCEDURE sort_max_lobs IS
           l_temp maxlob_rec;
           l_swapped BOOLEAN := TRUE;
       BEGIN
           -- Basic bubble sort algorithm
           WHILE l_swapped LOOP
               l_swapped := FALSE;
               FOR i IN 1..l_max_lobs.COUNT - 1 LOOP
                   IF l_max_lobs(i).max_length < l_max_lobs(i + 1).max_length THEN
                       l_temp := l_max_lobs(i);
                       l_max_lobs(i) := l_max_lobs(i + 1);
                       l_max_lobs(i + 1) := l_temp;
                       l_swapped := TRUE;
                   END IF;
               END LOOP;
           END LOOP;
       END sort_max_lobs;
       
   BEGIN
       DBMS_OUTPUT.PUT_LINE('Starting analysis of CLOB columns...');
       
       -- Use a cursor to loop through all CLOB columns
       FOR clob_rec IN (
           SELECT owner, table_name, column_name
           FROM all_tab_columns
           WHERE data_type = 'CLOB'
           AND owner = 'KCOEUS'  -- <<< REPLACE 'KCOEUS' WITH YOUR SCHEMA NAME
           AND table_name NOT LIKE 'BIN$%' -- Exclude tables in the recycle bin
           ORDER BY owner, table_name, column_name
       ) LOOP
           
           -- Dynamically build and execute the query to get the max length for this specific column
           l_sql := 'SELECT MAX(DBMS_LOB.GETLENGTH("' || clob_rec.column_name || '")) FROM "' || clob_rec.owner || '"."' || clob_rec.table_name || '"';
           
           BEGIN
               EXECUTE IMMEDIATE l_sql INTO l_max_len;
               
               -- If the table has data and the max length is not NULL, add to our collection
               IF l_max_len IS NOT NULL THEN
                   l_max_lobs.EXTEND;
                   l_max_lobs(l_max_lobs.LAST) := maxlob_rec(clob_rec.table_name, clob_rec.column_name, l_max_len);
               END IF;
               
           EXCEPTION
               WHEN OTHERS THEN
                   -- Handle errors for a specific table (e.g., no select privileges, table does not exist)
                   DBMS_OUTPUT.PUT_LINE('Error processing ' || clob_rec.owner || '.' || clob_rec.table_name || '.' || clob_rec.column_name || ': ' || SQLERRM);
           END;
       END LOOP;
       
       -- Sort the collection by max_length descending using our PL/SQL procedure
       sort_max_lobs;
       
       -- Print the results
       DBMS_OUTPUT.PUT_LINE('Found ' || l_max_lobs.COUNT || ' CLOB columns with data.');
       DBMS_OUTPUT.PUT_LINE('-------------------------------------------------------');
       DBMS_OUTPUT.PUT_LINE('TOP CLOB SIZES BY TABLE:');
       DBMS_OUTPUT.PUT_LINE('Rank | Table Name                    | Column Name               | Max Length (Bytes)');
       DBMS_OUTPUT.PUT_LINE('-----|-------------------------------|---------------------------|-------------------');
       
       FOR i IN 1..LEAST(l_max_lobs.COUNT, 50) -- Show top 50 results
       LOOP
           DBMS_OUTPUT.PUT_LINE(
               RPAD(LPAD(i, 3), 5) || '| ' ||
               RPAD(l_max_lobs(i).table_name, 30) || '| ' ||
               RPAD(l_max_lobs(i).column_name, 25) || '| ' ||
               LPAD(TO_CHAR(l_max_lobs(i).max_length, '999,999,999'), 18)
           );
       END LOOP;
       
   EXCEPTION
       WHEN OTHERS THEN
           DBMS_OUTPUT.PUT_LINE('A high-level error occurred: ' || SQLERRM);
   END;
   /
   ```

   Take the highest value in the result set (will be at the top), add about 10% extra buffer room, and convert to Kilobytes.
   This will be the value you set on the `"sourceDbLargestLobKB"` property of the `context/context.json` file.
   If you set this value correctly, there should be no truncation of LOB fields at the target database.

4. **Set the redo log retention** appropriately:
   The redo log retention for the source oracle database must be sufficient so that the logs go back as far as will accommodate the `"scheduleRateHours"` value that you set for the scheduled CDC "catchup" runs.
   For example, if you set scheduleRateHours to 24 hours, then the redo log entries must last for at least 24 hours, and it is probably wise to set some buffer room.

   - **Inspect current log depth:** To get a rough idea as to how far back your source database redo logs go back query the database to get the earliest log entries. For oracle such a query looks like this:

     ```
     SELECT 
       TO_CHAR(MIN(FIRST_TIME) + INTERVAL '5' MINUTE, 'YYYY-MM-DD"T"HH24:MI:SS') as safe_earliest_time,
       MIN(FIRST_CHANGE#) + 1000 as safe_earliest_scn
     FROM V$ARCHIVED_LOG 
     WHERE NAME IS NOT NULL 
     AND STATUS = 'A'
     AND DELETED = 'NO';
     ```

   - **[Increase storage](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIOPS.ModifyingExisting.html):** If you need to do so, increasing the redo log retention will almost certainly result in an increase in database storage requirements. To accommodate this increase if current storage is not enough, either increase the "Storage" in GB of the "Primary Storage" column of the "Configuration" view of the RDS dashboard for the instance, and/or turn on **[Storage Autoscaling](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIOPS.Autoscaling.html)**. If you are not going to use storage autoscaling, the following will give you a clue as to how much storage you may need by displaying how much was output in the last 48 hours:

     ```
     # Set "X" to 48
     SELECT SUM(BLOCKS * BLOCK_SIZE) bytes 
     FROM V$ARCHIVED_LOG
     WHERE FIRST_TIME >= SYSDATE-(X/24) AND DEST_ID=1;
     ```

   - **[Set archive log retention](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.Oracle.CommonDBATasks.RetainRedoLogs.html):** Use the following for an Oracle RDS instance to set the log retention to 48 hours:

     ```
     begin
         rdsadmin.rdsadmin_util.set_configuration(
             name  => 'archivelog retention hours',
             value => '48');
     end;
     /
     commit;
     ```

   

