import crypto from "node:crypto";

export function generateEditToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function generateOtpCode() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

export function nowPlusMinutes(minutes) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

export function isExpired(dateLike) {
  return new Date(dateLike).getTime() <= Date.now();
}
