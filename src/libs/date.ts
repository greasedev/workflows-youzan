function getLocalDateAtTime(date: Date, hours: number, minutes: number, seconds: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, seconds, 0);
}

function toTimestamp(date: Date): number {
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
