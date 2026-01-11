// ★修正: 個別のモジュールを直接インポートして型エラーを回避
import AES from 'crypto-js/aes';
import encUtf8 from 'crypto-js/enc-utf8';
import * as OTPAuth from 'otpauth';

// --- 暗号化ヘルパー ---

// データをマスターパスワードで暗号化する
export const encryptData = (data: any, masterPass: string) => {
  // CryptoJS.AES ではなく AES を直接使う
  return AES.encrypt(JSON.stringify(data), masterPass).toString();
};

// データをマスターパスワードで復号する
export const decryptData = (ciphertext: string, masterPass: string) => {
  try {
    const bytes = AES.decrypt(ciphertext, masterPass);
    const decryptedString = bytes.toString(encUtf8);
    
    if (!decryptedString) return null;
    
    const decryptedData = JSON.parse(decryptedString);
    return decryptedData;
  } catch (e) {
    return null; 
  }
};

// --- 2FA (TOTP) ヘルパー ---

export const generateTotpSecret = () => {
  return new OTPAuth.Secret({ size: 20 });
};

export const getTotpUri = (secret: OTPAuth.Secret, accountName: string) => {
  const totp = new OTPAuth.TOTP({
    issuer: 'NasukoWallet',
    label: accountName,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secret,
  });
  return totp.toString();
};

export const verifyTotp = (token: string, secretStr: string) => {
  const secret = OTPAuth.Secret.fromBase32(secretStr);
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secret,
  });
  
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
};