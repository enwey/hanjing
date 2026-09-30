export function validateProduct(input) {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 255) return '商品名称不能为空且不能超过255字';
  for (const key of ['price', 'stock']) {
    const value = input[key];
    if (value === null || value === '' || !['number', 'string'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) < (key === 'price' ? 1 : 0) || Number(value) > 2147483647) return '价格必须为正整数分，库存必须为非负整数';
  }
  if (input.original_price !== null && input.original_price !== undefined && input.original_price !== '' && (!Number.isSafeInteger(Number(input.original_price)) || Number(input.original_price) < 0 || Number(input.original_price) > 2147483647)) return '原价必须为非负整数分';
  const rates = [input.commission_rate_level1 ?? input.commission_rate ?? 0, input.commission_rate_level2 ?? 0];
  if (rates.some(v => v === '' || !['number', 'string'].includes(typeof v) || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 99.99 || Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) > 1e-8) || rates.reduce((a, b) => a + Number(b), 0) > 100) return '佣金比例必须在0至99.99之间，最多两位小数，两级合计不能超过100%';
  if (input.status !== undefined && !['on', 'off'].includes(input.status)) return '商品状态无效';
  return '';
}
