function getLocalDateAtTime(date: Date, hours: number, minutes: number, seconds: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, seconds, 0);
}

export function toTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function getYesterday(referenceDate = new Date(Date.now())): Date {
  const yesterday = new Date(referenceDate);
  yesterday.setDate(referenceDate.getDate() - 1);
  return yesterday;
}

export function getYesterdayStartTimestamp(referenceDate = new Date(Date.now())): number {
  return toTimestamp(getLocalDateAtTime(getYesterday(referenceDate), 0, 0, 0));
}

export function getYesterdayEndTimestamp(referenceDate = new Date(Date.now())): number {
  return toTimestamp(getLocalDateAtTime(getYesterday(referenceDate), 23, 59, 59));
}

export function getYesterdayDateString(referenceDate = new Date(Date.now())): string {
  return formatDate(toTimestamp(getYesterday(referenceDate)));
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function addDaysToDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDate(toTimestamp(date));
}

export function compareDateStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

/**
 * 获取前一天的开始和结束时间
 * @returns {startTime: string, endTime: string} 格式为 "2026-04-30 00:00:00"
 */
export function getYesterdayRange(referenceDate = new Date(Date.now())): { startTime: string; endTime: string } {
  return {
    startTime: formatDateTime(getYesterdayStartTimestamp(referenceDate)),
    endTime: formatDateTime(getYesterdayEndTimestamp(referenceDate)),
  };
}

/**
 * 格式化时间戳为日期时间字符串
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化可选时间戳
 */
export function formatOptionalDate(timestamp?: number): string {
  return timestamp ? formatDate(timestamp) : "-";
}
