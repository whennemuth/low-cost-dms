import { CronExpression, CronExpressionParser } from 'cron-parser';

// *    *    *    *    *    *
// ┬    ┬    ┬    ┬    ┬    ┬
// │    │    │    │    │    │
// │    │    │    │    │    └─ day of week (0-7, 1L-7L) (0 or 7 is Sun)
// │    │    │    │    └────── month (1-12, JAN-DEC)
// │    │    │    └─────────── day of month (1-31, L)
// │    │    └──────────────── hour (0-23)
// │    └───────────────────── minute (0-59)
// └────────────────────────── second (0-59, optional)
// 
// More at: https://www.npmjs.com/package/cron-parser

/**
 * Utility class to work with cron expressions.
 */
export class Cron {
  private expression: CronExpression;

  constructor(expressionString: string, localTimezone?: string) {
    if(localTimezone) {
      this.expression = CronExpressionParser.parse(expressionString, { tz: localTimezone });
    } 
    else {
      this.expression = CronExpressionParser.parse(expressionString);
    }
  }

  public get nextOccurrence(): Date {
    return this.expression.next().toDate();
  }

  public get previousOccurrence(): Date {
    return this.expression.prev().toDate();
  }

  public get millisToNextOccurrence(): number {
    const now = new Date();
    const next = this.nextOccurrence;
    return next.getTime() - now.getTime();
  }

  public getSecondsToNextOccurrence = (): number =>  Math.round(this.millisToNextOccurrence / 1000);

  public getMinutesToNextOccurrence = (): number =>  Math.round(this.millisToNextOccurrence / (1000 * 60));

  public getHoursToNextOccurrence = (): number =>  Math.round(this.millisToNextOccurrence / (1000 * 60 * 60));

  public getDaysToNextOccurrence = (): number =>  Math.round(this.millisToNextOccurrence / (1000 * 60 * 60 * 24));

  public static dailyAtTimeExpression = (hour: number, minute: number=0, second: number=0): string => {
    if(hour < 0 || hour > 23) throw new Error('Hour must be between 0 and 23');
    if(minute < 0 || minute > 59) throw new Error('Minute must be between 0 and 59');
    if(second < 0 || second > 59) throw new Error('Second must be between 0 and 59');
    return `${second} ${minute} ${hour} * * *`;
  }

  public static dailyAtHourExpression = (hour: number): string => {
    if(hour < 0 || hour > 23) throw new Error('Hour must be between 0 and 23');
    return `0 0 ${hour} * * *`;
  }
}



/**
 * TEST HARNESS
 */
const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/Cron.ts')) {

  (async () => {

    // Get 2AM next occurrence for EST
    console.log('Next occurrence:', new Cron('0 2 * * *', 'America/New_York').nextOccurrence);

    // Get 2AM EST next occurence as UTC
    console.log('Next occurrence:', new Cron('0 2 * * *', 'America/New_York').nextOccurrence.toISOString());

    console.log('Next occurrence:', new Cron('0 * * * *').nextOccurrence);

  })();
}
