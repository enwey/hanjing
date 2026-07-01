import crypto from 'crypto';

const WEIGHTS = [7, 3, 1, 9, 7, 3, 1, 9, 7, 3];

export const createPatientNoCandidate = () => {
  const digits = Array.from({ length: 10 }, () => crypto.randomInt(0, 10)).join('');
  const checksum = digits
    .split('')
    .reduce((sum, digit, index) => sum + Number(digit) * WEIGHTS[index], 0) % 10;
  return `HJ${digits}${checksum}`;
};

export const generateUniquePatientNo = async (exists) => {
  for (let i = 0; i < 20; i += 1) {
    const candidate = createPatientNoCandidate();
    if (!await exists(candidate)) return candidate;
  }
  throw new Error('生成病历号失败，请重试');
};
