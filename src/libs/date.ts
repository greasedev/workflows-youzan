/**
 * 获取前一天的开始和结束时间
 * @returns {startTime: string, endTime: string} 格式为 "2026-04-30 00:00:00"
 */
export function getYesterdayRange(): { startTime: string; endTime: string } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');

  return {
    startTime: `${year}-${month}-${day} 00:00:00`,
    endTime: `${year}-${month}-${day} 23:59:59`,
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