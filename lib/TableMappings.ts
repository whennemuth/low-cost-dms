import { DatabaseTable } from "../context/IContext";


export type Rule = {
  "rule-type": string;
  "rule-id": string;
  "rule-name": string;
  "rule-target"?: string;
  "object-locator": {
    "schema-name": string;
    "table-name"?: string;
  };
  "rule-action": string;
  "value"?: string;
}

/**
 * TableMapping class to define DMS table mappings for replication tasks.
 * It allows inclusion and exclusion of schemas and tables with custom rule names.
 */
export class TableMapping {
  private _rules: Rule[];
  private _lowercaseTargetSchemaNames: boolean = false;
  private _schemaMap: Map<string, string> = new Map();

  constructor(schemaMap: Map<string, string> = new Map()) {
    this._rules = [];
    this._schemaMap = schemaMap;
  }

  private addSchemaRule = (schemaName: string, action: 'exclude' | 'include', ruleName?: string): TableMapping => {
    if (!ruleName) {
      ruleName = `${action === 'include' ? 'Include' : 'Exclude'}Schema-${schemaName}`;
    }
    const newRule: Rule = {
      "rule-type": "selection",
      "rule-id": `${this._rules.length + 1}`,
      "rule-name": ruleName,
      "object-locator": {
        "schema-name": schemaName,
        "table-name": "%",
      },
      "rule-action": action,
    }
    this._rules.push(newRule);
    return this;
  }

  private addTableRule = (schemaName: string, tableName: string, action: 'exclude' | 'include', ruleName?: string): TableMapping => {
    if (!ruleName) {
      ruleName = `${action === 'include' ? 'include' : 'exclude-'}table-${schemaName}-${tableName}`;
    }
    const newRule: Rule = {
      "rule-type": "selection",
      "rule-id": `${this._rules.length + 1}`,
      "rule-name": ruleName,
      "object-locator": {
        "schema-name": schemaName,
        "table-name": tableName,
      },
      "rule-action": action,
    };
    this._rules.push(newRule);
    return this;
  }

  private addSchemaRenameRule = (schemaName: string, newSchemaName: string): TableMapping => {
    const newRule: Rule = {
      "rule-type": "transformation",
      "rule-id": `${this._rules.length + 1}`,
      "rule-name": `rename-schema-${schemaName}-to-${newSchemaName}`,
      "rule-target": "schema",
      "object-locator": {
        "schema-name": schemaName
      },
      "rule-action": "rename",
      "value": newSchemaName
    };
    this._rules.push(newRule);
    return this;
  }

  private addLowercaseTransformRule = (schemaName: string): TableMapping => {
    return this.addSchemaRenameRule(schemaName, schemaName.toLowerCase());
  }

  private addSchemaRules = (schemaNames: string[], action: 'exclude' | 'include'): TableMapping => {
    schemaNames.forEach(schemaName => {
      this.addSchemaRule(schemaName, action);
    });
    return this;
  }

  private addTableRules = (schemaName: string, tableNames: string[], action: 'exclude' | 'include'): TableMapping => {
    tableNames.forEach(tableName => {
      this.addTableRule(schemaName, tableName, action);
    });
    return this;
  }

  public includeSchema = (schemaName: string, ruleName?: string): TableMapping => {
    return this.addSchemaRule(schemaName, 'include', ruleName);
  }

  public includeSchemas = (schemaNames: string[]): TableMapping => {
    return this.addSchemaRules(schemaNames, 'include');
  }

  public excludeSchema = (schemaName: string, ruleName?: string): TableMapping => {
    return this.addSchemaRule(schemaName, 'exclude', ruleName);
  }

  public excludeSchemas = (schemaNames: string[]): TableMapping => {
    return this.addSchemaRules(schemaNames, 'exclude');
  }

  public excludeTable = (schemaName: string, tableName: string, ruleName?: string): TableMapping => {
    return this.addTableRule(schemaName, tableName, 'exclude', ruleName);
  }

  public excludeTables = (schemaName: string, tableNames: string[]): TableMapping => {
    return this.addTableRules(schemaName, tableNames, 'exclude');
  }

