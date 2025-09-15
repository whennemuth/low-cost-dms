import exp = require("constants");
import { humanReadableFromMilliseconds } from "./DurationConverter";


export enum PeriodType {
  MILLISECONDS=1, SECONDS=1000, MINUTES=60000, HOURS=3600000, DAYS=86400000, WEEKS=604800000
}

/**
 * A simple class for converting a specified number of human readable intervals (hours, days, etc) to a
 * date object that represents the point in time reached if one waits for those intervals to pass.
 */
export class EggTimer {
  private _expirationDate:Date;
  private _milliseconds:number;

  /**
   * Factory method for getting an egg timer instance.
   * @param periods 
   * @param periodType 
   * @param offsetDate Prior date that specifies a point in the past to indicate as the starting point of the 
   * egg timer "countdown". This way the timer starts its "countdown" already partially elapsed. Useful if
   * you want one egg timer instance to "take over" for another one.  
   * @returns 
   */
  public static getInstanceSetFor = (periods:number, periodType:PeriodType, offsetDate?:Date):EggTimer => {
    const millisecondsNow = offsetDate ? offsetDate.getTime() : Date.now();
    const millisecondsDelay = periods * periodType;
    const timer = new EggTimer(new Date(millisecondsNow + millisecondsDelay));
    return timer;
  }

  constructor(expirationDate:Date) {
    this._expirationDate = expirationDate;
    this._milliseconds = expirationDate.getTime() - Date.now();
  }

  /**
   * @returns The date of the timer expiration
   */
  public get expirationDate ():Date {
    return this._expirationDate;
  }

  /**
   * Cron expressions derived from the expiration date are only accurate to the minute and will be rounded down.
   * Therefore, it is possible to issue a schedule for a point in time that has already passed. To avoid this, 
   * the cron will be baseed on a "safe" expiration date that is adjusted forward by one or two minutes it would
   * result in a cron expression that is in the past or will very soon be.
   */
  public get safeExpirationDate ():Date {
    const { millisecondsToExpire, expirationDate } = this;
    const now = new Date();

    const expiresWithinTheMinute = ():boolean => {
      const secondsToExpire = Math.round(millisecondsToExpire / 1000) ;
      if(secondsToExpire > 60) return false;
      return secondsToExpire < (60 - now.getSeconds());
    }

    const expiresInTheNextMinute = ():boolean => {
      const secondsToExpire = Math.round(millisecondsToExpire / 1000);
      return (secondsToExpire <= 120) && ! expiresWithinTheMinute();
    }

    // If the timer expires within the current minute, return the expiration date.
    if(expiresWithinTheMinute()) {
      // Extend the expiration date by two minutes.
      return new Date(expirationDate.getTime() + (PeriodType.MINUTES * 2));
    }

    if(expiresInTheNextMinute()) {
      // Extend the expiration date by one minute.
      return new Date(expirationDate.getTime() + (PeriodType.MINUTES * 1));
    }

    return expirationDate;
  }
  /**
   * @returns The number of milliseconds to timer expiration
   */
  public get millisecondsToExpire ():number {
    return this._milliseconds;
  }

  /**
   * @returns A cron expression that represents the single point in time (non-recurring) of the expiration date.
   */
  public getCronExpression = ():string => {
    const { safeExpirationDate } = this;
    const minutes = safeExpirationDate.getUTCMinutes();
    const hours = safeExpirationDate.getUTCHours();
    const dayOfMonth = safeExpirationDate.getUTCDate();
    const month = safeExpirationDate.getUTCMonth() + 1;  // getUTCMonth() returns 0-based month
    const year = safeExpirationDate.getUTCFullYear();
    return `cron(${minutes} ${hours} ${dayOfMonth} ${month} ? ${year})`;
  }

  /**
   * Run the a function that begins with some kind of delay (await) and ends with execution.
   * @param run 
   */
  public startTimer = async (run:Function):Promise<void> => {
    await run();
  }

  public static fromCronExpression = (cronExpression:string):Date => {
    const matches = cronExpression.match(/^cron\((.*)\)$/);
    if(matches) {
      cronExpression = matches[1];
    }
    const parts = cronExpression.split(' ');
    if(parts.length != 6) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }
    let [ minutes, hours, dayOfMonth, month, dayOfWeek, year ] = parts;
    const seconds = '00';
    if(minutes.length == 1) minutes = `0${minutes}`;  // Ensure two digits
    if(hours.length == 1) hours = `0${hours}`;  // Ensure two digits
    if(dayOfMonth.length == 1) dayOfMonth = `0${dayOfMonth}`;  // Ensure two digits
    if(month.length == 1) month = `0${month}`;  // Ensure two digits
    const isoDate = `${year}-${month}-${dayOfMonth}T${hours}:${minutes}:${seconds}.000Z`;
    return new Date(isoDate);
  }
}


const { argv:args } = process;
if(args.length > 1 && args[1].replace(/\\/g, '/').endsWith('lib/lambda/timer/EggTimer.ts')) {
  const date = EggTimer.fromCronExpression('cron(35 20 8 2 ? 2025)');
  console.log(date);
  const millisecondsRemain = date.getTime() - Date.now();
  console.log(humanReadableFromMilliseconds(millisecondsRemain));

  console.log(EggTimer.getInstanceSetFor(0, PeriodType.SECONDS).getCronExpression());

  console.log(EggTimer.getInstanceSetFor(15, PeriodType.SECONDS).getCronExpression());
}
