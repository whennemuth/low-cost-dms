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

  constructor() {
    this._rules = [];
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

  private addLowercaseTransformRule = (schemaName: string): TableMapping => {
    const newRule: Rule = {
      "rule-type": "transformation",
      "rule-id": `${this._rules.length + 1}`,
      "rule-name": `lowercase-schema-${schemaName}`,
      "rule-target": "schema",
      "object-locator": {
        "schema-name": schemaName
      },
      "rule-action": "rename",
      "value": schemaName.toLowerCase()
    };
    this._rules.push(newRule);
    return this;
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

    // Add lowercase transformation rules for target schema names
    if (this._lowercaseTargetSchemaNames) {
      const schemaNames = Array.from(new Set(this._rules.map(rule => rule['object-locator']['schema-name'])));      
      schemaNames.forEach(schemaName => {
        if( ! this._rules.some((rule:Rule) => {
          // Add the rule only if it has not been already. 
          return (
            rule['rule-action'] === 'rename' && 
            rule['object-locator']['schema-name'] === schemaName &&
            rule['rule-target'] === 'schema' &&
            rule['value'] === schemaName.toLowerCase()
          );
        })) {
          this.addLowercaseTransformRule(schemaName);
        }
      });
    }

    // Return the rules
    return { rules: this._rules };
  }

  public toString = (): string => {
    return JSON.stringify(this.toJSON(), null, 2);
  }

  public toFlatString = (): string => {
    return JSON.stringify(this.toJSON());
  }


  public static includeTestTables = (testTables: DatabaseTable[] = [], ruleName?: string): TableMapping => {
    if(testTables.length === 0) {
      throw new Error('No test tables provided for TableMapping.includeTestTables()');
    }
    ruleName = ruleName || 'include-test-tables';
    let mapping = new TableMapping();
    testTables.forEach(table => {
      const { schemaName, tableNames } = table;
      tableNames.forEach(tableName => {
        mapping.includeTable(schemaName, tableName, `${ruleName}-${schemaName}-${tableName}`);
      });
    });
    return mapping;
  }
}


const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/TableMappings.ts')) {

  console.log(new TableMapping().toJSON());

  console.log(TableMapping.includeTestTables([{ schemaName: 'KCOEUS', tableNames: ['DMS_SMOKE_TEST'] }]).toString());

  console.log(new TableMapping()
    .includeSchema('public', 'IncludePublicSchema')
    .includeTable('public', 'users', 'IncludeUsersTable')
    .excludeTable('public', 'sensitive_%')
    .toString());

  console.log(new TableMapping()
    .includeTable('KCOEUS', 'DMS_SMOKE_TEST')
    .lowerCaseTargetTableNames().toString());

  console.log(new TableMapping()
    .includeSchema('KCOEUS', 'all-kuali-tables')
    .lowerCaseTargetTableNames().toString());

  
}