  public includeTable = (schemaName: string, tableName: string, ruleName?: string): TableMapping => {
    return this.addTableRule(schemaName, tableName, 'include', ruleName);
  }

  public includeTables = (schemaName: string, tableNames: string[]): TableMapping => {
    return this.addTableRules(schemaName, tableNames, 'include');
  }

  public lowerCaseTargetTableNames = (): TableMapping => {
    this._lowercaseTargetSchemaNames = true;
    return this;
  }

  public toJSON = (): Object => {
    // Add a default rule if none exist
    if (this._rules.length === 0) {
      const defaultRule: Rule = {
        "rule-type": "selection",
        "rule-id": "1",
        "rule-name": "AllSchemasAllTables",
        "object-locator": {
          "schema-name": "%",
          "table-name": "%",
        },
        "rule-action": "include",
      };
      this._rules.push(defaultRule);
    }

    // Add renaming or lowercasing transformation rules for target schema names
    const schemaNames = Array.from(new Set(this._rules.map(rule => rule['object-locator']['schema-name'])));      
    schemaNames.forEach(sourceSchemaName => {
      if(this._schemaMap.has(sourceSchemaName)) {
        let targetSchemaName = this._schemaMap.get(sourceSchemaName);
        if(this._lowercaseTargetSchemaNames) {
          targetSchemaName = targetSchemaName?.toLowerCase();
        }
        if(targetSchemaName && ! this._rules.some((rule:Rule) => {
          // Add the rule only if it has not been already. 
          return (
            rule['rule-action'] === 'rename' && 
            rule['object-locator']['schema-name'] === sourceSchemaName &&
            rule['rule-target'] === 'schema' &&
            rule['value'] === targetSchemaName
          );
        })) {
          this.addSchemaRenameRule(sourceSchemaName, targetSchemaName);
        }
      }
      else if(this._lowercaseTargetSchemaNames && ! this._rules.some((rule:Rule) => {
        // Add the rule only if it has not been already. 
        return (
          rule['rule-action'] === 'rename' && 
          rule['object-locator']['schema-name'] === sourceSchemaName &&
          rule['rule-target'] === 'schema' &&
          rule['value'] === sourceSchemaName.toLowerCase()
        );
      })) {
        this.addLowercaseTransformRule(sourceSchemaName);
      }
    });

    // Return the rules
    return { rules: this._rules };
  }

  public toString = (): string => {
    return JSON.stringify(this.toJSON(), null, 2);
  }

  public toFlatString = (): string => {
    return JSON.stringify(this.toJSON());
  }

  public static includeTestTables = (parms:TestTablesParms): TableMapping => {
    let { testTables=[], ruleName, schemaMap=new Map() } = parms;
    if(testTables.length === 0) {
      throw new Error('No test tables provided for TableMapping.includeTestTables()');
    }
    ruleName = ruleName || 'include-test-tables';
    let mapping = new TableMapping(schemaMap);
    testTables.forEach(table => {
      const { schemaName, tableNames } = table;
      tableNames.forEach(tableName => {
        mapping.includeTable(schemaName, tableName, `${ruleName}-${schemaName}-${tableName}`);
      });
    });
    return mapping;
  }
}

export type TestTablesParms = {
  testTables?: DatabaseTable[];
  ruleName?: string;
  schemaMap?: Map<string, string>
}


const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/TableMappings.ts')) {

  console.log(new TableMapping().toJSON());

  const schemaMap = new Map([['KCOEUS', 'kuali_raw'], ['PUBLIC', 'public']]);

  console.log(TableMapping.includeTestTables({
    schemaMap, testTables: [{ schemaName: 'KCOEUS', tableNames: ['DMS_SMOKE_TEST'] }]
  }).toString());

  console.log(new TableMapping()
    .includeSchema('public', 'IncludePublicSchema')
    .includeTable('public', 'users', 'IncludeUsersTable')
    .excludeTable('public', 'sensitive_%')
    .toString());

  console.log(new TableMapping()
    .includeTable('KCOEUS', 'DMS_SMOKE_TEST')
    .lowerCaseTargetTableNames()
    .toString());

  console.log(new TableMapping(schemaMap)
    .includeSchema('KCOEUS', 'all-source-tables')
    .lowerCaseTargetTableNames()
    .toString());
}